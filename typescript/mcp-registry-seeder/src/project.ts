#!/usr/bin/env node
/**
 * slash/ projection writer — Phase-1.
 *
 * Reads mcp.command_registry (canonical) and regenerates the filesystem
 * projection at nexus/slash/<service>/<command>/API.md. Follows the same
 * scheme as the legacy generate_api_docs.py (service/command/API.md with
 * # Command / ## Usage / ## Parameters / ## Returns / ## Source) but:
 *   - sources from the DB (canonical), not static source parsing
 *   - renders real param types from param_schema (no string flattening)
 *   - never emits "*No parameters required.*" for tools whose schema
 *     actually declares params
 *
 * Usage:
 *   npm run project            # writes into /home/codex/dev/nexus/slash
 *   SLASH_DIR=... npm run project
 */

import * as fs from "fs";
import * as path from "path";
import { Client } from "pg";

const SLASH_DIR =
  process.env.SLASH_DIR || "/home/codex/dev/nexus/slash";
const PG_DSN =
  process.env.MCP_PG_DSN ||
  process.env.CONDUIT_PG_DSN ||
  "postgresql://pguser:pgpass@localhost:5432/nexus";

interface RegistryRow {
  service: string;
  command: string;
  description: string;
  param_schema: Record<string, any>;
  source_mcp: string;
  protocol: string;
}

function renderType(p: Record<string, any>): string {
  const t = p.type || "string";
  if (Array.isArray(t)) return t.join(" | ");
  if (t === "array") {
    const items = p.items;
    return items ? `array<${items.type || "any"}>` : "array";
  }
  if (p.enum && Array.isArray(p.enum)) return `enum(${p.enum.join(",")})`;
  if (t === "object" && p.properties) {
    return `object<${Object.keys(p.properties).join(",")}>`;
  }
  return t;
}

function apiMd(r: RegistryRow): string {
  const props = (r.param_schema && r.param_schema.properties) || {};
  const required: string[] = Array.isArray(r.param_schema?.required)
    ? (r.param_schema.required as string[])
    : [];
  const names = Object.keys(props).sort();

  const lines: string[] = [];
  lines.push("# Command", "", `/${r.service} ${r.command}`, "", "## Usage", "");
  lines.push(r.description || `Calls the \`${r.command}\` tool on ${r.source_mcp}.`, "");
  lines.push("## Parameters", "");
  if (names.length === 0) {
    lines.push("*No parameters required.*", "");
  } else {
    lines.push("| Name | Type | Required | Description |", "|------|------|----------|-------------|");
    for (const n of names) {
      const p = props[n] || {};
      const desc = p.description || "";
      const req = required.includes(n) ? "Yes" : "No";
      lines.push(`| \`${n}\` | ${renderType(p)} | ${req} | ${desc} |`);
    }
    lines.push("");
  }
  lines.push("## Returns", "", "JSON object with the tool's response content.", "");
  lines.push("## Source", "", `- **MCP Server**: \`${r.source_mcp}\``, `- **Tool**: \`${r.command}\``, "");
  return lines.join("\n");
}

async function main() {
  const client = new Client({ connectionString: PG_DSN });
  await client.connect();

  const result = await client.query<RegistryRow>(
    `SELECT service, command, description, param_schema, source_mcp, protocol
     FROM mcp.command_registry
     ORDER BY service, command`
  );
  await client.end();
  const rows = result.rows;

  if (!fs.existsSync(SLASH_DIR)) fs.mkdirSync(SLASH_DIR, { recursive: true });

  // Remove stale per-service dirs (full projection — anything not in the
  // registry is deleted so the folder always matches the DB exactly).
  for (const entry of fs.readdirSync(SLASH_DIR)) {
    if (entry.startsWith(".") || entry.endsWith(".py")) continue; // keep dotfiles + legacy scripts
    const full = path.join(SLASH_DIR, entry);
    if (fs.statSync(full).isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    }
  }

  let written = 0;
  for (const r of rows) {
    const dir = path.join(SLASH_DIR, r.service, r.command);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "API.md"), apiMd(r), "utf8");
    written++;
  }

  console.log(`[project] wrote ${written} API.md files to ${SLASH_DIR}`);
}

main().catch((err) => {
  console.error("[project] FAILED:", err.message);
  process.exit(1);
});
