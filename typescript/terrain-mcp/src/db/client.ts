// terrain-mcp no longer touches Postgres directly.
// All SQL access is delegated to terrain-srv (see TERRAIN_SRV_URL).

const TERRAIN_SRV_URL = process.env.TERRAIN_SRV_URL || "http://localhost:3111";

async function callTerrainJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = `${TERRAIN_SRV_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`terrain-srv ${res.status} ${res.statusText} for ${path}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

/** Backwards-compatible shape after the SQL → REST split. */
export function query(sql: string, params?: any[]): Promise<any[]> {
  throw new Error(
    `terrain-mcp no longer executes raw SQL. ` +
    `Query was: ${sql.slice(0, 80)}. ` +
    `Call terrain-srv (${TERRAIN_SRV_URL}) via registerTools() instead.`
  );
}

/** Pool-end placeholder so log lines still compile if kept by future callers. */
export async function closePool(): Promise<void> {
  // No-op: no connection pool owned by this MCP anymore.
}

export { callTerrainJson, TERRAIN_SRV_URL };
