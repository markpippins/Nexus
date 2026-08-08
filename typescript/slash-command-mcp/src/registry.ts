/**
 * slash-command-mcp — registry access layer.
 *
 * Reads mcp.command_registry (canonical, seeded by mcp-registry-seeder).
 * All lookups are read-only; the registry is refreshed out-of-band by the
 * seeder, never by this server.
 */

import { Client, Pool } from "pg";
import type { InputSchema, MCPProtocol } from "mcp-types";

const PG_DSN =
  process.env.MCP_PG_DSN ||
  process.env.CONDUIT_PG_DSN ||
  "postgresql://pguser:pgpass@localhost:5432/nexus";

export interface RegistryRow {
  id: string;
  service: string;
  command: string;
  description: string | null;
  param_schema: InputSchema | null;
  source_mcp: string | null;
  protocol: string | null;
  schema_hash: string | null;
  last_seen_at: string | null;
  updated_at: string | null;
}

// Pool is lazy — no connections until first query.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: PG_DSN, max: 5 });
  }
  return pool;
}

/** Normalize a service token for matching: tolerate missing/present "-mcp" suffix. */
export function normalizeService(token: string): string {
  const t = token.toLowerCase().replace(/\/+$/, "").trim();
  return t;
}

/** Expand a normalized service token to candidate service names (DB stores short names, e.g. "nebula"). */
export function serviceCandidates(token: string): string[] {
  const t = normalizeService(token);
  const candidates = [t];
  if (t.endsWith("-mcp")) {
    candidates.push(t.slice(0, -4));
  } else {
    candidates.push(`${t}-mcp`);
  }
  return candidates;
}

/** Fetch the exact registry row for (service, command). */
export async function findCommand(
  service: string,
  command: string
): Promise<RegistryRow | null> {
  const client = new Client({ connectionString: PG_DSN });
  await client.connect();
  try {
    const { rows } = await client.query<RegistryRow>(
      `SELECT id, service, command, description, param_schema, source_mcp, protocol,
              schema_hash, last_seen_at, updated_at
       FROM mcp.command_registry
       WHERE service = $1 AND command = $2
       LIMIT 1`,
      [service, command]
    );
    return rows[0] ?? null;
  } finally {
    await client.end();
  }
}

/** Resolve a command that may be bare (no service) — must be unique. */
export async function resolveCommand(
  command: string
): Promise<{ row: RegistryRow; serviceMatched: string } | { matches: string[] }> {
  const client = new Client({ connectionString: PG_DSN });
  await client.connect();
  try {
    const { rows } = await client.query<RegistryRow>(
      `SELECT id, service, command, description, param_schema, source_mcp, protocol,
              schema_hash, last_seen_at, updated_at
       FROM mcp.command_registry
       WHERE command = $1
       ORDER BY service`,
      [command]
    );
    if (rows.length === 0) {
      return { matches: [] };
    }
    if (rows.length === 1) {
      return { row: rows[0], serviceMatched: rows[0].service };
    }
    return { matches: rows.map((r) => r.service) };
  } finally {
    await client.end();
  }
}

/** Resolve a service token to its canonical name, or null. */
export async function resolveService(token: string): Promise<string | null> {
  const candidates = serviceCandidates(token);
  const client = new Client({ connectionString: PG_DSN });
  await client.connect();
  try {
    const { rows } = await client.query<{ service: string }>(
      `SELECT DISTINCT service FROM mcp.command_registry WHERE service = ANY($1)`,
      [candidates]
    );
    if (rows.length === 0) return null;
    // Prefer exact match over "-mcp" appended guess.
    if (rows.some((r) => r.service === token)) return token;
    return rows[0].service;
  } finally {
    await client.end();
  }
}

/** List all service names (canonical). */
export async function listServices(): Promise<string[]> {
  const client = new Client({ connectionString: PG_DSN });
  await client.connect();
  try {
    const { rows } = await client.query<{ service: string }>(
      `SELECT DISTINCT service FROM mcp.command_registry ORDER BY service`
    );
    return rows.map((r) => r.service);
  } finally {
    await client.end();
  }
}

/** List command names for a service, optionally prefix-filtered. */
export async function listCommands(
  service: string,
  prefix = ""
): Promise<{ command: string; description: string | null }[]> {
  const client = new Client({ connectionString: PG_DSN });
  await client.connect();
  try {
    const { rows } = await client.query<{ command: string; description: string | null }>(
      `SELECT command, description FROM mcp.command_registry
       WHERE service = $1 AND command LIKE $2 || '%'
       ORDER BY command`,
      [service, prefix]
    );
    return rows;
  } finally {
    await client.end();
  }
}

/** List flag names for a (service, command) pair from its param_schema. */
export async function listFlags(
  service: string,
  command: string,
  prefix = ""
): Promise<{ name: string; type: string; required: boolean; description?: string }[]> {
  const row = await findCommand(service, command);
  if (!row || !row.param_schema?.properties) return [];
  const required = new Set(row.param_schema.required || []);
  return Object.entries(row.param_schema.properties)
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, prop]) => ({
      name,
      type: (prop as any).type || "string",
      required: required.has(name),
      description: (prop as any).description,
    }));
}

/** Describe a registry row in the normalized shape all tools return. */
export function describeRow(row: RegistryRow) {
  const schema = row.param_schema || { type: "object", properties: {} };
  const required = schema.required || [];
  const params = Object.entries(schema.properties || {}).map(([name, prop]: [string, any]) => ({
    name,
    type: prop.type || "string",
    required: required.includes(name),
    description: prop.description,
    enum: prop.enum,
    default: prop.default,
  }));
  return {
    service: row.service,
    command: row.command,
    description: row.description,
    protocol: (row.protocol as MCPProtocol) || null,
    source_mcp: row.source_mcp,
    params,
    param_schema: schema,
  };
}
