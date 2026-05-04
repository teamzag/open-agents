import {
  requireAuthenticatedUser,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import { getResumableSandboxName, isSandboxActive } from "@/lib/sandbox/utils";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export type RemoteAccessResponse = {
  sandboxName: string;
  cmuxCommand: string;
};

function assertCommandSafeSandboxName(value: string): string {
  if (/^[A-Za-z0-9_.-]+$/.test(value)) {
    return value;
  }

  throw new Error(`Sandbox name cannot be used in a shell command: ${value}`);
}

export async function POST(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId } = await context.params;

  try {
    const sessionContext = await requireOwnedSessionWithSandboxGuard({
      userId: authResult.userId,
      sessionId,
      sandboxGuard: isSandboxActive,
      sandboxErrorMessage: "Resume the sandbox before copying remote commands",
      sandboxErrorStatus: 409,
    });
    if (!sessionContext.ok) {
      return sessionContext.response;
    }

    const sandboxName = getResumableSandboxName(
      sessionContext.sessionRecord.sandboxState,
    );
    if (!sandboxName) {
      return Response.json(
        { error: "Sandbox does not expose a remote access name" },
        { status: 409 },
      );
    }

    const safeSandboxName = assertCommandSafeSandboxName(sandboxName);

    return Response.json({
      sandboxName: safeSandboxName,
      cmuxCommand: `zag-computer ${safeSandboxName}`,
    } satisfies RemoteAccessResponse);
  } catch (error) {
    console.error("Failed to prepare remote access commands:", error);
    return Response.json(
      { error: "Failed to prepare remote access commands" },
      { status: 500 },
    );
  }
}
