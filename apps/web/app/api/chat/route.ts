import { createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { getRun, start } from "workflow/api";
import type { WebAgentUIMessage, WebAgentUIMessageChunk } from "@/app/types";
import {
  type RunAgentWorkflowResult,
  runAgent,
} from "@/app/workflows/run-agent";
import { getWorkflowRunReadableStream } from "@/lib/chat/get-workflow-run-readable-stream";
import { runAutoCommitInBackground } from "@/lib/chat-auto-commit";
import {
  compareAndSetChatActiveStreamId,
  createChatMessageIfNotExists,
  getChatById,
  getSessionById,
  isFirstChatMessage,
  touchChat,
  updateChat,
  updateChatAssistantActivity,
  updateSession,
  upsertChatMessageScoped,
} from "@/lib/db/sessions";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { buildActiveLifecycleUpdate } from "@/lib/sandbox/lifecycle";
import { isSandboxActive } from "@/lib/sandbox/utils";
import { getServerSession } from "@/lib/session/get-server-session";

interface ChatCompactionContextPayload {
  contextLimit?: number;
  lastInputTokens?: number;
}

interface ChatRequestBody {
  messages: WebAgentUIMessage[];
  sessionId?: string;
  chatId?: string;
  context?: ChatCompactionContextPayload;
}

export const maxDuration = 800;

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, sessionId, chatId, context } = body;

  if (!sessionId || !chatId) {
    return Response.json(
      { error: "sessionId and chatId are required" },
      { status: 400 },
    );
  }

  const [sessionRecord, chat] = await Promise.all([
    getSessionById(sessionId),
    getChatById(chatId),
  ]);

  if (!sessionRecord) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  if (sessionRecord.userId !== session.user.id) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (!chat || chat.sessionId !== sessionId) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }
  if (!isSandboxActive(sessionRecord.sandboxState)) {
    return Response.json({ error: "Sandbox not initialized" }, { status: 400 });
  }

  const activityAt = new Date();
  await updateSession(sessionId, {
    ...buildActiveLifecycleUpdate(sessionRecord.sandboxState, {
      activityAt,
    }),
  });

  const pendingAssistantSnapshot = await persistLatestRequestMessage({
    chatId,
    messages,
  });

  const run = await start(runAgent, [
    messages,
    {
      sessionId,
      chatId,
      userId: session.user.id,
      context,
    },
  ]);

  const claimedRun = await claimActiveWorkflowRun(chatId, run.runId);
  if (!claimedRun) {
    await getRun(run.runId)
      .cancel()
      .catch(() => {});
    return Response.json(
      { error: "Chat is already streaming" },
      { status: 409 },
    );
  }

  if (pendingAssistantSnapshot) {
    await persistAssistantSnapshot(chatId, pendingAssistantSnapshot);
  }

  const preferences = await getUserPreferences(session.user.id).catch(
    (error) => {
      console.error("Failed to load user preferences:", error);
      return null;
    },
  );

  after(
    waitForWorkflowCompletion({
      request: req,
      runId: run.runId,
      sessionId,
      chatId,
      preferences,
      sessionTitle: sessionRecord.title,
      cloneUrl: sessionRecord.cloneUrl,
      repoOwner: sessionRecord.repoOwner,
      repoName: sessionRecord.repoName,
    }),
  );

  const stream = await getWorkflowRunReadableStream<WebAgentUIMessageChunk>(
    run.runId,
  );

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "x-workflow-run-id": run.runId,
    },
  });
}

async function persistLatestRequestMessage({
  chatId,
  messages,
}: {
  chatId: string;
  messages: WebAgentUIMessage[];
}) {
  const latestMessage = messages[messages.length - 1];
  if (
    !latestMessage ||
    (latestMessage.role !== "user" && latestMessage.role !== "assistant") ||
    typeof latestMessage.id !== "string" ||
    latestMessage.id.length === 0
  ) {
    return null;
  }

  try {
    if (latestMessage.role === "assistant") {
      return latestMessage;
    }

    const createdUserMessage = await createChatMessageIfNotExists({
      id: latestMessage.id,
      chatId,
      role: "user",
      parts: latestMessage,
    });

    if (createdUserMessage) {
      await touchChat(chatId);
    }

    const shouldSetTitle =
      createdUserMessage !== undefined &&
      (await isFirstChatMessage(chatId, createdUserMessage.id));

    if (shouldSetTitle) {
      const textContent = latestMessage.parts
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text",
        )
        .map((part) => part.text)
        .join(" ")
        .trim();

      if (textContent.length > 0) {
        const title =
          textContent.length > 30
            ? `${textContent.slice(0, 30)}...`
            : textContent;
        await updateChat(chatId, { title });
      }
    }
  } catch (error) {
    console.error("Failed to save latest chat message:", error);
  }

  return null;
}

