import { createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { getRun } from "workflow/api";
import type { WebAgentUIMessageChunk } from "@/app/types";
import { getWorkflowRunReadableStream } from "@/lib/chat/get-workflow-run-readable-stream";
import {
  getChatById,
  getSessionById,
  updateChatActiveStreamId,
} from "@/lib/db/sessions";
import { getServerSession } from "@/lib/session/get-server-session";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { chatId } = await context.params;
  const chat = await getChatById(chatId);
  if (!chat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const sessionRecord = await getSessionById(chat.sessionId);
  if (!sessionRecord || sessionRecord.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!chat.activeStreamId) {
    return new Response(null, { status: 204 });
  }

  if (!isWorkflowRunId(chat.activeStreamId)) {
    after(async () => {
      await updateChatActiveStreamId(chatId, null);
    });
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const startIndex = parseStartIndex(searchParams.get("startIndex"));
  if (startIndex === "invalid") {
    return Response.json(
      { error: "startIndex must be a non-negative integer" },
      { status: 400 },
    );
  }

  try {
    const run = getRun(chat.activeStreamId);
    const status = await run.status;
    if (status === "cancelled") {
      return createUIMessageStreamResponse({
        stream: createTerminalFinishStream("stop"),
      });
    }

    const stream = await getWorkflowRunReadableStream<WebAgentUIMessageChunk>(
      chat.activeStreamId,
      startIndex === undefined ? {} : { startIndex },
    );

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.warn(
      `[chat] Failed to resume workflow stream ${chat.activeStreamId} for chat ${chatId}; clearing stale activeStreamId`,
      error,
    );
    clearActiveStreamIdInBackground(chatId);
    return new Response(null, { status: 204 });
  }
}

function clearActiveStreamIdInBackground(chatId: string) {
  after(async () => {
    await updateChatActiveStreamId(chatId, null);
  });
}

function parseStartIndex(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return "invalid";
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return "invalid";
  }

  return parsed;
}

function isWorkflowRunId(value: string) {
  return value.startsWith("wrun_");
}

function createTerminalFinishStream(finishReason: "stop") {
  return new ReadableStream<WebAgentUIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "finish", finishReason });
      controller.close();
    },
  });
}
