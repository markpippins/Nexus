#!/usr/bin/env node
/**
 * mcp-registry-seeder — Phase-1 command registry seeder.
 *
 * Pulls the live tool surface from tools-aggregator GET /tools (which
 * discovers all MCP servers via tools/list), then upserts into
 * mcp.command_registry keyed by (service, command). On re-seed, produces
 * a drift report: tools that are new / missing / schema-changed.
 *
 * Usage:
 *   npm run seed                # default: AGGREGATOR_URL=http://localhost:3210
 *   AGGREGATOR_URL=... npm run seed
 *
 * Idempotent: safe to run repeatedly. No filesystem writes.
 */

import { createHash } from "crypto";
import { Client } from "pg";
import type { AggregatedTool } from "mcp-types";

const AGGREGATOR_URL =
  process.env.AGGREGATOR_URL || "http://localhost:3210";
const PG_DSN =
  process.env.MCP_PG_DSN ||
  process.env.CONDUIT_PG_DSN ||
  "postgresql://pguser:pgpass@localhost:5432/nexus";

interface ToolsPayload {
  tools: AggregatedTool[];
  total?: number;
}

function schemaHash(schema: Record<string, any>): string {
  return createHash("sha256")
    .update(JSON.stringify(schema))
    .digest("hex");
}

async function fetchTools(url: string): Promise<AggregatedTool[]> {
  const toolsUrl = url.replace(/\/+$/, "") + "/tools";
  const res = await fetch(toolsUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${toolsUrl} → HTTP ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as ToolsPayload;
  return data.tools || [];
}

async function seed() {
  console.log(`[seeder] fetching ${AGGREGATOR_URL}/tools ...`);
  const tools = await fetchTools(AGGREGATOR_URL);
  console.log(`[seeder] ${tools.length} tools received from aggregator`);

  const client = new Client({ connectionString: PG_DSN });
  await client.connect();

  // Ensure schema/table exist (idempotent DDL, mirrors plan section 1).
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS mcp;
    CREATE TABLE IF NOT EXISTS mcp.command_registry (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      service      text NOT NULL,
      command      text NOT NULL,
      description  text NOT NULL DEFAULT '',
      param_schema jsonb NOT NULL DEFAULT '{}',
      source_mcp   text NOT NULL DEFAULT '',
      protocol     text NOT NULL DEFAULT 'auto',
      schema_hash  text NOT NULL DEFAULT '',
      last_seen_at timestamptz NOT NULL DEFAULT NOW(),
      created_at   timestamptz NOT NULL DEFAULT NOW(),
      updated_at   timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (service, command)
    );
    CREATE INDEX IF NOT EXISTS idx_command_registry_service ON mcp.command_registry (service);
    CREATE INDEX IF NOT EXISTS idx_command_registry_command ON mcp.command_registry (command);
  `);

  // Fetch the pre-seed state for drift reporting.
  const before = await client.query<{
    service: string;
    command: string;
    schema_hash: string;
  }>(
    `SELECT service, command, schema_hash FROM mcp.command_registry`
  );
  const beforeMap = new Map(
    before.rows.map((r) => [`${r.service}|${r.command}`, r.schema_hash])
  );

  let upserted = 0;
  const seen = new Set<string>();
  const drift = { new: 0, missing: 0, changed: 0 };

  for (const tool of tools) {
    const service = (tool.service || "unknown").replace(/-mcp$/, "");
    const key = `${service}|${tool.name}`;
    seen.add(key);

    const hash = schemaHash(tool.inputSchema || {});
    const prev = beforeMap.get(key);

    if (prev === undefined) drift.new++;
    else if (prev !== hash) drift.changed++;

    await client.query(
      `INSERT INTO mcp.command_registry
         (service, command, description, param_schema, source_mcp, protocol, schema_hash, last_seen_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (service, command) DO UPDATE SET
         description   = EXCLUDED.description,
         param_schema  = EXCLUDED.param_schema,
         source_mcp    = EXCLUDED.source_mcp,
         protocol      = EXCLUDED.protocol,
         schema_hash   = EXCLUDED.schema_hash,
         last_seen_at  = NOW(),
         updated_at    = NOW()`,
      [
        service,
        tool.name,
        tool.description || "",
        JSON.stringify(tool.inputSchema || {}),
        tool.service || "",
        tool.protocol || "auto",
        hash,
      ]
    );
    upserted++;
  }

  // Tools present in DB but absent from the live surface → missing (soft).
  let missingCount = 0;
  for (const key of beforeMap.keys()) {
    if (!seen.has(key)) {
      drift.missing++;
      missingCount++;
    }
  }

  await client.end();

  console.log(`[seeder] upserted ${upserted} rows`);
  console.log(
    `[seeder] drift: new=${drift.new} changed=${drift.changed} missing=${drift.missing}`
  );
  console.log(
    missingCount > 0
      ? `[seeder] WARNING: ${missingCount} registry rows not seen in live surface (servers down? tools removed?)`
      : "[seeder] registry fully matches live surface"
  );
}

seed().catch((err) => {
  console.error("[seeder] FAILED:", err.message);
  process.exit(1);
});
