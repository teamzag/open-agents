import type {
  DynamicToolUIPart,
  FinishReason,
  InferUITools,
  LanguageModelUsage,
  ToolUIPart,
  UIMessage,
} from "ai";
import type { webAgent } from "./config";

export type WebAgent = typeof webAgent;
export type WebAgentCallOptions = Parameters<
  WebAgent["generate"]
>["0"]["options"];

export type WebAgentStepFinishMetadata = {
  finishReason: FinishReason;
  rawFinishReason?: string;
};

/**
 * Estimated cost for a language-model call, computed at workflow time from
 * token usage and the pricing data available at that moment. The estimate is
 * embedded on the message so historical cost remains stable even if upstream
 * pricing or the user's selected model changes later.
 */
export type WebAgentCostEstimate = {
  /** Estimated amount in `currency`. */
  amount: number;
  /** ISO 4217 currency code. Always `"USD"` today. */
  currency: "USD";
  /** Where the pricing data was sourced from. */
  pricingSource: "models.dev";
  /** ISO 8601 timestamp when pricing was fetched. */
  pricedAt: string;
  /** Model id the estimate was computed for. */
  modelId: string;
};

export type WebAgentMessageMetadata = {
  selectedModelId?: string;
  modelId?: string;
  lastStepUsage?: LanguageModelUsage;
  totalMessageUsage?: LanguageModelUsage;
  /** Estimated cost of the most recent step, based on `lastStepUsage`. */
  lastStepCost?: WebAgentCostEstimate;
  /** Estimated cost of the full message so far, based on `totalMessageUsage`. */
  totalMessageCost?: WebAgentCostEstimate;
  lastStepFinishReason?: FinishReason;
  lastStepRawFinishReason?: string;
  stepFinishReasons?: WebAgentStepFinishMetadata[];
};

export type WebAgentGitDataStatus = "pending" | "success" | "error" | "skipped";

export type WebAgentCommitData = {
  status: WebAgentGitDataStatus;
  committed?: boolean;
  pushed?: boolean;
  commitMessage?: string;
  commitSha?: string;
  url?: string;
  error?: string;
};

export type WebAgentPrData = {
  status: WebAgentGitDataStatus;
  created?: boolean;
  syncedExisting?: boolean;
  prNumber?: number;
  url?: string;
  error?: string;
  skipReason?: string;
  requiresManualCreation?: boolean;
};

export type WebAgentSnippetData = {
  content: string;
  filename: string;
};

export type WebAgentDataParts = {
  commit: WebAgentCommitData;
  pr: WebAgentPrData;
  snippet: WebAgentSnippetData;
};

// All types derived from the agent
export type WebAgentTools = WebAgent["tools"];
export type WebAgentUITools = InferUITools<WebAgentTools>;
export type WebAgentUIMessage = UIMessage<
  WebAgentMessageMetadata,
  WebAgentDataParts,
  WebAgentUITools
>;
export type WebAgentUIMessagePart = WebAgentUIMessage["parts"][number];
export type WebAgentCommitDataPart = Extract<
  WebAgentUIMessagePart,
  { type: "data-commit" }
>;
export type WebAgentPrDataPart = Extract<
  WebAgentUIMessagePart,
  { type: "data-pr" }
>;
export type WebAgentSnippetDataPart = Extract<
  WebAgentUIMessagePart,
  { type: "data-snippet" }
>;
export type WebAgentUIToolPart =
  | DynamicToolUIPart
  | ToolUIPart<WebAgentUITools>;
