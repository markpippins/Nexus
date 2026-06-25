import { fetchAllActiveMemory } from "./db";
import { getRedis, PROC_KEY, IDX_KEY, META_UPDATED_KEY } from "./redis";

export interface ProcedureIndexEntry {
  slug: string;
  summary: string;
  tags: string[];
}

export interface ProcedureCard {
  slug: string;
  title: string;
  summary: string;
  body_md: string;
  tags: string[];
  triggers: string[];
  mcp_tools: string[];
  roles: string[];
  updated_at: string;
}

/**
 * Full sync: read all active procedures from PG, write to Redis.
 * Called on startup and on POST /refresh.
 */
export async function syncAll(): Promise<{
  procedures: number;
  roleIndices: number;
  timestamp: string;
}> {
  const redis = getRedis();
  const memMap = await fetchAllActiveMemory();

  const now = new Date().toISOString();
  const pipeline = redis.pipeline();

  // Build role→index lookups
  const roleIdx = new Map<string, ProcedureIndexEntry[]>();

  for (const [slug, { procedure, roles }] of memMap) {
    const card: ProcedureCard = {
      slug,
      title: procedure.title,
      summary: procedure.summary,
      body_md: procedure.body_md,
      tags: procedure.tags,
      triggers: procedure.triggers,
      mcp_tools: procedure.mcp_tools,
      roles,
      updated_at: procedure.updated_at,
    };

    // Set mem:proc:{slug}
    pipeline.set(PROC_KEY(slug), JSON.stringify(card));

    // Add to each role's index
    for (const role of roles) {
      const idx = roleIdx.get(role) || [];
      idx.push({ slug, summary: procedure.summary, tags: procedure.tags });
      roleIdx.set(role, idx);
    }
  }

  // Write role indices
  for (const [role, entries] of roleIdx) {
    pipeline.set(IDX_KEY(role), JSON.stringify(entries));
  }

  // Write last-updated timestamp
  pipeline.set(META_UPDATED_KEY, now);

  await pipeline.exec();

  return {
    procedures: memMap.size,
    roleIndices: roleIdx.size,
    timestamp: now,
  };
}
