#!/usr/bin/env tsx
/**
 * generate-openapi.ts — derive the OpenAPI 3.0 spec for semantics-srv from
 * the single source of truth: the TABLES registry in src/tables.ts.
 *
 * The REST surface is generated from that registry at runtime (routes/semantics.ts),
 * so this script walks the same TABLES array and emits the equivalent
 * paths + schemas. If a table is added/renamed in tables.ts, re-run:
 *
 *   npm run openapi:gen
 *
 * Output: ./openapi.yaml (OpenAPI 3.0.3)
 */

import * as fs from "fs";
import * as path from "path";
import { TABLES, TableMeta } from "../src/tables";

// ── YAML emitter (minimal, no dependency) ─────────────────────────────

function yamlQuote(s: string): string {
  // Double-quote only when needed to keep the YAML unambiguous.
  const plain =
    /^[A-Za-z0-9][A-Za-z0-9 _./()'+\-]*$/.test(s) &&
    !/\s$/.test(s) && // trailing whitespace would be stripped by parsers
    !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && // YAML 1.1 booleans/null
    !/^[-+]?[0-9.]+$/.test(s); // numeric-looking strings
  return plain ? s : JSON.stringify(s);
}

function emit(value: unknown, indent: number): string[] {
  const pad = " ".repeat(indent);
  if (value === null) return [`${pad}null`];
  if (typeof value === "string") return [`${pad}${yamlQuote(value)}`];
  if (typeof value === "number" || typeof value === "boolean") return [`${pad}${String(value)}`];

  // Only scalars may be inlined after a `key:` (or `- key:`); any object or
  // array must go on its own block, otherwise we'd emit `key: subkey: value`
  // chains that are not valid YAML.
  const isScalar = (x: unknown): boolean =>
    x === null || ["string", "number", "boolean"].includes(typeof x);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];
    const lines: string[] = [];
    for (const item of value) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length === 0) {
          lines.push(`${pad}- {}`);
          continue;
        }
        const [k0, v0] = entries[0];
        const v0Lines = emit(v0, indent + 2);
        if (v0Lines.length === 1 && isScalar(v0)) {
          lines.push(`${pad}- ${k0}: ${v0Lines[0].trim()}`);
        } else {
          lines.push(`${pad}- ${k0}:`);
          lines.push(...v0Lines);
        }
        for (const [k, v] of entries.slice(1)) {
          lines.push(`${pad}  ${k}:`);
          lines.push(...emit(v, indent + 4));
        }
      } else {
        lines.push(`${pad}- ${yamlQuote(String(item))}`);
      }
    }
    return lines;
  }
  // plain object
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [`${pad}{}`];
  const lines: string[] = [];
  for (const [k, v] of entries) {
    const vLines = emit(v, indent + 2);
    if (vLines.length === 1 && isScalar(v)) {
      lines.push(`${pad}${k}: ${vLines[0].trim()}`);
    } else {
      lines.push(`${pad}${k}:`);
      lines.push(...vLines);
    }
  }
  return lines;
}

function toYaml(doc: Record<string, unknown>): string {
  return emit(doc, 0).join("\n") + "\n";
}

// ── Type helpers (mirror routes/semantics.ts + MCP propType) ─────────

const BOOL_COLS = new Set(["is_completed_fix", "safe_to_retire"]);

function jsonType(t: TableMeta, col: string): Record<string, unknown> {
  if (col === "id") {
    return t.idType === "smallint"
      ? { type: "integer", format: "int32" }
      : { type: "string", format: "uuid" };
  }
  if (t.smallintCols.includes(col) || col === "version" || col === "confidence") {
    return { type: "number" };
  }
  if (t.jsonbCols.includes(col)) return { type: "object", additionalProperties: true };
  if (BOOL_COLS.has(col)) return { type: "boolean" };
  if (col === "expired_at" || col === "resolved_at" || col === "effective_at" || col === "created_at") {
    return { type: "string", format: "date-time", nullable: true };
  }
  return { type: "string" };
}

function propDescription(t: TableMeta, col: string): string | undefined {
  if (col === "owning_subsystem_id") return "owning subsystem smallint id";
  if (col === "raw_metadata") return "JSONB metadata";
  if (col === "id" && !t.idAuto) return "Required — stable smallint lookup key (caller-supplied)";
  return undefined;
}