async function persistAssistantSnapshot(
  chatId: string,
  assistantMessage: WebAgentUIMessage,
) {
  try {
    const upsertResult = await upsertChatMessageScoped({
      id: assistantMessage.id,
      chatId,
      role: "assistant",
      parts: assistantMessage,
    });

    if (upsertResult.status === "conflict") {
      console.warn(
        `Skipped assistant message upsert due to ID scope conflict: ${assistantMessage.id}`,
      );
      return;
    }

    if (upsertResult.status === "inserted") {
      await updateChatAssistantActivity(chatId, new Date());
    }
  } catch (error) {
    console.error("Failed to save latest assistant snapshot:", error);
  }
}

async function claimActiveWorkflowRun(chatId: string, runId: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const latestChat = await getChatById(chatId);
    if (!latestChat) {
      return false;
    }

    const activeStreamId = latestChat.activeStreamId;
    const canReplace = await canReplaceActiveStream(activeStreamId);
    if (!canReplace) {
      return false;
    }

    const claimed = await compareAndSetChatActiveStreamId(
      chatId,
      activeStreamId,
      runId,
    );
    if (claimed) {
      return true;
    }
  }

  return false;
}

async function canReplaceActiveStream(activeStreamId: string | null) {
  if (!activeStreamId) {
    return true;
  }
  if (!isWorkflowRunId(activeStreamId)) {
    return true;
  }

  try {
    const status = await getRun(activeStreamId).status;
    return (
      status === "completed" || status === "failed" || status === "cancelled"
    );
  } catch {
    return true;
  }
}

function isWorkflowRunId(value: string) {
  return value.startsWith("wrun_");
}

async function waitForWorkflowCompletion({
  request,
  runId,
  sessionId,
  chatId,
  preferences,
  sessionTitle,
  cloneUrl,
  repoOwner,
  repoName,
}: {
  request: Request;
  runId: string;
  sessionId: string;
  chatId: string;
  preferences: Awaited<ReturnType<typeof getUserPreferences>> | null;
  sessionTitle: string;
  cloneUrl: string | null;
  repoOwner: string | null;
  repoName: string | null;
}) {
  try {
    const result = await getRun<RunAgentWorkflowResult>(runId).returnValue;
    if (!result.stillOwnsRun) {
      return;
    }

    await refreshCachedDiff(request, sessionId);

    if (
      result.completedNaturally &&
      preferences?.autoCommitPush &&
      cloneUrl &&
      repoOwner &&
      repoName
    ) {
      const cookieHeader = request.headers.get("cookie");
      if (!cookieHeader) {
        return;
      }

      await runAutoCommitInBackground({
        requestUrl: request.url,
        cookieHeader,
        sessionId,
        sessionTitle,
        repoOwner,
        repoName,
      });
    }
  } catch (error) {
    await clearFailedWorkflowRun(chatId, runId);
    console.error(
      `[chat] Failed to monitor workflow completion for session ${sessionId}:`,
      error,
    );
  }
}

async function clearFailedWorkflowRun(chatId: string, runId: string) {
  try {
    await compareAndSetChatActiveStreamId(chatId, runId, null);
  } catch (error) {
    console.error(
      `[chat] Failed to clear active workflow run ${runId} for chat ${chatId}:`,
      error,
    );
  }
}

async function refreshCachedDiff(request: Request, sessionId: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return;
  }

  const diffUrl = new URL(`/api/sessions/${sessionId}/diff`, request.url);
  const response = await fetch(diffUrl, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.warn(
      `[chat] Failed to refresh cached diff for session ${sessionId}: ${response.status}`,
    );
  }
}
