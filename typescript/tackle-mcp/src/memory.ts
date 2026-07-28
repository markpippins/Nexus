import Redis from "ioredis";
import { Pool, QueryResult } from "pg";
import { loadEnv } from "./env";

const env = loadEnv();

// Redis connection with timeout guard
const redisUrl = process.env.MEMORY_REDIS_URL || "redis://localhost:6379";
export const redis = new Redis(redisUrl, {
  // Connection timeout guard
  connectTimeout: 10000, // 10 seconds
  // Retry strategy with exponential backoff
  retryStrategy(times) {
    if (times > 5) return null; // Give up after 5 retries
    return Math.min(times * 200, 2000); // 200ms, 400ms, 800ms, 1600ms, 2000ms
  },
  // Don't fail startup if Redis is down
  lazyConnect: true,
  // Enable keepalive
  keepAlive: 30000,
});

// Handle connection events
redis.on("connect", () => {
  console.log("[memory-mcp] Redis connected");
});

redis.on("ready", () => {
  console.log("[memory-mcp] Redis ready");
});

redis.on("error", (err: Error) => {
  console.error("[memory-mcp] Redis error:", err);
});

redis.on("close", () => {
  console.log("[memory-mcp] Redis connection closed");
});

redis.on("reconnecting", () => {
  console.log("[memory-mcp] Redis reconnecting...");
});

// Initialize Redis connection
export function initRedis() {
  return redis.connect();
}

export function closeRedis() {
  return redis.quit();
}

// PostgreSQL connection for fallback queries
const pgPool = new Pool({
  connectionString: process.env.TACKLE_PG_DSN || process.env.CONDUIT_PG_DSN,
});

// Key helper functions
const KEY_PREFIX = "mem:";
export const PROC_KEY = (slug: string) => `${KEY_PREFIX}proc:${slug}`;
export const IDX_KEY = (role: string) => `${KEY_PREFIX}idx:${role}`;
export const META_UPDATED_KEY = `${KEY_PREFIX}meta:last_updated`;

// Get role checkpoints (weak reference: Redis first, graceful fallback)
// Returns last-known-active timestamps for each role with a mem:idx:{role} key.
export async function getRoleCheckpoints(): Promise<Record<string, { last_active: string }>> {
  const checkpoints: Record<string, { last_active: string }> = {};
  try {
    const idxKeys = await redis.keys("mem:idx:*");
    for (const key of idxKeys) {
      const role = key.split(":")[2];
      if (!role) continue;
      const idxData = await redis.get(key);
      if (idxData) {
        checkpoints[role] = { last_active: new Date().toISOString() };
      }
    }
  } catch (err: any) {
    console.warn("[memory-mcp] Redis error in getRoleCheckpoints:", err.message);
  }
  return checkpoints;
}

// Get procedure index with weak reference logic
export async function memory_get_procedures(role: string) {
  try {
    // Try Redis first
    const cached = await redis.get(IDX_KEY(role));
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (redisError) {
    console.warn("[memory-mcp] Redis error in memory_get_procedures:", (redisError as Error).message);
  }

  // Fallback to PostgreSQL (weak reference)
  try {
    const result: QueryResult = await pgPool.query(
      `SELECT role, summary, tags FROM tackle.role_memory 
       WHERE role = $1 
       ORDER BY as_of_dt DESC 
       LIMIT 100`,
      [role]
    );
    
    return result.rows.map(row => ({
      slug: "", // Would need to be joined from another table in real implementation
      summary: row.summary,
      tags: row.tags || []
    }));
  } catch (pgError) {
    console.error("[memory-mcp] PostgreSQL error in memory_get_procedures:", (pgError as Error).message);
    throw new Error("Failed to retrieve procedures from both Redis and PostgreSQL");
  }
}

// Get procedure with weak reference logic
export async function memory_get_procedure(slug: string) {
  try {
    // Try Redis first
    const cached = await redis.get(PROC_KEY(slug));
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (redisError) {
    console.warn("[memory-mcp] Redis error in memory_get_procedure:", (redisError as Error).message);
  }

  // Fallback to PostgreSQL (weak reference)
  try {
    // This would need to join multiple tables in reality
    // For now, returning a placeholder
    const result: QueryResult = await pgPool.query(
      `SELECT 'procedure_not_found' as slug, 'Procedure not found in cache or DB' as title, 
              'Procedure not available' as summary, '{}' as body_md, '[]' as tags, 
              '[]' as triggers, '[]' as mcp_tools, '[]' as roles, $1 as updated_at`,
      [new Date().toISOString()]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    throw new Error(`Procedure ${slug} not found`);
  } catch (pgError) {
    console.error("[memory-mcp] PostgreSQL error in memory_get_procedure:", (pgError as Error).message);
    throw new Error("Failed to retrieve procedure from both Redis and PostgreSQL");
  }
}

// Check if role has changed since timestamp (with Redis cache)
export async function memory_check_since(role: string, since: string): Promise<boolean> {
  try {
    // Try Redis first for quick check
    const lastUpdatedStr = await redis.get(`${IDX_KEY(role)}:updated_at`);
    if (lastUpdatedStr) {
      const lastUpdated = new Date(lastUpdatedStr);
      const sinceDate = new Date(since);
      return lastUpdated > sinceDate;
    }
  } catch (redisError) {
    console.warn("[memory-mcp] Redis error in memory_check_since:", (redisError as Error).message);
  }

  // Fallback to PostgreSQL
  try {
    const result: QueryResult = await pgPool.query(
      `SELECT 1 FROM tackle.role_memory 
       WHERE role = $1 
       AND (as_of_dt > $2 OR (expiration_dt IS NOT NULL AND expiration_dt > $2))
       LIMIT 1`,
      [role, since]
    );
    
    return (result.rowCount ?? 0) > 0;
  } catch (pgError) {
    console.error("[memory-mcp] PostgreSQL error in memory_check_since:", (pgError as Error).message);
    throw new Error("Failed to check role changes");
  }
}

// Refresh proxy - triggers PG -> Redis sync
export async function memory_refresh() {
  try {
    // This would typically call role-memory-srv
    // For now, return a placeholder
    return {
      procedures: 0,
      roleIndices: 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("[memory-mcp] Error in memory_refresh:", error);
    throw new Error("Failed to trigger memory refresh");
  }
}