import Redis from "ioredis";

// Mirror of tackle-prompt-sync-srv/src/redis.ts key schema. Kept in sync
// manually — these two servers are tightly coupled by the prompt:* / task:*
// key contract. Any change here must be mirrored there (and vice versa).
export const KEY_PREFIX = "prompt:";
export const PROC_KEY = (role: string, slug: string) => `${KEY_PREFIX}proc:${role}::${slug}`;
export const IDX_KEY = (role: string) => `${KEY_PREFIX}idx:${role}`;
export const TASK_IDX_KEY = (role: string) => `task:idx:${role}`;

let redis: Redis;

export function initRedis(): Redis {
  const url = process.env.PROMPT_REDIS_URL || process.env.MEMORY_REDIS_URL || "redis://localhost:6379";
  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    // Lazy connect so stdio startup doesn't hang if Redis is briefly down —
    // the bridge still answers prompts/list with whatever it can, and
    // individual prompts/get calls fail loudly on the cache miss.
    lazyConnect: true,
    retryStrategy(times) {
      // Always retry: returning null permanently closes the client and
      // blocks all recovery after a transient outage.
      return Math.min(times * 200, 2000);
    },
  });

  redis.on("error", (err) => {
    console.error("[prompt-bridge-redis] error:", err.message);
  });
  return redis;
}

export function getRedis(): Redis {
  if (!redis) throw new Error("Redis not initialized. Call initRedis() first.");
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) await redis.quit();
}