/** Column name → OpenAPI property for a p_* write body. */
function writeBodyProps(t: TableMeta): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (!t.idAuto) props.p_id = { ...jsonType(t, "id"), description: "Required — stable smallint lookup key (caller-supplied)" };
  for (const col of t.writable) {
    const desc = propDescription(t, col);
    props[`p_${col}`] = desc ? { ...jsonType(t, col), description: desc } : jsonType(t, col);
  }
  if (t.table === "owning_subsystem") {
    props.p_new_id = { type: "number", description: "Required for update — the new smallint key" };
  }
  if (t.table === "relationship_type") {
    props.p_new_name = { type: "string", description: "Required for update — the new relationship type name" };
  }
  return props;
}

/** Required p_* body params (DB NOT NULL constraints, minus auto-generated cols). */
function writeBodyRequired(t: TableMeta): string[] {
  const required: string[] = [];
  if (!t.idAuto) required.push("p_id");
  for (const col of t.required) {
    if (col === "id") continue; // id handled above for idAuto=false tables
    required.push(`p_${col}`);
  }
  return required;
}

/** Row schema: id + all DB columns (writable + auto timestamp cols). */
function rowSchema(t: TableMeta): Record<string, unknown> {
  const props: Record<string, unknown> = {
    id: jsonType(t, "id"),
  };
  const allCols = [...t.writable];
  // Auto-filled timestamp columns (not writable, but returned by SELECT *).
  const auto = new Set(["created_at", "effective_at", "detected_at"]);
  for (const col of allCols) props[col] = jsonType(t, col);
  for (const col of auto) props[col] = jsonType(t, col);
  props.expired_at = { type: "string", format: "date-time", nullable: true };
  return { type: "object", properties: props };
}

// ── Build the OpenAPI document ────────────────────────────────────────

const paths: Record<string, unknown> = {};
const schemas: Record<string, unknown> = {
  Error: {
    type: "object",
    required: ["error", "message"],
    properties: {
      error: { type: "string", description: "Machine-readable error code (not_found, add_failed, duplicate_active_key, update_failed, list_failed, get_failed, soft_delete_failed, resolve_failed, meta_failed)" },
      message: { type: "string", description: "Human-readable detail" },
    },
  },
  Health: {
    type: "object",
    properties: {
      status: { type: "string" },
      service: { type: "string" },
      port: { type: "integer" },
      pid: { type: "integer" },
      timestamp: { type: "string", format: "date-time" },
    },
  },
};

for (const t of TABLES) {
  const base = `/api/${t.table}`;
  const rowName = `${t.table}Row`;
  const writeName = `${t.table}Write`;
  const updateName = `${t.table}Update`;
  const listName = `${t.table}List`;

  schemas[rowName] = rowSchema(t);
  schemas[writeName] = {
    type: "object",
    properties: writeBodyProps(t),
    ...(writeBodyRequired(t).length ? { required: writeBodyRequired(t) } : {}),
  };
  schemas[updateName] = {
    type: "object",
    properties: writeBodyProps(t),
  };
  schemas[listName] = {
    type: "object",
    required: ["table", "count", "items"],
    properties: {
      table: { type: "string", enum: [t.table] },
      count: { type: "integer" },
      items: { type: "array", items: { $ref: `#/components/schemas/${rowName}` } },
    },
  };

  const idParamType = t.idType === "smallint" ? { type: "integer", format: "int32" } : { type: "string" };
  const idParamDesc = t.idCol === "name"
    ? "Relationship type name (or uuid) — matches on either"
    : "Row id (uuid, or smallint for owning_subsystem)";

  // GET /api/<table> — list
  paths[base] = {
    get: {
      summary: `List active rows in semantics.${t.table} (${t.label})`,
      operationId: `list${capitalize(t.table)}`,
      tags: [t.table],
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 }, description: "Max rows (clamped to 500)" },
        { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 }, description: "Row offset" },
        { name: "includeExpired", in: "query", schema: { type: "boolean", default: false }, description: "Also return rows with expired_at set" },
      ],
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: { $ref: `#/components/schemas/${listName}` } } } },
        "500": { description: "list_failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    post: {
      summary: `Add a row to semantics.${t.table} via add_ proc (${t.label})`,
      operationId: `add${capitalize(t.table)}`,
      tags: [t.table],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: `#/components/schemas/${writeName}` } } },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: `#/components/schemas/${rowName}` } } } },
        "400": { description: "add_failed / duplicate_active_key / FK violation", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };

  // GET/PATCH/DELETE /api/<table>/:id
  paths[`${base}/{id}`] = {
    get: {
      summary: `Get a single row from semantics.${t.table} by id`,
      operationId: `get${capitalize(t.table)}`,
      tags: [t.table],
      parameters: [
        { name: "id", in: "path", required: true, description: idParamDesc, schema: idParamType },
      ],
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: { $ref: `#/components/schemas/${rowName}` } } } },
        "404": { description: "not_found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "500": { description: "get_failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    patch: {
      summary: `Append-only replace on semantics.${t.table} — expires the row with the given id and inserts a NEW version with a NEW id; response includes superseded_id`,
      operationId: `update${capitalize(t.table)}`,
      tags: [t.table],
      parameters: [
        { name: "id", in: "path", required: true, description: idParamDesc, schema: idParamType },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: `#/components/schemas/${updateName}` } } },
      },
      responses: {
        "200": {
          description: "OK — new row with superseded_id",
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: `#/components/schemas/${rowName}` },
                  { type: "object", required: ["superseded_id"], properties: { superseded_id: { type: "string", description: "id of the expired row" } } },
                ],
              },
            },
          },
        },
        "400": { description: "duplicate_active_key / update_failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "404": { description: "not_found — no active row", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    delete: {
      summary: `Soft-delete (expire) a row in semantics.${t.table} — expire-not-delete, idempotent`,
      operationId: `softDelete${capitalize(t.table)}`,
      tags: [t.table],
      parameters: [
        { name: "id", in: "path", required: true, description: idParamDesc, schema: idParamType },
      ],
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["table", "id", "deleted"],
                properties: {
                  table: { type: "string", enum: [t.table] },
                  id: idParamType,
                  deleted: { type: "integer", description: "1 on first delete, 0 if already expired/missing" },
                },
              },
            },
          },
        },
        "500": { description: "soft_delete_failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };
}

