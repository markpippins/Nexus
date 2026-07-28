import { Pool, types } from "pg";

// Keep timestamps as ISO strings so TypeScript interfaces (which type
// timestamps as string) match runtime behavior. Mirrors role-memory-srv.
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
}

let pool: Pool;

export function initDb(): Pool {
  const dsn =
    process.env.PROMPT_PG_DSN ||
    process.env.TACKLE_PG_DSN ||
    process.env.CONDUIT_PG_DSN ||
    "postgresql://pguser:pgpass@localhost:5432/nexus";

  pool = new Pool({
    connectionString: dsn,
    max: 5,
    idleTimeoutMillis: 30000,
  });

  return pool;
}

export function getDb(): Pool {
  if (!pool) throw new Error("DB not initialized. Call initDb() first.");
  return pool;
}

/**
 * Fetch the LATEST version of each prompt template per role.
 *
 * tackle.prompts is versioned: (role, slug, version) is UNIQUE. Launching
 * agents want the newest revision of each (role, slug), which is the row
 * with MAX(version) grouped by (role, slug). We resolve that with a
 * DISTINCT ON window in Postgres — cleaner than a self-join and faster than
 * fetching all versions and post-filtering in JS.
 *
 * Returns a flat array of the latest PromptRow per (role, slug), ordered
 * by role then slug for deterministic Redis writes.
 */
export async function fetchLatestPrompts(): Promise<PromptRow[]> {
  const db = getDb();
  const result = await db.query<PromptRow>(
    `SELECT DISTINCT ON (role, slug)
            id, role, slug, version, title, body_md,
            parameter_schema, tags, created_at, updated_at
     FROM tackle.prompts
     ORDER BY role, slug, version DESC`
  );
  return result.rows;
}

/**
 * Fetch all active tasks. The `active` column encodes default-allowlist
 * semantics — only active rows are picked up at launch, so we sync only
 * those to Redis. Retired/superseded rows stay in PG for audit but never
 * reach the cache.
 */
export async function fetchActiveTasks(): Promise<TaskRow[]> {
  const db = getDb();
  const result = await db.query<TaskRow>(
    `SELECT id, role, task_slug, scope, acceptance_criteria,
            prompt_id, active, created_at, updated_at
     FROM tackle.tasks
     WHERE active = TRUE
     ORDER BY role, task_slug`
  );
  return result.rows;
}
