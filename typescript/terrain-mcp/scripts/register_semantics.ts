/**
 * One-shot registration script for the semantics service pair.
 *
 * Registers in the terrain topology (http://localhost:8084/api/v1):
 *   semantics-srv  — runnable service, Express, port 3160
 *   semantics-mcp  — MCP server, streamable-http, port 3161
 *   dependency     — semantics-mcp → semantics-srv (critical)
 *
 * Idempotent: lists existing rows and POSTs only when missing; PUTs to
 * refresh metadata when present.
 *
 * ── Why direct REST, not the terrain-mcp tools ──────────────────────────
 * The terrain-mcp tools (terrain_register_*) forward their snake_case args
 * straight to the Spring backend, but the backend's Jackson binding uses
 * camelCase property names with no snake-case naming strategy. Multi-word
 * fields (workspace_path, health_check_url, transport_type, service_type_id)
 * are silently dropped, so registrations lose their metadata. Worse,
 * terrain_register_dependency sends source_name/target_name while the
 * backend ServiceDependency entity requires resolved sourceId/targetId —
 * those stay null and the POST always 500s. Direct REST with camelCase
 * JSON bodies is the faithful, idempotent path.
 *
 * Usage: cd nexus/typescript/terrain-mcp && npx tsx scripts/register_semantics.ts
 *
 * NOTE: depends on the McpServer.@JsonIgnore fix (terrain backend, same
 * change set) — GET /mcp-servers 500s without it (lazy serviceType proxy).
 */

const TERRAIN = "http://localhost:8084/api/v1";
const WORKSPACE = "/home/codex/dev/nexus/typescript";

const RUNNABLE_BODY = {
  name: "semantics-srv",
  port: 3160,
  workspacePath: `${WORKSPACE}/semantics-srv`,
  serviceTypeId: 3, // Express
  healthCheckUrl: "http://localhost:3160/health",
  status: "ONLINE",
  version: "1.0.0",
  description:
    "REST API for the semantics.* Postgres schema (type-level semantic topology legend) — CRUD over 11 tables via stored procs",
  activeFlag: true,
  startup: "npx tsx src/index.ts",
  health: "curl http://localhost:3160/health",
};

const MCP_BODY = {
  name: "semantics-mcp",
  port: 3161,
  workspacePath: `${WORKSPACE}/semantics-mcp`,
  serviceTypeId: 1, // MCP Server (matches the other 13 mcp_servers rows)
  healthCheckUrl: "http://localhost:3161/health",
  status: "ONLINE",
  transportType: "streamable-http",
  version: "1.0.0",
  description:
    "MCP server for the semantics.* schema — agent-accessible CRUD over the type-level legend via the semantics-srv REST API",
  activeFlag: true,
  startup: "npx tsx src/index.ts",
  health: "curl http://localhost:3161/health",
};

interface TerrainRow {
  id: number;
  name: string;
  [key: string]: unknown;
}

async function list<T>(path: string): Promise<T[]> {
  const res = await fetch(`${TERRAIN}${path}?size=200`);
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T[] };
  return body.data ?? [];
}

// PUT sends the full body, so unsent fields are nulled on the row — harmless
// here because these rows were created with only the fields we send.
async function upsert<T extends TerrainRow>(path: string, body: Record<string, unknown>, label: string): Promise<number> {
  const rows = await list<T>(path);
  const existing = rows.find((r) => r.name === body.name);
  let res: Response;
  if (existing) {
    res = await fetch(`${TERRAIN}${path}/${existing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    res = await fetch(`${TERRAIN}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw new Error(`${existing ? "PUT" : "POST"} ${path} -> HTTP ${res.status}: ${await res.text()}`);
  const created = (await res.json()) as TerrainRow;
  console.log(`✓ ${label}: ${existing ? "updated" : "created"} id=${created.id} (${path}/${created.id})`);
  return created.id;
}

async function main() {
  const srvId = await upsert("/runnable-services", RUNNABLE_BODY, "semantics-srv");
  const mcpId = await upsert("/mcp-servers", MCP_BODY, "semantics-mcp");

  // Dependency: semantics-mcp (mcp_server, mcpId) → semantics-srv (runnable_service, srvId)
  const deps = await list<{ sourceType: string; sourceId: number; targetType: string; targetId: number; id: number }>(
    "/service-dependencies"
  );
  const dep = deps.find(
    (d) => d.sourceType === "mcp_server" && d.sourceId === mcpId && d.targetType === "runnable_service" && d.targetId === srvId
  );
  if (!dep) {
    const res = await fetch(`${TERRAIN}/service-dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType: "mcp_server",
        sourceId: mcpId,
        targetType: "runnable_service",
        targetId: srvId,
        criticality: "critical",
        description: "semantics-mcp delegates all operations to semantics-srv REST",
      }),
    });
    if (!res.ok) throw new Error(`POST /service-dependencies -> HTTP ${res.status}: ${await res.text()}`);
    const created = (await res.json()) as { id: number };
    console.log(`✓ dependency semantics-mcp(${mcpId}) → semantics-srv(${srvId}): created id=${created.id}`);
  } else {
    console.log(`✓ dependency semantics-mcp(${mcpId}) → semantics-srv(${srvId}): already present id=${dep.id}`);
  }

  console.log("\n── verification ──");
  const srvRow = (await list<TerrainRow>("/runnable-services")).find((r) => r.name === "semantics-srv");
  const mcpRow = (await list<TerrainRow>("/mcp-servers")).find((r) => r.name === "semantics-mcp");
  const depRows = await list("/service-dependencies");
  const mine = depRows.filter((d) => (d as { sourceId?: number }).sourceId === mcpId);
  console.log("runnable:", srvRow ? `id=${srvRow.id} status=${srvRow.status} port=${srvRow.port} ws=${srvRow.workspacePath} type=${srvRow.serviceTypeId} hc=${srvRow.healthCheckUrl}` : "NOT FOUND");
  console.log("mcp:     ", mcpRow ? `id=${mcpRow.id} status=${mcpRow.status} port=${mcpRow.port} ws=${mcpRow.workspacePath} transport=${mcpRow.transportType} hc=${mcpRow.healthCheckUrl}` : "NOT FOUND");
  console.log("deps from semantics-mcp:", mine.map((d) => `id=${d.id} → ${d.targetType}:${d.targetId}`).join(", ") || "NONE");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
