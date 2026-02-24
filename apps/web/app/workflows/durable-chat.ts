import type { ModelMessage, UIMessageChunk } from "ai";
import { getWritable } from "workflow";
import type { SerializableDurableCallOptions } from "@open-harness/agent";

/**
 * Durable chat workflow that runs the agent inside the Workflow framework.
 *
 * Called via `start(durableChatWorkflow, [messages, callOptions])` from the
 * `/api/chat-durable` route. The workflow writes `UIMessageChunk`s to a
 * writable stream that the client reads via `WorkflowChatTransport`.
 *
 * The actual agent execution is isolated inside {@link runAgentStep} (a
 * `"use step"` function) so that the workflow bundler does not pull Node.js
 * module dependencies (e.g. `path`, `fs`) into the workflow runtime.
 *
 * IMPORTANT: `callOptions` must be JSON-serializable because the workflow
 * framework serializes its arguments. Use {@link SerializableDurableCallOptions}
 * instead of passing live Sandbox / LanguageModel instances.
 */
export async function durableChatWorkflow(
  messages: ModelMessage[],
  callOptions: SerializableDurableCallOptions,
) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();
  const result = await runAgentStep(messages, callOptions, writable);

  return {
    messages: result.messages,
  };
}

/**
 * Step function that constructs and runs the durable agent.
 *
 * By marking this as `"use step"`, the workflow compiler bundles it
 * separately for the Node.js runtime, allowing full access to Node.js
 * built-in modules used by the agent tools.
 *
 * This step reconstructs the non-serializable Sandbox and LanguageModel
 * instances from the serializable call options before running the agent.
 */
async function runAgentStep(
  messages: ModelMessage[],
  callOptions: SerializableDurableCallOptions,
  writable: WritableStream<UIMessageChunk>,
) {
  "use step";

  const { DurableAgent } = await import("@workflow/ai/agent");
  const { prepareDurableCall, reconstituteDurableCallOptions } = await import(
    "@open-harness/agent"
  );

  // Reconstruct live Sandbox + LanguageModel instances from serializable data
  const fullCallOptions = await reconstituteDurableCallOptions(callOptions);

  const { agentOptions, streamOptions } = prepareDurableCall(fullCallOptions);
  const agent = new DurableAgent(agentOptions);

  return agent.stream({
    messages,
    writable,
    ...streamOptions,
  });
}
