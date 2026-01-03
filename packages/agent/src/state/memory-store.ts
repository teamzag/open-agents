import * as fs from "fs/promises";
import * as path from "path";
import type { MemoryEntry, MemoryStore } from "../types";

const MEMORY_FILE = ".deep-agent-memory.json";

export async function loadMemoryStore(
  workingDirectory: string
): Promise<MemoryStore> {
  const filePath = path.join(workingDirectory, MEMORY_FILE);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as MemoryStore;
  } catch {
    return { entries: [] };
  }
}

export async function saveMemoryStore(
  workingDirectory: string,
  store: MemoryStore
): Promise<void> {
  const filePath = path.join(workingDirectory, MEMORY_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
}

export async function addMemoryEntry(
  workingDirectory: string,
  entry: Omit<MemoryEntry, "id" | "createdAt">
): Promise<MemoryEntry> {
  const store = await loadMemoryStore(workingDirectory);
  const newEntry: MemoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  store.entries.push(newEntry);
  await saveMemoryStore(workingDirectory, store);
  return newEntry;
}

export async function searchMemory(
  workingDirectory: string,
  query: string,
  tags?: string[]
): Promise<MemoryEntry[]> {
  const store = await loadMemoryStore(workingDirectory);
  const queryLower = query.toLowerCase();

  return store.entries.filter((entry) => {
    const matchesQuery =
      !query || entry.content.toLowerCase().includes(queryLower);
    const matchesTags =
      !tags ||
      tags.length === 0 ||
      tags.some((tag) => entry.tags.includes(tag));
    return matchesQuery && matchesTags;
  });
}

export async function getRecentMemories(
  workingDirectory: string,
  limit: number = 10
): Promise<MemoryEntry[]> {
  const store = await loadMemoryStore(workingDirectory);
  return store.entries
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
