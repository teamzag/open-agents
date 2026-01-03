/**
 * Model context window limits in tokens.
 * Used to display context usage percentage.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic Claude 4 models
  "claude-opus-4": 200_000,
  "claude-sonnet-4": 200_000,
  "claude-haiku-4": 200_000,
  // Anthropic Claude 3.5 models
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  // Anthropic Claude 3 models
  "claude-3-opus": 200_000,
  "claude-3-sonnet": 200_000,
  "claude-3-haiku": 200_000,
};

export const DEFAULT_CONTEXT_LIMIT = 200_000;

/**
 * Get the context window limit for a model.
 * Supports both exact matches and partial matches (e.g., "anthropic/claude-haiku-4.5").
 */
export function getContextLimit(modelId: string): number {
  // Check for exact match first
  if (MODEL_CONTEXT_LIMITS[modelId]) {
    return MODEL_CONTEXT_LIMITS[modelId];
  }

  // Check for partial matches
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (modelId.toLowerCase().includes(key.toLowerCase())) {
      return limit;
    }
  }

  return DEFAULT_CONTEXT_LIMIT;
}
