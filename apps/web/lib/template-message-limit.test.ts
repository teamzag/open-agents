import { afterEach, describe, expect, test } from "bun:test";
import {
  getNonVercelMessageLimit,
  getTemplateMessageLimitState,
  isTemplateMessageLimitExempt,
} from "./template-message-limit";

const originalNonVercelMessageLimit = process.env.NON_VERCEL_MESSAGE_LIMIT;

afterEach(() => {
  if (originalNonVercelMessageLimit === undefined) {
    delete process.env.NON_VERCEL_MESSAGE_LIMIT;
  } else {
    process.env.NON_VERCEL_MESSAGE_LIMIT = originalNonVercelMessageLimit;
  }
});

describe("template message limit", () => {
  test("defaults to five messages", () => {
    delete process.env.NON_VERCEL_MESSAGE_LIMIT;

    expect(getNonVercelMessageLimit()).toBe(5);
  });

  test("can be disabled with 0", () => {
    process.env.NON_VERCEL_MESSAGE_LIMIT = "0";

    expect(getNonVercelMessageLimit()).toBeNull();
    expect(
      getTemplateMessageLimitState({
        email: "user@example.com",
        usedMessages: 999,
      }),
    ).toBeNull();
  });

  test("treats vercel.com emails as exempt", () => {
    delete process.env.NON_VERCEL_MESSAGE_LIMIT;

    expect(isTemplateMessageLimitExempt("User@Vercel.com")).toBe(true);
    expect(
      getTemplateMessageLimitState({
        email: "user@vercel.com",
        usedMessages: 999,
      }),
    ).toBeNull();
  });

  test("computes remaining messages for non-Vercel users", () => {
    delete process.env.NON_VERCEL_MESSAGE_LIMIT;

    expect(
      getTemplateMessageLimitState({
        email: "user@example.com",
        usedMessages: 4,
      }),
    ).toEqual({
      limit: 5,
      remaining: 1,
      reached: false,
    });
    expect(
      getTemplateMessageLimitState({
        email: "user@example.com",
        usedMessages: 5,
      }),
    ).toEqual({
      limit: 5,
      remaining: 0,
      reached: true,
    });
  });
});
