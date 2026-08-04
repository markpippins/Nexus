import { createError, createSuccess } from "./errors";
import * as api from "./semantics-client";
import { TABLES, TableMeta } from "./tables";

// ── Type definitions ────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

type ToolHandler = (args: Record<string, any>) => Promise<any>;

// ── Input schema helpers ─────────────────────────────────────────────

const BOOL_COLS = new Set(["is_completed_fix", "safe_to_retire"]);

function propType(t: TableMeta, col: string): string {
  if (t.smallintCols.includes(col) || col === "version") return "number";
  if (t.jsonbCols.includes(col)) return "object";
  if (BOOL_COLS.has(col)) return "boolean";
  return "string";
}

function propProps(t: TableMeta, col: string): Record<string, any> {
  const p: Record<string, any> = { type: propType(t, col) };
  if (col === "owning_subsystem_id") p.description = "owning subsystem smallint id";
  if (col === "raw_metadata") p.description = "JSONB metadata";
  return p;
}

function buildWritableProps(t: TableMeta): Record<string, any> {
  const props: Record<string, any> = {};
  if (!t.idAuto) {
    props.p_id = { type: "number", description: "Required — stable smallint lookup key" };
  }
  for (const col of t.writable) {
    props[`p_${col}`] = propProps(t, col);
  }
  if (t.table === "owning_subsystem") {
    props.p_new_id = { type: "number", description: "Required for update — the new smallint key" };
  }
  return props;
}

// ── Tool definitions ─────────────────────────────────────────────────

export const toolDefinitions: MCPToolDefinition[] = [
  {
    name: "semantics_meta",
    description:
      "Schema overview of semantics.* — all 11 tables with active/total row counts, stored-proc count, and writable p_* params per table.",
    inputSchema: { type: "object", properties: {} },
  },
  ...TABLES.flatMap((t): MCPToolDefinition[] => [
    {
      name: `semantics_list_${t.table}`,
      description: `List active rows in semantics.${t.table} (${t.label}). Expired rows excluded unless include_expired is true.`,
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max rows (default 100, max 500)" },
          include_expired: { type: "boolean", description: "Also return expired rows" },
        },
      },
    },
    {
      name: `semantics_get_${t.table}`,
      description: `Get a single row from semantics.${t.table} by id (${t.label}).`,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Row UUID (or smallint key)" } },
        required: ["id"],
      },
    },
    {
      name: `semantics_add_${t.table}`,
      description: `Add a row to semantics.${t.table} (${t.label}) via the add_ proc. Body uses p_* params (see semantics_meta).${t.note ? ` Note: ${t.note}` : ""}`,
      inputSchema: {
        type: "object",
        properties: buildWritableProps(t),
      },
    },
    {
      name: `semantics_update_${t.table}`,
      description: `Append-only replace on semantics.${t.table} (${t.label}): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).`,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Row id to supersede" }, ...buildWritableProps(t) },
        required: ["id"],
      },
    },
    {
      name: `semantics_soft_delete_${t.table}`,
      description: `Soft-delete (expire) a row in semantics.${t.table} by id — expire-not-delete: the row is retained with expired_at set. Idempotent (0 if already gone).`,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Row id to expire" } },
        required: ["id"],
      },
    },
  ]),
  {
    name: "semantics_resolve_drift_finding",
    description:
      "Transition a drift finding from detected → resolved (sets resolved_at). Idempotent: returns 1 on first resolve, 0 if already resolved / expired / missing.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Drift finding UUID" },
        resolved_at: { type: "string", description: "ISO timestamp (defaults to now)" },
      },
      required: ["id"],
    },
  },
];

// ── Handlers ─────────────────────────────────────────────────────────

function bodyFromArgs(t: TableMeta, args: Record<string, any>): Record<string, any> {
  const body: Record<string, any> = {};
  if (args.id !== undefined) body.p_id = args.id;
  if (t.table === "owning_subsystem" && args.p_new_id !== undefined) body.p_new_id = args.p_new_id;
  for (const col of t.writable) {
    const k = `p_${col}`;
    if (args[k] !== undefined) body[k] = args[k];
  }
  return body;
}

const handlers: Record<string, ToolHandler> = {
  semantics_meta: async () => createSuccess(await api.meta()),

  ...Object.fromEntries(
    TABLES.flatMap((t) => [
      [
        `semantics_list_${t.table}`,
        async (args) => {
          const limit = args.limit ? Number(args.limit) : undefined;
          const data = await api.listRows(t.table, limit, args.include_expired === true);
          return createSuccess(data);
        },
      ],
      [
        `semantics_get_${t.table}`,
        async (args) => {
          if (!args.id) return createError("INVALID_ARGUMENTS", "id is required");
          const row = await api.getRow(t.table, String(args.id));
          if (!row) return createError("NOT_FOUND", `${t.table} ${args.id} not found`);
          return createSuccess(row);
        },
      ],
      [
        `semantics_add_${t.table}`,
        async (args) => {
          try {
            const row = await api.addRow(t.table, bodyFromArgs(t, args));
            return createSuccess(row);
          } catch (err: any) {
            if (err.message?.includes("23505")) return createError("DUPLICATE", `Duplicate active key: ${err.message}`);
            if (err.message?.includes("23503")) return createError("VALIDATION_ERROR", `Foreign key violation: ${err.message}`);
            throw err;
          }
        },
      ],
      [
        `semantics_update_${t.table}`,
        async (args) => {
          if (!args.id) return createError("INVALID_ARGUMENTS", "id is required");
          try {
            const row = await api.updateRow(t.table, String(args.id), bodyFromArgs(t, args));
            return createSuccess(row);
          } catch (err: any) {
            if (err.message?.includes("404")) return createError("NOT_FOUND", `${t.table} ${args.id} not found or no active row`);
            if (err.message?.includes("23505")) return createError("DUPLICATE", `Duplicate active key: ${err.message}`);
            throw err;
          }
        },
      ],
      [
        `semantics_soft_delete_${t.table}`,
        async (args) => {
          if (!args.id) return createError("INVALID_ARGUMENTS", "id is required");
          const data = await api.softDeleteRow(t.table, String(args.id));
          return createSuccess(data);
        },
      ],
    ]),
  ),

  semantics_resolve_drift_finding: async (args) => {
    if (!args.id) return createError("INVALID_ARGUMENTS", "id is required");
    const data = await api.resolveDriftFinding(String(args.id), args.resolved_at);
    return createSuccess(data);
  },
};

// ── Dispatch ─────────────────────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, any>,
): Promise<any> {
  const handler = handlers[toolName];
  if (!handler) {
    return createError("TOOL_NOT_FOUND", `Unknown tool: ${toolName}`);
  }
  try {
    return await handler(args);
  } catch (err: any) {
    console.error(`[semantics-mcp] Error in ${toolName}:`, err);
    return createError("INTERNAL_ERROR", err.message || "Internal server error");
  }
}
