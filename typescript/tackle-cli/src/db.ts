// db.ts — PG pool + typed queries for the tackle prompt/task registry.
//
// The CLI talks to PostgreSQL directly. Redis and the prompt-sync-srv REST
// are deliberately not used: PG is the canonical source of truth with full
// version history per (role, slug, version), which `tackle prompts diff`
// requires. Redis only caches the latest version per (role, slug), so it
// can't service diff/show-of-old-version queries.
//
// DSN resolution mirrors the other tackle services:
//   TACKLE_PG_DSN || CONDUIT_PG_DSN || default local dev DSN.

import { Pool, types } from "pg";

// Keep TIMESTAMPTZ as ISO strings (matches role-memory-srv + tackle-srv).
types.setTypeParser(types.builtins.TIMESTAMPTZ, (val: string) => val);
types.setTypeParser(types.builtins.TIMESTAMP, (val: string) => val);

export interface PromptRow {
  id: string;
  role: string;
  slug: string;
  version: number;
  title: string;
  body_md: string;
  parameter_schema: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  role: string;
  task_slug: string;
  scope: string;
  acceptance_criteria: string[];
  prompt_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined from tackle.prompts for convenience — see fetchTaskWithPrompt.
  prompt_role?: string;
  prompt_slug?: string;
  prompt_version?: number;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const dsn =
    process.env.TACKLE_PG_DSN ||
    process.env.CONDUIT_PG_DSN ||
    "postgresql://pguser:pgpass@localhost:5432/nexus";
  pool = new Pool({
    connectionString: dsn,
    max: 3, // CLI is single-user; small pool is enough
    idleTimeoutMillis: 5000,
  });
  return pool;
}

/** Closes the pool. Call at process exit to avoid hanging handles. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ── Query helpers ────────────────────────────────────────────────────

/**
 * List the latest version of each (role, slug) prompt. If `role` is given,
 * filter to that role.
 *
 * Uses DISTINCT ON (role, slug) ... ORDER BY role, slug, version DESC —
 * the same pattern as tackle-prompt-sync-srv's fetchLatestPrompts (db.ts),
 * so the two produce identical rows for the latest-version slice.
 */
export async function listPrompts(role?: string): Promise<PromptRow[]> {
  const db = getPool();
  const params: string[] = [];
  let whereClause = "";
  if (role) {
    params.push(role);
    whereClause = "WHERE role = $1";
  }
  const result = await db.query<PromptRow>(
    `SELECT DISTINCT ON (role, slug)
            id, role, slug, version, title, body_md,
            parameter_schema, tags, created_at, updated_at
     FROM tackle.prompts
     ${whereClause}
     ORDER BY role, slug, version DESC`
  );
  return result.rows;
}

/**
 * Fetch one prompt by (role, slug). If `version` is omitted, return the
 * latest version (MAX(version) for that pair).
 *
 * Returns `undefined` if no matching prompt exists.
 */
export async function getPrompt(
  role: string,
  slug: string,
  version?: number
): Promise<PromptRow | undefined> {
  const db = getPool();
  if (version !== undefined) {
    const result = await db.query<PromptRow>(
      `SELECT id, role, slug, version, title, body_md,
              parameter_schema, tags, created_at, updated_at
       FROM tackle.prompts
       WHERE role = $1 AND slug = $2 AND version = $3`,
      [role, slug, version]
    );
    return result.rows[0];
  }
  // Latest version: DISTINCT ON (role, slug) ... DESC picks MAX(version)
  const result = await db.query<PromptRow>(
    `SELECT DISTINCT ON (role, slug)
            id, role, slug, version, title, body_md,
            parameter_schema, tags, created_at, updated_at
     FROM tackle.prompts
     WHERE role = $1 AND slug = $2
     ORDER BY role, slug, version DESC`,
    [role, slug]
  );
  return result.rows[0];
}

/**
 * Fetch all versions of a (role, slug) prompt, ordered by version ASC.
 * Used by `tackle prompts diff` to compute the version range.
 */
export async function listPromptVersions(
  role: string,
  slug: string
): Promise<{ version: number; title: string; updated_at: string }[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT version, title, updated_at
     FROM tackle.prompts
     WHERE role = $1 AND slug = $2
     ORDER BY version ASC`,
    [role, slug]
  );
  return result.rows;
}

/**
 * List tasks. Default: active only. If `includeInactive` is true, return all.
 * If `role` is given, filter by role.
 */
export async function listTasks(
  role?: string,
  includeInactive = false
): Promise<TaskRow[]> {
  const db = getPool();
  const params: string[] = [];
  const conditions: string[] = [];
  if (!includeInactive) conditions.push("active = TRUE");
  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const result = await db.query<TaskRow>(
    `SELECT id, role, task_slug, scope, acceptance_criteria,
            prompt_id, active, created_at, updated_at
     FROM tackle.tasks
     ${whereClause}
     ORDER BY role, task_slug`
  );
  return result.rows;
}

/**
 * Fetch one task by task_slug. Optionally join the referenced prompt so the
 * CLI can show `role/slug/version` for the template the task binds to.
 *
 * Returns `undefined` if no matching task exists.
 */
export async function getTask(
  taskSlug: string,
  withPrompt = true
): Promise<TaskRow | undefined> {
  const db = getPool();
  if (!withPrompt) {
    const result = await db.query<TaskRow>(
      `SELECT id, role, task_slug, scope, acceptance_criteria,
              prompt_id, active, created_at, updated_at
       FROM tackle.tasks
       WHERE task_slug = $1
       ORDER BY active DESC, updated_at DESC
       LIMIT 1`,
      [taskSlug]
    );
    return result.rows[0];
  }
  // Join tackle.prompts on prompt_id, picking the latest version if there
  // are multiple versions for the same slug (tasks reference a specific
  // prompt_id, but showing the role/slug/version is more useful to a human
  // than a bare UUID).
  const result = await db.query<TaskRow>(
    `SELECT t.id, t.role, t.task_slug, t.scope, t.acceptance_criteria,
            t.prompt_id, t.active, t.created_at, t.updated_at,
            p.role AS prompt_role,
            p.slug AS prompt_slug,
            p.version AS prompt_version
     FROM tackle.tasks t
     LEFT JOIN tackle.prompts p ON p.id = t.prompt_id
     WHERE t.task_slug = $1
     ORDER BY t.active DESC, t.updated_at DESC
     LIMIT 1`,
    [taskSlug]
  );
  return result.rows[0];
}
