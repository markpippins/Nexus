/**
 * nebula-proxy.ts — HTTP client for delegating nebula-side reads to nebula-srv
 * REST API (default port 3101), avoiding direct SQL access to the nebula schema
 * from inside assembly-mcp (an MCP server should not own SQL for schemas it
 * doesn't canonically own).
 *
 * This is the assembly-mcp analog of assembly-srv/src/utils/fetchNebula.js.
 */

const NEBULA_BASE = process.env.NEBULA_SRV_URL || "http://localhost:3101";

export interface NebulaHarvest {
  id: string;
  source_path: string;
  source_filename: string;
  model: string | null;
  total_candidates: number | null;
  docklang: any | null;
  created_at: string;
}

export interface NebulaHarvestCandidate {
  id: string;
  harvest_id: string;
  title: string;
  intent_description: string | null;
  status: string | null;
  tags: string[] | null;
  system_id: string | null;
  subsystem_id: string | null;
  feature_id: string | null;
  completed: boolean | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch a harvest by id from nebula-srv REST API (GET /api/harvests/:id).
 * Returns null if not found.
 */
export async function fetchHarvest(harvestId: string): Promise<NebulaHarvest | null> {
  const url = `${NEBULA_BASE}/api/harvests/${harvestId}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`nebula GET /harvests/${harvestId} → ${res.status}`);
  return (await res.json()) as NebulaHarvest;
}

/**
 * Fetch harvest candidates filtered by harvest_id from nebula-srv REST API
 * (GET /api/harvest-candidates?harvestId=ID).
 */
export async function fetchHarvestCandidates(harvestId: string): Promise<NebulaHarvestCandidate[]> {
  const url = `${NEBULA_BASE}/api/harvest-candidates?harvestId=${encodeURIComponent(harvestId)}&pageSize=100`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`nebula GET /harvest-candidates?harvestId=… → ${res.status}`);
  const body = await res.json() as { items?: NebulaHarvestCandidate[] };
  return body.items ?? [];
}
