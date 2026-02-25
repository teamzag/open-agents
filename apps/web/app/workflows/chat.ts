import {
  type LanguageModelUsage,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWritable } from "workflow";

export interface DurableAgentCallOptions {
  sandboxConfig: unknown;
  approval: unknown;
  modelConfig?: unknown;
  subagentModelConfig?: unknown;
  customInstructions?: string;
  executionMode?: "normal" | "durable";
  skills?: unknown[];
}

export interface ChatWorkflowResult {
  responseMessage: UIMessage | null;
  totalMessageUsage?: LanguageModelUsage;
}

export async function runDurableChatWorkflow(
  messages: ModelMessage[],
  options: DurableAgentCallOptions,
): Promise<ChatWorkflowResult> {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  const result = await runChatStep(messages, writable, options);

  await closeStream(writable);

  return result;
}

async function runChatStep(
  messages: ModelMessage[],
  writable: WritableStream<UIMessageChunk>,
  callOptions: DurableAgentCallOptions,
): Promise<ChatWorkflowResult> {
  "use step";

  const { webAgent } = await import("@/app/config");

  let responseMessage: UIMessage | null = null;

  const result = await webAgent.stream({
    messages,
    options: {
      ...callOptions,
      executionMode: "durable",
    } as never,
  });

  const stream = result.toUIMessageStream<UIMessage>({
    onFinish: ({ responseMessage: finishedMessage }) => {
      responseMessage = finishedMessage;
    },
  });

  const reader = stream.getReader();
  const writer = writable.getWriter();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      await writer.write(value);
    }
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }

  let totalMessageUsage: LanguageModelUsage | undefined;
  try {
    totalMessageUsage = await result.usage;
  } catch (error) {
    console.error("Failed to read durable chat usage:", error);
  }

  return {
    responseMessage,
    totalMessageUsage,
  };
}

async function closeStream(writable: WritableStream<UIMessageChunk>) {
  "use step";

  await writable.close();
}
