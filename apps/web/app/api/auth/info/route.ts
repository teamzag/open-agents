import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getGitHubAccount } from "@/lib/db/accounts";
import { countUserMessagesByUserId } from "@/lib/db/sessions";
import { getInstallationsByUserId } from "@/lib/db/installations";
import { userExists } from "@/lib/db/users";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { getSessionFromReq } from "@/lib/session/server";
import type { SessionUserInfo } from "@/lib/session/types";
import { getTemplateMessageLimitState } from "@/lib/template-message-limit";

const UNAUTHENTICATED: SessionUserInfo = { user: undefined };

export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);

  if (!session?.user?.id) {
    return Response.json(UNAUTHENTICATED);
  }

  const templateMessageLimitState = getTemplateMessageLimitState({
    email: session.user.email,
    usedMessages: 0,
  });

  // Run the user-existence check in parallel with the GitHub queries
  // so there is zero added latency on the happy path.
  const [exists, ghAccount, installations, userMessageCount] =
    await Promise.all([
      userExists(session.user.id),
      getGitHubAccount(session.user.id),
      getInstallationsByUserId(session.user.id),
      templateMessageLimitState
        ? countUserMessagesByUserId(session.user.id)
        : Promise.resolve(0),
    ]);

  // The session cookie (JWE) is self-contained and can outlive the user record.
  // If the user no longer exists, clear the stale cookie.
  if (!exists) {
    const store = await cookies();
    store.delete(SESSION_COOKIE_NAME);
    return Response.json(UNAUTHENTICATED);
  }

  const hasGitHubAccount = ghAccount !== null;
  const hasGitHubInstallations = installations.length > 0;
  const hasGitHub = hasGitHubAccount || hasGitHubInstallations;
  const resolvedTemplateMessageLimit = getTemplateMessageLimitState({
    email: session.user.email,
    usedMessages: userMessageCount,
  });

  const data: SessionUserInfo = {
    user: session.user,
    authProvider: session.authProvider,
    hasGitHub,
    hasGitHubAccount,
    hasGitHubInstallations,
    templateMessageLimit: resolvedTemplateMessageLimit
      ? {
          limit: resolvedTemplateMessageLimit.limit,
          remaining: resolvedTemplateMessageLimit.remaining,
        }
      : undefined,
  };

  return Response.json(data);
}
