import type { LanguageModelUsage } from "ai";
import { estimateModelUsageCost, type AvailableModelCost } from "@/lib/models";
import type { WebAgentCostEstimate } from "@/app/types";

/**
 * Normalize a `LanguageModelUsage` into the shape `estimateModelUsageCost`
 * expects. Falls back to `inputTokenDetails.cacheReadTokens` when the
 * top-level `cachedInputTokens` is absent (some providers only populate the
 * nested shape).
 */
function getUsageTotals(usage: LanguageModelUsage) {
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens:
      usage.cachedInputTokens ?? usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

/**
 * Build a {@link WebAgentCostEstimate} from token usage and model pricing.
 * Returns `undefined` when either the usage is missing or pricing is not
 * available for the model, so callers can omit the field from metadata.
 */
export function buildCostEstimate(
  usage: LanguageModelUsage | undefined,
  cost: AvailableModelCost | undefined,
  modelId: string,
  pricedAt: string,
): WebAgentCostEstimate | undefined {
  if (!usage) {
    return undefined;
  }

  const amount = estimateModelUsageCost(getUsageTotals(usage), cost);
  if (amount === undefined) {
    return undefined;
  }

  return {
    amount,
    currency: "USD",
    pricingSource: "models.dev",
    pricedAt,
    modelId,
  };
}
