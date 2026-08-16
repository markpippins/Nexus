/**
 * slash-command-mcp — registry access layer (pg-free).
 *
 * D-2026-08-16-002: `mcp.command_registry` access now lives behind the
 * tools-aggregator's owned read-model (tools-aggregator/src/command-registry.ts).
 * This module is a thin HTTP client over the aggregator's `/commands/*`
 * REST namespace — no direct PostgreSQL imports, no `pg` dependency.
 *
 * All lookups are read-only; the registry is refreshed out-of-band by the
 * mcp-registry-seeder, never by slash-command-mcp.
 */

import type { InputSchema, MCPProtocol } from "mcp-types";


const AGGREGATOR_URL =
  process.env.AGGREGATOR_URL || "http://localhost:3210";

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

class RegistryHttpError extends Error {
  constructor(message: string, public code = "REGISTRY_ERROR") {
    super(message);
    this.name = "RegistryHttpError";
  }
}

async function registryGet<T>(path: string): Promise<T> {
  const url = `${AGGREGATOR_URL.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      detail = body?.error || body?.code || detail;
    } catch {
      /* keep HTTP status */
    }
    throw new RegistryHttpError(detail);
  }
  return (await res.json()) as T;
}

/** Fetch the exact registry row for (service, command). */
export async function findCommand(
  service: string,
  command: string
): Promise<RegistryRow | null> {
  const data = await registryGet<{ command?: any }>(
    `/commands/${encodeURIComponent(service)}/${encodeURIComponent(command)}`
  );
  return data?.command ?? null;
}

/** Resolve a command that may be bare (no service) — must be unique. */
export async function resolveCommand(
  command: string
): Promise<{ row: RegistryRow; serviceMatched: string } | { matches: string[] }> {
  const data = await registryGet<{ row?: RegistryRow | null; matches?: string[] }>(
    `/commands/resolve/${encodeURIComponent(command)}`
  );
  if (data?.row) {
    return { row: data.row, serviceMatched: data.row.service };
  }
  return { matches: data?.matches || [] };
}

/** Resolve a service token to its canonical name, or null. */
export async function resolveService(token: string): Promise<string | null> {
  const services = await listServices();
  const candidates = serviceCandidates(token);
  const match = services.find((s) => candidates.includes(s));
  return match ?? null;
}

/** List all service names (canonical). */
export async function listServices(): Promise<string[]> {
  const data = await registryGet<{ services?: string[] }>("/commands/services");
  return data?.services ?? [];
}

/** Search commands across all services by command-name prefix (via aggregator). */
export async function searchCommands(
  prefix: string,
  limit = 20
): Promise<{ command: string; service: string }[]> {
  const data = await registryGet<{ commands?: { command: string; service: string }[] }>(
    `/commands/search/${encodeURIComponent(prefix)}?limit=${limit}`
  );
  return data?.commands ?? [];
}

/** List command names for a service, optionally prefix-filtered. */
export async function listCommands(
  service: string,
  prefix = ""
): Promise<{ command: string; description: string | null }[]> {
  const data = await registryGet<{ commands?: { command: string; description: string | null }[] }>(
    `/commands/${encodeURIComponent(service)}/commands`
  );
  const rows = data?.commands ?? [];
  return prefix ? rows.filter((r) => r.command.startsWith(prefix)) : rows;
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