// drift resolve
paths["/api/drift_finding/{id}/resolve"] = {
  post: {
    summary: "Transition a drift finding from detected → resolved (idempotent)",
    operationId: "resolveDriftFinding",
    tags: ["drift_finding"],
    parameters: [
      { name: "id", in: "path", required: true, description: "Drift finding uuid", schema: { type: "string", format: "uuid" } },
    ],
    requestBody: {
      required: false,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { p_resolved_at: { type: "string", format: "date-time", nullable: true, description: "ISO timestamp; defaults to now()" } },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "OK",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["id", "resolved"],
              properties: {
                id: { type: "string", format: "uuid" },
                resolved: { type: "integer", description: "1 on first resolve, 0 if already resolved/expired/missing" },
              },
            },
          },
        },
      },
      "500": { description: "resolve_failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  },
};

// health + meta
paths["/health"] = {
  get: {
    summary: "Health check",
    operationId: "health",
    tags: ["system"],
    responses: {
      "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } } },
    },
  },
};
paths["/api/meta"] = {
  get: {
    summary: "Schema overview — every table with active/total counts, stored-proc count, and writable p_* params per table",
    operationId: "meta",
    tags: ["system"],
    responses: {
      "200": {
        description: "OK",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["service", "schema", "tables", "procs", "writableParams"],
              properties: {
                service: { type: "string" },
                schema: { type: "string", enum: ["semantics"] },
                tables: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["table", "label", "idType", "idAuto", "active", "total"],
                    properties: {
                      table: { type: "string" },
                      label: { type: "string" },
                      idType: { type: "string", enum: ["uuid", "smallint"] },
                      idAuto: { type: "boolean" },
                      active: { type: "integer", description: "rows with expired_at IS NULL" },
                      total: { type: "integer" },
                    },
                  },
                },
                procs: { type: "integer" },
                writableParams: {
                  type: "object",
                  additionalProperties: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
      "500": { description: "meta_failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  },
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Assemble + write ─────────────────────────────────────────────────

const doc: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "semantics-srv REST API",
    version: "1.0.0",
    description:
      "REST API over the semantics.* Postgres schema — the type-level semantic topology legend of the Nexus platform. " +
      "Append-only, expire-not-delete: writes go through stored procedures, PATCH supersedes (new id + superseded_id), DELETE soft-expires. " +
      "This document is GENERATED from src/tables.ts — re-run `npm run openapi:gen` after table changes.",
  },
  servers: [{ url: "http://localhost:3160", description: "local semantics-srv" }],
  tags: [
    { name: "system", description: "Health + schema introspection" },
    // drift_finding gets its own lifecycle description (TABLES would emit the table label)
    ...TABLES.filter((t) => t.table !== "drift_finding").map((t) => ({ name: t.table, description: t.label })),
    { name: "drift_finding", description: "drift lifecycle" },
  ],
  paths,
  components: { schemas },
};

const outPath = path.resolve(__dirname, "..", "openapi.yaml");
fs.writeFileSync(outPath, toYaml(doc), "utf-8");
console.log(`Wrote ${outPath} (${TABLES.length} tables → ${Object.keys(paths).length} paths)`);
