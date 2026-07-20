import Redis from "ioredis";

export const KEY_PREFIX = "mem:";
export const PROC_KEY = (slug: string) => `${KEY_PREFIX}proc:${slug}`;
export const IDX_KEY = (role: string) => `${KEY_PREFIX}idx:${role}`;
export const META_UPDATED_KEY = `${KEY_PREFIX}meta:last_updated`;

let redis: Redis;

export function initRedis(): Redis {
  const url = process.env.MEMORY_REDIS_URL || "redis://localhost:6379";
  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      // Always retry with capped exponential backoff. Returning null would
      // permanently close the client (ioredis semantics) and prevent any
      // recovery after a transient Redis outage — which is what caused the
      // Role Memory Procedure Registry to silently stop syncing.
      return Math.min(times * 200, 2000);
    },
  });

  redis.on("error", (err) => {
    console.error("[redis] error:", err.message);
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
