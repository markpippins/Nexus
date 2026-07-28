// terrain-mcp delegates all data access to the Spring Boot terrain service.
// Routes: /api/v1/servers, /api/v1/mcp-servers, /api/v1/runnable-services,
//         /api/v1/cli-tools, /api/v1/service-dependencies, /api/v1/platform/health

const TERRAIN_BASE_URL = process.env.TERRAIN_BASE_URL || "http://localhost:8084";
const TERRAIN_API_PREFIX = "/api/v1";

async function callTerrainJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = `${TERRAIN_BASE_URL}${TERRAIN_API_PREFIX}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`terrain ${res.status} ${res.statusText} for ${path}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

/** Backwards-compatible shape after the SQL → REST split. */
export function query(sql: string, params?: any[]): Promise<any[]> {
  throw new Error(
    `terrain-mcp no longer executes raw SQL. ` +
    `Query was: ${sql.slice(0, 80)}. ` +
    `Call terrain (${TERRAIN_BASE_URL}) via registerTools() instead.`
  );
}

/** Pool-end placeholder so log lines still compile if kept by future callers. */
export async function closePool(): Promise<void> {
  // No-op: no connection pool owned by this MCP anymore.
}

export { callTerrainJson, TERRAIN_BASE_URL };
