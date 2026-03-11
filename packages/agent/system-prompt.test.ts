import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "./system-prompt";

const CLAUDE_OVERLAY_HEADER = "# Task Management (Claude-specific)";
const GPT_OVERLAY_HEADER = "# Autonomous Completion (GPT-specific)";
const GEMINI_OVERLAY_HEADER = "# Conciseness (Gemini-specific)";
const OTHER_OVERLAY_HEADER = "# Completion (Model-specific)";

const ALL_OVERLAY_HEADERS = [
  CLAUDE_OVERLAY_HEADER,
  GPT_OVERLAY_HEADER,
  GEMINI_OVERLAY_HEADER,
  OTHER_OVERLAY_HEADER,
];

function expectOnlyOverlay(prompt: string, expectedOverlay: string) {
  expect(prompt).toContain(expectedOverlay);

  for (const overlay of ALL_OVERLAY_HEADERS) {
    if (overlay === expectedOverlay) {
      continue;
    }

    expect(prompt).not.toContain(overlay);
  }
}

describe("buildSystemPrompt model-family overlays", () => {
  test("uses the Claude overlay for claude model IDs", () => {
    const prompt = buildSystemPrompt({ modelId: "anthropic/claude-haiku-4.5" });
    expectOnlyOverlay(prompt, CLAUDE_OVERLAY_HEADER);
  });

  test("uses the GPT overlay for gpt-* model IDs", () => {
    const prompt = buildSystemPrompt({ modelId: "openai/gpt-5.3-codex" });
    expectOnlyOverlay(prompt, GPT_OVERLAY_HEADER);
  });

  test("uses the GPT overlay for o-series model IDs", () => {
    const prompt = buildSystemPrompt({ modelId: "openai/o3-mini" });
    expectOnlyOverlay(prompt, GPT_OVERLAY_HEADER);
  });

  test("uses the Gemini overlay for gemini model IDs", () => {
    const prompt = buildSystemPrompt({ modelId: "google/gemini-2.5-pro" });
    expectOnlyOverlay(prompt, GEMINI_OVERLAY_HEADER);
  });

  test("falls back to the generic overlay for unknown or missing model IDs", () => {
    const unknownPrompt = buildSystemPrompt({ modelId: "mock-model" });
    expectOnlyOverlay(unknownPrompt, OTHER_OVERLAY_HEADER);

    const missingPrompt = buildSystemPrompt({});
    expectOnlyOverlay(missingPrompt, OTHER_OVERLAY_HEADER);
  });
});
