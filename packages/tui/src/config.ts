import {
  deepAgent,
  deepAgentModelId,
  type ScratchpadEntry,
  type TodoItem,
} from "@open-claude-code/agent";

// Configure your agent here - this is the single source of truth for the TUI
export const tuiAgent = deepAgent;
export const tuiAgentModelId = deepAgentModelId;
export const pasteCollapseLineThreshold = 5;

// Default agent options factory
export function createDefaultAgentOptions(workingDirectory: string) {
  return {
    workingDirectory,
    todos: [] as TodoItem[],
    scratchpad: new Map<string, ScratchpadEntry>(),
  };
}
