/**
 * db.ts — Database and Redis connections for harness-srv.
 *
 * Resolves the full context chain:
 *   wind.tasks → tackle.tasks → tackle.prompts + tackle.roles
 *   Redis mem:idx:{role} → procedure card index
 */

import { Pool } from "pg";
import Redis from "ioredis";

const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432"),
  database: process.env.PG_DATABASE || "nexus",
  user: process.env.PG_USER || "pguser",
  password: process.env.PG_PASSWORD || "pgpass",
});

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: 3,
});

// ── Types ───────────────────────────────────────────────────────────

export interface RoleContext {
  role: string;
  prompt_slug: string;
  prompt_version: number;
  prompt_body: string;
  procedure_index: ProcedureCard[];
  tool_acl: ToolAclEntry[];
}

export interface ProcedureCard {
  slug: string;
  summary: string;
  tags: string[];
}

export interface ToolAclEntry {
  mcp_id: string;
  tool_slug: string;
}

export interface TaskContext {
  // From wind.tasks (workflow-specific)
  wind_task_id: string;
  wind_task_name: string;
  wind_task_description: string;
  input_spec: Record<string, any>;
  // From tackle.tasks (agent definition)
  tackle_task_id: string;
  task_slug: string;
  scope: string;
  acceptance_criteria: string[];
}

export interface ResolvedContext {
  role: string;
  prompt: string; // fully resolved prompt with {{PROCEDURE_INDEX}} replaced
  task: TaskContext;
  harness_id: string;
  harness_config: Record<string, any>;
}

// ── Resolution functions ────────────────────────────────────────────

/**
 * Resolve the full context for a workflow node.
 *
 * @param windTaskId - wind.tasks.id (the workflow node's task)
 * @param overrides - optional context overrides (inputs, etc.)
 */
export async function resolveContext(
  windTaskId: string,
  overrides?: Record<string, any>
): Promise<ResolvedContext> {
  // 1. Get wind.tasks + tackle.tasks + tackle.prompts in one join
  const taskResult = await pool.query(
    `
    SELECT
      wt.id as wind_task_id,
      wt.name as wind_task_name,
      wt.description as wind_task_description,
      wt.input_spec,
      tt.id as tackle_task_id,
      tt.task_slug,
      tt.scope,
      tt.acceptance_criteria,
      tt.role,
      tt.prompt_id,
      tp.slug as prompt_slug,
      tp.version as prompt_version,
      tp.body_md as prompt_body
    FROM wind.tasks wt
    JOIN tackle.tasks tt ON wt.tackle_task_id = tt.id
    JOIN tackle.prompts tp ON tt.prompt_id = tp.id
    WHERE wt.id = $1
    `,
    [windTaskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error(`No task found for wind.tasks.id=${windTaskId} (or no tackle_task_id linked)`);
  }

  const row = taskResult.rows[0];

  // 2. Get procedure card index from Redis
  const procedureIndex = await getProcedureIndex(row.role);

  // 3. Get tool ACL
  const toolAcl = await getToolAcl(row.role);

  // 4. Resolve {{PROCEDURE_INDEX}} in prompt
  const procedureIndexText = formatProcedureIndex(procedureIndex);
  const resolvedPrompt = row.prompt_body.replace(
    /\{\{PROCEDURE_INDEX\}\}/g,
    procedureIndexText
  );

  // 5. Determine harness (default to opencode)
  const harness = await getDefaultHarness();

  return {
    role: row.role,
    prompt: resolvedPrompt,
    task: {
      wind_task_id: row.wind_task_id,
      wind_task_name: row.wind_task_name,
      wind_task_description: row.wind_task_description,
      input_spec: row.input_spec || {},
      tackle_task_id: row.tackle_task_id,
      task_slug: row.task_slug,
      scope: row.scope,
      acceptance_criteria: row.acceptance_criteria || [],
    },
    harness_id: harness.id,
    harness_config: harness.config,
  };
}

/**
 * Get procedure card index for a role from Redis.
 */
async function getProcedureIndex(role: string): Promise<ProcedureCard[]> {
  const key = `mem:idx:${role}`;
  const raw = await redis.get(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Get tool ACL for a role from tackle.role_tool_access.
 */
async function getToolAcl(role: string): Promise<ToolAclEntry[]> {
  const result = await pool.query(
    `SELECT mcp_id, tool_slug FROM tackle.role_tool_access WHERE role = $1`,
    [role]
  );
  return result.rows;
}

/**
 * Format procedure card index as a readable list for prompt injection.
 */
function formatProcedureIndex(cards: ProcedureCard[]): string {
  if (cards.length === 0) {
    return "(no procedure cards available for this role)";
  }
  return cards
    .map((c) => `- **${c.slug}**: ${c.summary}`)
    .join("\n");
}

/**
 * Get the default harness (opencode CLI).
 */
async function getDefaultHarness(): Promise<{
  id: string;
  config: Record<string, any>;
}> {
  const result = await pool.query(
    `SELECT id, invocation_semantics FROM tackle.harnesses WHERE id = 'harn-ollama'`
  );
  if (result.rows.length === 0) {
    // Fallback to any harness
    const fallback = await pool.query(
      `SELECT id, invocation_semantics FROM tackle.harnesses LIMIT 1`
    );
    if (fallback.rows.length === 0) {
      throw new Error("No harnesses configured in tackle.harnesses");
    }
    return {
      id: fallback.rows[0].id,
      config:
        typeof fallback.rows[0].invocation_semantics === "string"
          ? JSON.parse(fallback.rows[0].invocation_semantics)
          : fallback.rows[0].invocation_semantics,
    };
  }
  const row = result.rows[0];
  return {
    id: row.id,
    config:
      typeof row.invocation_semantics === "string"
        ? JSON.parse(row.invocation_semantics)
        : row.invocation_semantics,
  };
}

/**
 * Emit an event to cascade.events.
 */
export async function emitEvent(params: {
  event_type: string;
  source: string;
  aggregate_type?: string;
  aggregate_id?: string;
  payload?: Record<string, any>;
  actor_type?: string;
  causation_id?: string;
  caused_by_event_type?: string;
}): Promise<string> {
  const { v4: uuidv4 } = await import("uuid");
  const eventId = uuidv4();
  const now = new Date().toISOString();

  await pool.query(
    `
    INSERT INTO cascade.events (
      event_id, event_type, source, event_timestamp,
      payload, aggregate_type, aggregate_id,
      actor_type, actor_id,
      causation_id, caused_by_event_type
    ) VALUES (
      $1::uuid, $2, $3, $4,
      $5::jsonb, $6, $7,
      $8, $9,
      $10::uuid, $11
    )
    `,
    [
      eventId,
      params.event_type,
      params.source,
      now,
      JSON.stringify(params.payload || {}),
      params.aggregate_type || null,
      params.aggregate_id || null,
      params.actor_type || "harness",
      "harness-srv",
      params.causation_id || null,
      params.caused_by_event_type || null,
    ]
  );

  return eventId;
}

export { pool, redis };
