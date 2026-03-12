import { beforeEach, describe, expect, mock, test } from "bun:test";

interface TestSessionRecord {
  userId: string;
}

interface TestChatRecord {
  sessionId: string;
  activeStreamId: string | null;
}

let sessionRecord: TestSessionRecord | null;
let chatRecord: TestChatRecord | null;
const clearedStreamIds: Array<string | null> = [];
const backgroundTasks: Promise<void>[] = [];
let getWorkflowRunReadableStreamImpl = async (_runId: string) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });

mock.module("next/server", () => ({
  after: (task: Promise<unknown> | (() => Promise<unknown>)) => {
    const promise =
      typeof task === "function"
        ? Promise.resolve(task())
        : Promise.resolve(task);
    backgroundTasks.push(promise.then(() => undefined));
  },
}));

mock.module("workflow/api", () => ({
  getRun: (runId: string) => ({
    status: Promise.resolve(
      runId === "wrun_cancelled" ? "cancelled" : "running",
    ),
  }),
}));

mock.module("@/lib/db/sessions", () => ({
  getChatById: async () => chatRecord,
  getSessionById: async () => sessionRecord,
  updateChatActiveStreamId: async (
    _chatId: string,
    streamId: string | null,
  ) => {
    clearedStreamIds.push(streamId);
  },
}));

mock.module("@/lib/chat/get-workflow-run-readable-stream", () => ({
  getWorkflowRunReadableStream: (runId: string) =>
    getWorkflowRunReadableStreamImpl(runId),
}));

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => ({
    user: { id: "user-1" },
  }),
}));

const routeModulePromise = import("./route");

describe("/api/chat/[chatId]/stream", () => {
  beforeEach(() => {
    sessionRecord = { userId: "user-1" };
    chatRecord = {
      sessionId: "session-1",
      activeStreamId: "wrun_active",
    };
    getWorkflowRunReadableStreamImpl = async (_runId: string) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        },
      });
    clearedStreamIds.length = 0;
    backgroundTasks.length = 0;
  });

  test("clears legacy activeStreamId values", async () => {
    chatRecord = {
      sessionId: "session-1",
      activeStreamId: "1680000000:legacy-token",
    };

    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("http://localhost/api/chat/chat-1/stream"),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    await Promise.all(backgroundTasks);

    expect(response.status).toBe(204);
    expect(clearedStreamIds).toEqual([null]);
  });

  test("returns a terminal finish stream for cancelled runs", async () => {
    chatRecord = {
      sessionId: "session-1",
      activeStreamId: "wrun_cancelled",
    };

    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("http://localhost/api/chat/chat-1/stream"),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    const body = await response.text();
    expect(response.ok).toBe(true);
    expect(body).toContain('"finishReason":"stop"');
  });

  test("returns idle and clears stale workflow ids when the workflow stream is missing", async () => {
    chatRecord = {
      sessionId: "session-1",
      activeStreamId: "wrun_missing",
    };
    getWorkflowRunReadableStreamImpl = async () => {
      throw new Error("stream missing");
    };

    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("http://localhost/api/chat/chat-1/stream"),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    await Promise.all(backgroundTasks);

    expect(response.status).toBe(204);
    expect(clearedStreamIds).toEqual([null]);
  });

  test("validates startIndex", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("http://localhost/api/chat/chat-1/stream?startIndex=nope"),
      { params: Promise.resolve({ chatId: "chat-1" }) },
    );

    expect(response.status).toBe(400);
  });
});
