import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

interface TestSessionRecord {
  id: string;
  userId: string;
  title: string;
  cloneUrl: string | null;
  repoOwner: string | null;
  repoName: string | null;
  sandboxState: {
    type: "vercel";
  };
}

interface TestChatRecord {
  sessionId: string;
  modelId: string | null;
  activeStreamId: string | null;
}

const autoCommitCalls: Array<Record<string, unknown>> = [];
const backgroundTasks: Promise<void>[] = [];
const fetchCalls: string[] = [];
const compareAndSetCalls: Array<Record<string, unknown>> = [];
const startCalls: Array<Record<string, unknown>> = [];

let sessionRecord: TestSessionRecord;
let chatRecord: TestChatRecord;
let workflowResult = {
  wasAborted: false,
  completedNaturally: true,
  stillOwnsRun: true,
};
let getWorkflowReturnValue = () => Promise.resolve(workflowResult);

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  fetchCalls.push(String(input));
  return new Response("{}", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}) as typeof fetch;

mock.module("next/server", () => ({
  after: (task: Promise<unknown>) => {
    backgroundTasks.push(Promise.resolve(task).then(() => undefined));
  },
}));

mock.module("workflow/api", () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    startCalls.push({ args });
    return { runId: "wrun_test" };
  },
  getRun: (runId: string) => ({
    cancel: async () => {},
    status: Promise.resolve(runId === "wrun_test" ? "running" : "completed"),
    returnValue: getWorkflowReturnValue(),
  }),
}));

mock.module("@/app/workflows/run-agent", () => ({
  runAgent: async () => ({ ...workflowResult }),
}));

mock.module("@/lib/chat/get-workflow-run-readable-stream", () => ({
  getWorkflowRunReadableStream: async () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    }),
}));

mock.module("@/lib/db/sessions", () => ({
  compareAndSetChatActiveStreamId: async (
    chatId: string,
    expected: string | null,
    next: string | null,
  ) => {
    compareAndSetCalls.push({ chatId, expected, next });
    return true;
  },
  createChatMessageIfNotExists: async () => ({ id: "user-1" }),
  getChatById: async () => chatRecord,
  getSessionById: async () => sessionRecord,
  isFirstChatMessage: async () => false,
  touchChat: async () => {},
  updateChat: async () => {},
  updateChatAssistantActivity: async () => {},
  updateChatActiveStreamId: async () => {},
  updateSession: async () => sessionRecord,
  upsertChatMessageScoped: async () => ({ status: "inserted" as const }),
}));

mock.module("@/lib/db/user-preferences", () => ({
  getUserPreferences: async () => ({
    autoCommitPush: true,
    modelVariants: [],
  }),
}));

mock.module("@/lib/chat-auto-commit", () => ({
  runAutoCommitInBackground: async (params: Record<string, unknown>) => {
    autoCommitCalls.push(params);
  },
}));

mock.module("@/lib/sandbox/lifecycle", () => ({
  buildActiveLifecycleUpdate: () => ({}),
}));

mock.module("@/lib/sandbox/utils", () => ({
  isSandboxActive: () => true,
}));

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => ({
    user: {
      id: "user-1",
    },
  }),
}));

const routeModulePromise = import("./route");

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("/api/chat workflow transport", () => {
  beforeEach(() => {
    autoCommitCalls.length = 0;
    backgroundTasks.length = 0;
    fetchCalls.length = 0;
    compareAndSetCalls.length = 0;
    startCalls.length = 0;
    workflowResult = {
      wasAborted: false,
      completedNaturally: true,
      stillOwnsRun: true,
    };
    getWorkflowReturnValue = () => Promise.resolve(workflowResult);

    sessionRecord = {
      id: "session-1",
      userId: "user-1",
      title: "Session title",
      cloneUrl: "https://github.com/acme/repo.git",
      repoOwner: "acme",
      repoName: "repo",
      sandboxState: {
        type: "vercel",
      },
    };

    chatRecord = {
      sessionId: "session-1",
      modelId: null,
      activeStreamId: null,
    };
  });

  test("starts workflow, claims active run, and auto-commits after natural completion", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "session=abc",
        },
        body: JSON.stringify({
          sessionId: "session-1",
          chatId: "chat-1",
          messages: [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "Fix the bug" }],
            },
          ],
        }),
      }),
    );

    await Promise.all(backgroundTasks);

    expect(response.ok).toBe(true);
    expect(response.headers.get("x-workflow-run-id")).toBe("wrun_test");
    expect(startCalls).toHaveLength(1);
    expect(compareAndSetCalls).toEqual([
      { chatId: "chat-1", expected: null, next: "wrun_test" },
    ]);
    expect(fetchCalls).toEqual([
      "http://localhost/api/sessions/session-1/diff",
    ]);
    expect(autoCommitCalls).toHaveLength(1);
    expect(autoCommitCalls[0]).toMatchObject({
      sessionId: "session-1",
      sessionTitle: "Session title",
      repoOwner: "acme",
      repoName: "repo",
    });
  });

  test("refreshes cached diff but skips auto-commit when workflow does not finish naturally", async () => {
    workflowResult = {
      wasAborted: true,
      completedNaturally: false,
      stillOwnsRun: true,
    };
    getWorkflowReturnValue = () => Promise.resolve(workflowResult);

    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "session=abc",
        },
        body: JSON.stringify({
          sessionId: "session-1",
          chatId: "chat-1",
          messages: [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "Fix the bug" }],
            },
          ],
        }),
      }),
    );

    await Promise.all(backgroundTasks);

    expect(response.ok).toBe(true);
    expect(fetchCalls).toEqual([
      "http://localhost/api/sessions/session-1/diff",
    ]);
    expect(autoCommitCalls).toHaveLength(0);
  });

  test("clears the claimed workflow run when monitoring sees a workflow failure", async () => {
    getWorkflowReturnValue = () => Promise.reject(new Error("workflow failed"));

    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "session=abc",
        },
        body: JSON.stringify({
          sessionId: "session-1",
          chatId: "chat-1",
          messages: [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "Fix the bug" }],
            },
          ],
        }),
      }),
    );

    await Promise.all(backgroundTasks);

    expect(response.ok).toBe(true);
    expect(compareAndSetCalls).toEqual([
      { chatId: "chat-1", expected: null, next: "wrun_test" },
      { chatId: "chat-1", expected: "wrun_test", next: null },
    ]);
    expect(fetchCalls).toHaveLength(0);
    expect(autoCommitCalls).toHaveLength(0);
  });
});
