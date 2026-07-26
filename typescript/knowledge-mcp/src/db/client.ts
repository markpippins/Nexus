// knowledge-mcp no longer touches Postgres directly.
// All SQL access is delegated to knowledge-srv (see KNOWLEDGE_SRV_URL).

const KNOWLEDGE_SRV_URL = process.env.KNOWLEDGE_SRV_URL || "http://localhost:3109";

/** A single near-trivial wrapper around fetch. Throws on non-2xx. */
async function callKnowledgeJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = `${KNOWLEDGE_SRV_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`knowledge-srv ${res.status} ${res.statusText} for ${path}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

/** Backwards-compatible shape after the SQL → REST split. */
export function query(sql: string, params?: any[]): Promise<any[]> {
  throw new Error(
    `knowledge-mcp no longer executes raw SQL. ` +
    `Query was: ${sql.slice(0, 80)}. ` +
    `Call knowledge-srv (${KNOWLEDGE_SRV_URL}) via registerTools() instead.`
  );
}

export function queryOne(sql: string, params?: any[]): Promise<any | null> {
  throw new Error(
    `knowledge-mcp no longer executes raw SQL. ` +
    `Query was: ${sql.slice(0, 80)}. ` +
    `Call knowledge-srv (${KNOWLEDGE_SRV_URL}) via registerTools() instead.`
  );
}

/** Pool-end placeholder so existing index.ts still has something to await on shutdown. */
export async function closePool(): Promise<void> {
  // No-op: no connection pool owned by this MCP anymore.
}

export { callKnowledgeJson, KNOWLEDGE_SRV_URL };
