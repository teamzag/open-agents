import { Redis } from "ioredis";

/**
 * Tracks the accumulated character count of a resumable stream in Redis.
 *
 * When a client reconnects to a running stream, we pass this offset as
 * `skipCharacters` so the resumable-stream library skips already-seen data.
 * The client already has persisted messages from the DB — replaying the full
 * history causes 15+ second delays for large streams (e.g. subagent output).
 */

const KEY_PREFIX = "resumable-stream:rs:offset";
const EXPIRY_SECONDS = 24 * 60 * 60; // 1 day, matches resumable-stream sentinel TTL

function getRedisUrl(): string {
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL or KV_URL environment variable is required for stream offsets",
    );
  }
  return url;
}

// Lazily initialised, shared across invocations in the same process.
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(getRedisUrl());
  }
  return redis;
}

/** Persist the current character offset for a stream. Fire-and-forget safe. */
export async function setStreamOffset(
  streamId: string,
  offset: number,
): Promise<void> {
  await getRedis().set(`${KEY_PREFIX}:${streamId}`, String(offset), "EX", EXPIRY_SECONDS);
}

/** Read the last-stored character offset. Returns 0 when no offset is stored. */
export async function getStreamOffset(streamId: string): Promise<number> {
  const raw = await getRedis().get(`${KEY_PREFIX}:${streamId}`);
  if (raw === null) return 0;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
