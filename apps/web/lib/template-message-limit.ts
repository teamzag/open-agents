const DEFAULT_NON_VERCEL_MESSAGE_LIMIT = 5;
const EXEMPT_EMAIL_DOMAIN = "vercel.com";

function getEmailDomain(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const trimmedEmail = email.trim().toLowerCase();
  const atIndex = trimmedEmail.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmedEmail.length - 1) {
    return null;
  }

  return trimmedEmail.slice(atIndex + 1);
}

export function getNonVercelMessageLimit(): number | null {
  const rawLimit = process.env.NON_VERCEL_MESSAGE_LIMIT;
  if (!rawLimit || rawLimit.trim().length === 0) {
    return DEFAULT_NON_VERCEL_MESSAGE_LIMIT;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsedLimit)) {
    return DEFAULT_NON_VERCEL_MESSAGE_LIMIT;
  }

  return parsedLimit > 0 ? parsedLimit : null;
}

export function isTemplateMessageLimitExempt(
  email: string | null | undefined,
): boolean {
  return getEmailDomain(email) === EXEMPT_EMAIL_DOMAIN;
}

export function getTemplateMessageLimitState({
  email,
  usedMessages,
}: {
  email: string | null | undefined;
  usedMessages: number;
}): {
  limit: number;
  remaining: number;
  reached: boolean;
} | null {
  const limit = getNonVercelMessageLimit();
  if (limit === null || isTemplateMessageLimitExempt(email)) {
    return null;
  }

  const normalizedUsedMessages = Math.max(0, Math.floor(usedMessages));
  const remaining = Math.max(limit - normalizedUsedMessages, 0);

  return {
    limit,
    remaining,
    reached: normalizedUsedMessages >= limit,
  };
}
