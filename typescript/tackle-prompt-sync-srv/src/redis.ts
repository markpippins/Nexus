import Redis from "ioredis";

// Redis key namespace for the Prompt Registry. Lives under `prompt:`
// (NOT `mem:` — that namespace is owned by role-memory-srv for the
// Role Memory Procedure Registry. Prompts and procedures are
// different registries with different access patterns: prompts are
// ASSEMBLED at agent launch; procedure cards are CONSULTED on demand.)
//
// Key schemas:
//   prompt:proc:{role}::{slug}   String(JSON) — full PromptCard (latest version)
//   prompt:idx:{role}            String(JSON) — PromptIndexEntry[] for the role
//   prompt:meta:last_updated     String(ISO)  — global last-sync timestamp
//   task:idx:{role}              String(JSON) — TaskIndexEntry[] for the role
export const KEY_PREFIX = "prompt:";
export const PROC_KEY = (role: string, slug: string) => `${KEY_PREFIX}proc:${role}::${slug}`;
export const IDX_KEY = (role: string) => `${KEY_PREFIX}idx:${role}`;
export const META_UPDATED_KEY = `${KEY_PREFIX}meta:last_updated`;
export const TASK_IDX_KEY = (role: string) => `task:idx:${role}`;

let redis: Redis;

export function initRedis(): Redis {
  const url = process.env.PROMPT_REDIS_URL || process.env.MEMORY_REDIS_URL || "redis://localhost:6379";
  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    // Always retry with capped exponential backoff. Returning null would
    // permanently close the client (ioredis semantics) and prevent recovery
    // after a transient Redis outage — mirroring role-memory-srv's fix.
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
  });

  redis.on("error", (err) => {
    console.error("[prompt-redis] error:", err.message);
  });

  return redis;
}

export function getRedis(): Redis {
  if (!redis) throw new Error("Redis not initialized. Call initRedis() first.");
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
  }
}
