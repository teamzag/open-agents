import type { AgentState, TodoItem, ScratchpadEntry } from "../types";

export function createAgentState(workingDirectory: string): AgentState {
  return {
    todos: [],
    scratchpad: new Map(),
    workingDirectory,
  };
}

export function updateTodos(state: AgentState, todos: TodoItem[]): AgentState {
  return { ...state, todos };
}

export function writeScratchpad(
  state: AgentState,
  path: string,
  content: string
): AgentState {
  const now = Date.now();
  const existing = state.scratchpad.get(path);
  const entry: ScratchpadEntry = {
    path,
    content,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    size: new TextEncoder().encode(content).length,
  };
  const newScratchpad = new Map(state.scratchpad);
  newScratchpad.set(path, entry);
  return { ...state, scratchpad: newScratchpad };
}

export function readScratchpad(
  state: AgentState,
  path: string
): ScratchpadEntry | undefined {
  return state.scratchpad.get(path);
}

export function listScratchpad(state: AgentState, prefix?: string): string[] {
  const paths = Array.from(state.scratchpad.keys());
  if (!prefix) return paths;
  return paths.filter((p) => p.startsWith(prefix));
}

export function deleteScratchpad(state: AgentState, path: string): AgentState {
  const newScratchpad = new Map(state.scratchpad);
  newScratchpad.delete(path);
  return { ...state, scratchpad: newScratchpad };
}

export function formatTodosForContext(todos: TodoItem[]): string {
  if (todos.length === 0) return "";

  const lines = ["## Current Task List", ""];
  for (const todo of todos) {
    const statusIcon =
      todo.status === "completed"
        ? "✓"
        : todo.status === "in_progress"
          ? "→"
          : "○";
    lines.push(`${statusIcon} [${todo.id}] ${todo.content} (${todo.status})`);
  }
  return lines.join("\n");
}

export function formatScratchpadForContext(
  scratchpad: Map<string, ScratchpadEntry>
): string {
  if (scratchpad.size === 0) return "";

  const lines = ["## Scratchpad Contents", ""];
  for (const [path, entry] of scratchpad) {
    const sizeKb = (entry.size / 1024).toFixed(1);
    lines.push(`- ${path} (${sizeKb} KB)`);
  }
  return lines.join("\n");
}
