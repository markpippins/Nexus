import { Pool, PoolClient, types } from "pg";

// ── Keep timestamps as ISO strings ─────────────────────────────────
// pg parses TIMESTAMPTZ into Date objects by default. Override to keep
// strings so all existing code (which writes/expects ISO 8601 strings)
// continues to work when we migrate TEXT columns to TIMESTAMPTZ.
types.setTypeParser(types.builtins.TIMESTAMPTZ, (val: string) => val);
types.setTypeParser(types.builtins.TIMESTAMP, (val: string) => val);

// ── Connection ──────────────────────────────────────────────────────

const TACKLE_SCHEMA = "tackle";

let pool: Pool;

export async function initDb(): Promise<Pool> {
  const dsn =
    process.env.TACKLE_PG_DSN ||
    process.env.CONDUIT_PG_DSN ||
    "postgresql://pguser:pgpass@localhost:5432/nexus";

  pool = new Pool({
    connectionString: dsn,
    options: `-c search_path=${TACKLE_SCHEMA}`,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${TACKLE_SCHEMA}`);
    const exec = (sql: string, params?: any[]) => client.query(sql, params);
    await createSchema(exec);
    await runMigrations(exec);
    console.log(`Tackle schema initialized in PG schema ${TACKLE_SCHEMA}.`);
  } finally {
    client.release();
  }
  return pool;
}

export function getDb(): Pool {
  if (!pool) throw new Error("DB not initialized. Call initDb() first.");
  return pool;
}

// ── Query helpers ───────────────────────────────────────────────────

interface QueryResult {
  rows: any[];
  changes: number;
}

async function q(sql: string, params: Record<string, any> = {}): Promise<QueryResult> {
  const { text, values } = convertParams(sql, params);
  const result = await pool.query(text, values);
  return { rows: result.rows, changes: result.rowCount ?? 0 };
}

export async function qOne(sql: string, params: Record<string, any> = {}): Promise<any | undefined> {
  const r = await q(sql, params); return r.rows[0];
}

export async function qRun(sql: string, params: Record<string, any> = {}): Promise<number> {
  const r = await q(sql, params); return r.changes;
}

export async function qAll(sql: string, params: Record<string, any> = {}): Promise<any[]> {
  const r = await q(sql, params); return r.rows;
}

async function tRun(client: PoolClient, sql: string, params: Record<string, any> = {}): Promise<number> {
  const { text, values } = convertParams(sql, params);
  const r = await client.query(text, values);
  return r.rowCount ?? 0;
}

function convertParams(
  sql: string,
  params: Record<string, any> = {}
): { text: string; values: any[] } {
  let text = sql;
  const values: any[] = [];
  let idx = 1;
  const seen = new Map<string, number>();

  text = text.replace(/@([a-zA-Z0-9_]+)/g, (_match, name) => {
    if (!seen.has(name)) {
      seen.set(name, idx);
      values.push(params[name] !== undefined ? params[name] : null);
      idx++;
    }
    return `$${seen.get(name)}`;
  });

  return { text, values };
}

async function withTransaction<T>(
  cb: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  await client.query(`SET search_path TO ${TACKLE_SCHEMA}`);
  try {
    await client.query("BEGIN");
    const result = await cb(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function createSchema(
  exec: (sql: string, params?: any[]) => Promise<any>
): Promise<void> {
  await exec(`CREATE SCHEMA IF NOT EXISTS ${TACKLE_SCHEMA}`);

  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.schema_version (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.providers (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL CHECK(type IN (
                     'openai','anthropic','google','ollama',
                     'opencode','codex','spring_ai','lm_server','custom'
                   )),
      endpoint_url TEXT,
      api_key      TEXT,
      config_json  TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.roles (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.harnesses (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      invocation_semantics TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.models (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      harness_id       TEXT NOT NULL REFERENCES ${TACKLE_SCHEMA}.harnesses(id) ON DELETE CASCADE,
      provider_id      TEXT REFERENCES ${TACKLE_SCHEMA}.providers(id),
      model_identifier TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.config_bundle (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      role            TEXT NOT NULL,
      model_id        TEXT NOT NULL REFERENCES ${TACKLE_SCHEMA}.models(id),
      provider_id     TEXT REFERENCES ${TACKLE_SCHEMA}.providers(id),
      harness_id      TEXT REFERENCES ${TACKLE_SCHEMA}.harnesses(id),
      priority        INTEGER NOT NULL DEFAULT 0,
      invocation_mode TEXT NOT NULL DEFAULT 'CLI'
                        CHECK(invocation_mode IN ('CLI', 'HTTP', 'SDK', 'MCP', 'INTERACTIVE')),
      command         TEXT,
      endpoint_url    TEXT,
      timeout_ms      INTEGER,
      valid_from TIMESTAMPTZ,
      valid_to TIMESTAMPTZ,
      is_active       INTEGER NOT NULL DEFAULT 1,
      metadata        TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(role, model_id)
    );
  `);

  // ── Sessions (for test invoke flow) ──────────────────────────────
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.sessions (
      id          TEXT PRIMARY KEY,
      agent_role  TEXT NOT NULL DEFAULT 'test',
      start_iso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_iso TIMESTAMPTZ,
      exit_code   INTEGER,
      pid         INTEGER,
      is_running  INTEGER NOT NULL DEFAULT 1,
      error_info  TEXT,
      model       TEXT,
      plans_processed TEXT NOT NULL DEFAULT '[]',
      plan_count  INTEGER NOT NULL DEFAULT 0,
      cost_usd    REAL DEFAULT 0,
      workflow_id TEXT,
      run_id      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Circuit breaker (for failure recovery config) ───────────────
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.circuit_breaker (
      id                       INTEGER PRIMARY KEY,
      tripped                  INTEGER NOT NULL DEFAULT 0,
      tripped_at TIMESTAMPTZ,
      error                    TEXT,
      detail                   TEXT,
      source                   TEXT,
      retry_after              INTEGER DEFAULT 1800,
      paused                   INTEGER NOT NULL DEFAULT 0,
      wake_requested_at TIMESTAMPTZ,
      max_retries_per_model    INTEGER NOT NULL DEFAULT 3,
      retry_delay_seconds      INTEGER NOT NULL DEFAULT 120,
      max_fallbacks            INTEGER NOT NULL DEFAULT 3,
      push_back_to_pending     INTEGER NOT NULL DEFAULT 1,
      updated_at               TIMESTAMPTZ
    );
  `);

  // ── Agent scheduler (cron-driven agent runs) ───────────────────────
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.agent_scheduler (
      id               SERIAL PRIMARY KEY,
      role             TEXT NOT NULL,
      model_id         TEXT,
      harness          TEXT NOT NULL DEFAULT 'opencode'
                        CHECK(harness IN ('opencode', 'conduit')),
      agent_config     TEXT NOT NULL DEFAULT '{}',
      schedule_type    TEXT NOT NULL DEFAULT 'interval'
                        CHECK(schedule_type IN ('interval', 'cron', 'manual')),
      schedule_value   INTEGER NOT NULL DEFAULT 3600,
      project_dir      TEXT NOT NULL DEFAULT '/home/codex/dev',
      enabled          INTEGER NOT NULL DEFAULT 1,
      last_run_at TIMESTAMPTZ,
      last_run_status  TEXT,
      metadata         TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Memory procedure registry ─────────────────────────────────────
  await exec(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.memory (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      summary     TEXT NOT NULL DEFAULT '',
      body_md     TEXT NOT NULL DEFAULT '',
      tags        TEXT[] NOT NULL DEFAULT '{}',
      triggers    TEXT[] NOT NULL DEFAULT '{}',
      mcp_tools   TEXT[] NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.role_memory (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      memory_id     UUID NOT NULL REFERENCES ${TACKLE_SCHEMA}.memory(id) ON DELETE CASCADE,
      role          TEXT NOT NULL,
      as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expiration_dt TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_role_memory_active
        EXCLUDE USING gist (
          memory_id WITH =,
          role WITH =,
          tstzrange(as_of_dt, expiration_dt) WITH &&
        )
    );
  `);

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_role_memory_as_of
      ON ${TACKLE_SCHEMA}.role_memory (role, as_of_dt DESC)
  `);
  await exec(`
    CREATE INDEX IF NOT EXISTS idx_role_memory_expiration
      ON ${TACKLE_SCHEMA}.role_memory (role, expiration_dt DESC NULLS FIRST)
  `);

  // role_leases — session-level role leases (RoleLeases / plan 1286):
  // a bounded window + budget under which a role on a given channel may
  // consume work. Mirrors execution.leases (per-request) but scoped to a
  // role/session. One ACTIVE lease per role at a time.
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.role_leases (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role            TEXT NOT NULL,
      channel         TEXT NOT NULL DEFAULT 'interactive'
                      CHECK (channel IN ('interactive','opencode','ollama','unknown')),
      model           TEXT,
      window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      window_end      TIMESTAMPTZ NOT NULL,
      budget_units    INTEGER,
      consumed_units  INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','EXPIRED','RELEASED')),
      acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      released_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_leases_active_per_role
      ON ${TACKLE_SCHEMA}.role_leases (role)
      WHERE status = 'ACTIVE'
  `);
  await exec(`
    CREATE INDEX IF NOT EXISTS idx_role_leases_status
      ON ${TACKLE_SCHEMA}.role_leases (status, expires_at)
  `);

  // ── Add FK constraints to roles(name) (idempotent for existing tables) ──
  await exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_config_bundle_role'
      ) THEN
        ALTER TABLE ${TACKLE_SCHEMA}.config_bundle
          ADD CONSTRAINT fk_config_bundle_role
          FOREIGN KEY (role) REFERENCES ${TACKLE_SCHEMA}.roles(name);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_scheduler_role'
      ) THEN
        ALTER TABLE ${TACKLE_SCHEMA}.agent_scheduler
          ADD CONSTRAINT fk_agent_scheduler_role
          FOREIGN KEY (role) REFERENCES ${TACKLE_SCHEMA}.roles(name);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_role_memory_role'
      ) THEN
        ALTER TABLE ${TACKLE_SCHEMA}.role_memory
          ADD CONSTRAINT fk_role_memory_role
          FOREIGN KEY (role) REFERENCES ${TACKLE_SCHEMA}.roles(name);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_agent_role'
      ) THEN
        ALTER TABLE ${TACKLE_SCHEMA}.sessions
          ADD CONSTRAINT fk_sessions_agent_role
          FOREIGN KEY (agent_role) REFERENCES ${TACKLE_SCHEMA}.roles(name);
      END IF;
    END $$;
  `);

  console.log(`Tackle schema DDL applied in PG schema ${TACKLE_SCHEMA}.`);
}

// ── Schema versioning (formal migration system) ─────────────────────

/** A single migration step, ordered by version number. */
interface Migration {
  version: number;
  description: string;
  up: (exec: (sql: string, params?: any[]) => Promise<any>) => Promise<void>;
}

/**
 * Ordered list of schema migrations for the tackle schema.
 *
 * - Version 1 is the baseline: all tables and DDL in createSchema() are the
 *   source of truth. On fresh databases this is a no-op that records v1.
 * - Version 2 adds missing PRIMARY KEY and UNIQUE constraints to tables
 *   that were created by older migrations without them (the 2026-07-11
 *   outage root cause).
 * - Future migrations should be appended here with incrementing version
 *   numbers. Each runs exactly once, in order.
 */
const migrations: Migration[] = [
  {
    version: 1,
    description: "Baseline — all core tables (providers, roles, harnesses, models, config_bundle, sessions, circuit_breaker, agent_scheduler, memory, role_memory)",
    up: async () => {
      // No-op: the DDL in createSchema() is the source of truth for v1.
    },
  },
  {
    version: 2,
    description: "Add missing PRIMARY KEY and UNIQUE constraints for tables created by older migrations without them (2026-07-11 outage fix)",
    up: async (exec) => {
      await exec(`
        DO $$
        BEGIN
          -- providers.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'providers_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.providers'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.providers ADD PRIMARY KEY (id);
          END IF;
          -- roles.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.roles'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.roles ADD PRIMARY KEY (id);
          END IF;
          -- roles.name UNIQUE
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_name_key'
            AND conrelid = '${TACKLE_SCHEMA}.roles'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.roles ADD CONSTRAINT roles_name_key UNIQUE (name);
          END IF;
          -- harnesses.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'harnesses_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.harnesses'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.harnesses ADD PRIMARY KEY (id);
          END IF;
          -- models.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'models_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.models'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.models ADD PRIMARY KEY (id);
          END IF;
          -- config_bundle.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'config_bundle_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.config_bundle'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.config_bundle ADD PRIMARY KEY (id);
          END IF;
          -- config_bundle (role, model_id) UNIQUE
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'config_bundle_role_model_id_key'
            AND conrelid = '${TACKLE_SCHEMA}.config_bundle'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.config_bundle
              ADD CONSTRAINT config_bundle_role_model_id_key UNIQUE (role, model_id);
          END IF;
          -- circuit_breaker.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'circuit_breaker_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.circuit_breaker'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.circuit_breaker ADD PRIMARY KEY (id);
          END IF;
          -- memory.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memory_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.memory'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.memory ADD PRIMARY KEY (id);
          END IF;
          -- memory.slug UNIQUE
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memory_slug_key'
            AND conrelid = '${TACKLE_SCHEMA}.memory'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.memory ADD CONSTRAINT memory_slug_key UNIQUE (slug);
          END IF;
          -- role_memory.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_memory_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.role_memory'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.role_memory ADD PRIMARY KEY (id);
          END IF;
        END $$;
      `);
    },
  },
  {
    version: 3,
    description: "Add missing PRIMARY KEY constraints to tackle.sessions and tackle.agent_scheduler (idempotent)",
    up: async (exec) => {
      await exec(`
        DO $$
        BEGIN
          -- tackle.sessions.id PK
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.sessions'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.sessions ADD PRIMARY KEY (id);
          END IF;
          -- tackle.agent_scheduler.id PK (SERIAL column, should have PK but older migration may have missed it)
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_scheduler_pkey'
            AND conrelid = '${TACKLE_SCHEMA}.agent_scheduler'::regclass) THEN
            ALTER TABLE ${TACKLE_SCHEMA}.agent_scheduler ADD PRIMARY KEY (id);
          END IF;
        END $$;
      `);
      console.log("[tackle-migrations] v3: Added PKs to tackle.sessions, tackle.agent_scheduler");
    },
  },
  {
    version: 4,
    description: "Add performance indexes on sessions(created_at, agent_role) and agent_scheduler(enabled, last_run_at)",
    up: async (exec) => {
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_created_at
          ON ${TACKLE_SCHEMA}.sessions (created_at DESC)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_agent_role
          ON ${TACKLE_SCHEMA}.sessions (agent_role)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_agent_scheduler_due
          ON ${TACKLE_SCHEMA}.agent_scheduler (enabled, last_run_at)
      `);
      console.log("[tackle-migrations] v4: Added indexes on sessions, agent_scheduler");
    },
  },
  {
    version: 5,
    description: "Seed default roles and memory procedures (moved from createSchema to run after constraint-fix migrations)",
    up: async (exec) => {
      // Seed default circuit breaker row (idempotent)
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.circuit_breaker (id, tripped, updated_at)
         VALUES (1, 0, $1)
         ON CONFLICT (id) DO NOTHING`,
        [new Date().toISOString()]
      );

      // Seed default roles (idempotent, parameterized)
      await seedDefaultRoles(exec);

      // Seed memory procedures (idempotent — all values are hardcoded constants)
      await exec(seedMemoryProcedures());

      console.log("[tackle-migrations] v5: Seeded circuit breaker, default roles, and memory procedures");
    },
  },
  {
    version: 6,
    description: "Migrate TEXT timestamp columns to TIMESTAMPTZ — tackle-owned tables (roles, sessions, circuit_breaker, agent_scheduler, schema_version). Shared tables (providers, harnesses, models, config_bundle) are handled by conduit-mcp v27.",
    up: async (exec) => {
      // agent_scheduler.created_at and updated_at have DEFAULT ''::text — drop before ALTER
      await exec(`ALTER TABLE tackle.agent_scheduler ALTER COLUMN created_at DROP DEFAULT`);
      await exec(`ALTER TABLE tackle.agent_scheduler ALTER COLUMN updated_at DROP DEFAULT`);

      const tables: [string, string[]][] = [
        ["tackle.roles", ["created_at", "updated_at"]],
        ["tackle.sessions", ["created_at", "start_iso", "end_iso"]],
        ["tackle.circuit_breaker", ["tripped_at", "updated_at", "wake_requested_at"]],
        ["tackle.agent_scheduler", ["created_at", "updated_at", "last_run_at"]],
        ["tackle.schema_version", ["applied_at"]],
      ];
      for (const [tbl, cols] of tables) {
        const [sch, tname] = tbl.split('.');
        for (const col of cols) {
          await exec(`
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = '${sch}'
                AND table_name = '${tname}'
                AND column_name = '${col}'
                AND data_type = 'text'
              ) THEN
                ALTER TABLE ${tbl} ALTER COLUMN ${col} TYPE TIMESTAMPTZ USING CASE WHEN ${col} = '' THEN NULL WHEN ${col} ~ '[+-]\\d{2}:\\d{2}Z$' THEN REPLACE(${col}, 'Z', '')::timestamptz ELSE ${col}::timestamptz END;
              END IF;
            END $$;
          `);
        }
      }

      // Restore proper NOW() defaults
      await exec(`ALTER TABLE tackle.agent_scheduler ALTER COLUMN created_at SET DEFAULT NOW()`);
      await exec(`ALTER TABLE tackle.agent_scheduler ALTER COLUMN updated_at SET DEFAULT NOW()`);

      console.log("[tackle-migrations] v6: Migrated TEXT→TIMESTAMPTZ for tackle-owned tables");
    },
  },
];

/**
 * Run pending migrations. Called from initDb() after createSchema(),
 * using the same dedicated connection so search_path is consistent.
 *
 * Reads the current version from schema_version, then applies any
 * migrations with version > current version in ascending order.
 */
/** Advisory lock key to prevent concurrent migration runs from
 *  multiple instances starting simultaneously. */
const MIGRATION_LOCK_KEY = 873492874;

async function runMigrations(
  exec: (sql: string, params?: any[]) => Promise<any>,
): Promise<void> {
  // Acquire an advisory lock to prevent concurrent migrations from
  // multiple instances starting simultaneously.
  await exec(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
  try {
    const result = await exec(
      `SELECT COALESCE(MAX(version), 0) AS current_version FROM ${TACKLE_SCHEMA}.schema_version`
    );
    const currentVersion = (result as any)?.rows?.[0]?.current_version ?? 0;

    for (const m of migrations) {
      if (m.version <= currentVersion) continue;
      console.log(`[tackle-migrations] Applying v${m.version}: ${m.description}`);
      await m.up(exec);
      const now = new Date().toISOString();
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.schema_version (version, description, applied_at) VALUES ($1, $2, $3)`,
        [m.version, m.description, now]
      );
      console.log(`[tackle-migrations] v${m.version} applied`);
    }
  } finally {
    await exec(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
  }
}

// ── Default roles seed ─────────────────────────────────────────────

const DEFAULT_ROLES: { name: string; description: string }[] = [
  { name: "engineer", description: "Primary implementation agent — writes code, runs commands, integrates systems" },
  { name: "architect", description: "System design authority — owns architecture decisions, cross-system contracts, and design lineage" },
  { name: "planner", description: "Work decomposition authority — creates and manages implementation plans, promotes proposals" },
  { name: "builder", description: "Implementation executor — picks up pending plans and implements them against acceptance criteria" },
  { name: "reviewer", description: "Quality gate — reviews changes, issues approval/rejection receipts" },
  { name: "critic", description: "Adversarial evaluator — surfaces risks, contradictions, and blind spots" },
  { name: "analyst", description: "Gap and triage analyst — identifies missing coverage, classifies incidents" },
  { name: "inspector", description: "Compliance auditor — verifies invariants, issues violation reports" },
  { name: "test", description: "Internal test harness role — used for test invoke sessions and ad-hoc agent runs" },
  { name: "leased-builder", description: "Interactive-channel implementation executor — bounded role lease (RoleLeases, plan 1286): consumes from the READY pool under a window+budget lease, mirroring builder with a mandatory time limit" },
];

async function seedDefaultRoles(
  exec: (sql: string, params?: any[]) => Promise<any>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const r of DEFAULT_ROLES) {
    await exec(
      `INSERT INTO ${TACKLE_SCHEMA}.roles (name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [r.name, r.description, now, now]
    );
  }
}

// ── Memory procedure seed function ─────────────────────────────────
// Each procedure uses ON CONFLICT (slug) DO NOTHING, so re-running
// is safe: existing procedures are left untouched, new ones are added.

function seedMemoryProcedures(): string {
  const SQL = `tackle`;
  return `
DO $$
DECLARE
    v_memory_id UUID;
    v_role TEXT;
    v_roles TEXT[];
BEGIN

    -- ════════════════════════════════════════════════════════════════
    -- 1. Pipeline Health Check
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'pipeline-health-check',
        'Pipeline Health Check',
        'DB-first pipeline health check: blocked plans, plan-status drift (stuck pending + expired/cancelled tickets + external completion evidence), flagged changes before each turn.',
        E'## Procedure\\n\\nDB-first health check of the WorkRequest pipeline. Canonical state lives in PostgreSQL (\`vision.*\`, \`conduit.*\`, \`nebula.*\`); the filesystem is a derived projection and \`nexus/.conduit-data\` is retired (posterity mirror: \`nexus/audit/CONDUIT_DATA\`). Run at the start of every conversational turn, before responding to the user:\\n**Automated backstop:** a scheduled sweep (\`nexus/bin/pipeline-health-sweep.py\`, systemd user timer \`nexus-pipeline-health.timer\`, every 30 min) runs these checks **plus the projection-vs-replay drift scan** (\`conduit-srv GET /wr/drift-scan\`, plan 1285 — active WRs whose \`conduit.work_request_state\` projection disagrees with event replay) and posts findings to the Assembly \`drift-reports\` forum (a new thread only when the finding set changes; resolution thread when it clears). At turn start, prefer the latest pipeline-health thread in \`drift-reports\`; the queries below are the manual fallback.\\n\\n1. **Blocked plans** — plans whose latest receipt is \`BLOCK\`/\`HOLD\`, or with failed/stale tickets, mean the pipeline is jammed — report the blocker prominently. Query:\\n\\n   WITH latest AS (SELECT DISTINCT ON (plan_id) plan_id, type, created_at\\n     FROM vision.receipts WHERE plan_id ~ \'^[0-9]+$\'\\n     ORDER BY plan_id, created_at DESC)\\n   SELECT plan_id, type FROM latest WHERE type IN (\'BLOCK\',\'HOLD\') ORDER BY created_at DESC;\\n\\n2. **Plan-status drift** (pending/PLAN_CREATE + expired/cancelled ticket + external completion evidence) — plans that LOOK pending but the work actually finished, was abandoned, or ran outside the pipeline (the 1274/1275 and 2026-08-09 ghost-batch failure modes). Four signals in one query:\\n\\n   WITH latest AS (\\n     SELECT DISTINCT ON (plan_id) plan_id, type, created_at\\n     FROM vision.receipts WHERE plan_id ~ \'^[0-9]+$\'\\n     ORDER BY plan_id, created_at DESC),\\n   stuck AS (\\n     SELECT plan_id, created_at FROM latest\\n     WHERE type = \'PLAN_CREATE\' AND created_at < NOW() - INTERVAL \'24 hours\')\\n   SELECT s.plan_id, to_char(s.created_at,\'YYYY-MM-DD\') AS last_plan_create,\\n     (SELECT count(*) FROM vision.tickets t\\n       WHERE t.plan_id = s.plan_id AND (t.status = \'expired\'\\n         OR (t.status IN (\'open\',\'claimed\',\'stale\')\\n             AND t.expires_at IS NOT NULL AND t.expires_at < NOW()))) AS expired_tickets,\\n     (SELECT count(*) FROM vision.tickets t\\n       WHERE t.plan_id = s.plan_id AND t.status = \'cancelled\') AS cancelled_tickets,\\n     (SELECT count(*) FROM nebula.agent_records ar\\n       WHERE (ar.plan_ref = s.plan_id\\n          OR ar.content ~* (\'(^|[^0-9])\' || s.plan_id || \'([^0-9]|$)\'))\\n         AND ar.record_type IN (\'report\',\'inspection\',\'engineering_log\',\'assessment\',\'analysis\',\'decision\')\\n         AND COALESCE(ar.title,\'\') NOT ILIKE \'%pre-fk-snapshot%\'\\n         AND COALESCE(ar.title,\'\') NOT ILIKE \'%drift%\'\\n         AND COALESCE(ar.title,\'\') NOT ILIKE \'%ghost%\'\\n         AND COALESCE(ar.title,\'\') NOT ILIKE \'%cross-reference%\'\\n         AND COALESCE(ar.title,\'\') NOT ILIKE \'CROSS REFERENCES%\') AS evidence_rows\\n   FROM stuck s ORDER BY s.created_at LIMIT 20;\\n\\n   Interpretation per row:\\n   - \`expired_tickets > 0\`: the plan\'s ticket(s) expired unclaimed (24h, no re-arm).\\n   - \`cancelled_tickets > 0\`: the plan\'s ticket(s) were cancelled while the plan is still pending — abandoned/ghost work (the July-2026 batch signature; 142 ghosts closed via CANCELLED receipts 2026-08-09). Cleanup: issue a \`CANCELLED\` receipt via conduit-srv \`POST /api/receipts/\` (append-only closure) — NOT delete_plan (upstream already archived) and NOT re-dispatch.\\n   - \`evidence_rows > 0\` (noise excluded — pre-fk-snapshot bulk rows, self-authored drift/ghost cleanup records, prompts/responses, cross-reference indexes): external completion evidence exists (agent records, verification inspections, engineering logs referencing the plan). The plan is implemented-but-pending (drift): fix by closure — record IMPLEMENTATION + REVIEW_PASS via conduit — NOT by re-dispatch. Heuristic signal — confirm each candidate manually before closing (UUID/substring coincidences and plan-mirror assessments can still false-positive).\\n   - Oldest-first ordering with \`LIMIT 20\` keeps the report bounded; revisit the tail next turn.\\n   - \`evidence_rows = 0 AND expired_tickets = 0 AND cancelled_tickets = 0\`: genuinely stuck-pending — escalate to the owning role or re-arm the ticket.\\n\\n3. **Flagged changes / blocker reports** — change reports that failed review and inspection blocker reports live in \`nebula.agent_records\`:\\n\\n   SELECT record_type, role, left(title,70) AS title, created_at\\n   FROM nebula.agent_records\\n   WHERE ((tags && ARRAY[\'type:rejection\',\'type:violation\',\'type:incident\'])\\n      OR record_type = \'inspection\')\\n     AND NOT (tags && ARRAY[\'status:resolved\',\'status:done\',\'status:closed\',\'resolved\',\'done\',\'closed\'])\\n     AND NOT (tags && ARRAY[\'cycle:hourly-maintenance\',\'hourly-maintenance\'])\\n     AND NOT (record_type = \'inspection\' AND (title IN (\'.gitkeep\',\'REGISTRY\') OR tags = \'{}\'))\\n   ORDER BY created_at DESC LIMIT 20;\\n\\n   Noise excluded: records tagged resolved/done/closed (incl. bare variants), routine\\n   hourly-maintenance cycle records, and empty-tag inspection artifacts (.gitkeep/REGISTRY).\\n   Remaining rows are genuinely open incidents/rejections/violations and verification records.\\n\\n4. **Persistence** — these checks are persistent. Report on every turn until resolved. Do not suppress because you already reported before. When the automated sweep is healthy, its \`drift-reports\` thread is the live report; manual checks here are the fallback (sweep down or ad-hoc triage).\\n\\n5. **Full change-detection** — for completed plans and inspection reports, load the \`pipeline-watch\` skill and run its check procedure.',
        ARRAY['turn-protocol', 'pipeline', 'blocker', 'health-check', 'drift'],
        ARRAY['start of turn', 'before responding', 'health check', 'pipeline check', 'drift', 'stuck pending', 'expired ticket', 'cancelled ticket', 'ghost plan', 'implemented but pending'],
        ARRAY['pipeline-watch']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 2. Bootstrap Self-Update (Activation)
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'bootstrap-self-update',
        'Bootstrap Self-Update (Activation)',
        'On activation: ensure audit directories, load procedure index, query inbox, present open items.',
        E'## Procedure\\n\\n'
        'On role activation (every session start):\\n\\n'
        '1. **Load your procedure index:**\\n'
        '   - Call \\\`memory_get_procedures("<your_role>")\` to get the full list of '
        'procedure cards available for your role.\\n'
        '   - This populates your runtime procedure index from Redis (backed by '
        'tackle.memory and tackle.role_memory in PostgreSQL).\\n\\n'
        '2. **Ensure projection target directories exist:**\\n'
        '   mkdir -p nexus/audit/{PROMPTS,RESPONSES,PLANS/pending, ...}\\n'
        '   These are on-demand projection targets, not the canonical store.\\n\\n'
        '3. **Query your inbox:**\\n'
        '   - Use nebula_list_agent_records and filter for tags containing '
        '"to:<your_role>" and "status:open"\\n'
        '   - If nebula-mcp is unreachable, surface as a blocking infrastructure issue\\n'
        '   - Present any open items to the user before proceeding\\n\\n'
        '4. **Query nebula projection config** to verify current role\\u2192folder '
        'assignments.\\n\\n'
        '5. **Present any new items** to the user before proceeding.',
        ARRAY['turn-protocol', 'activation', 'bootstrap', 'inbox'],
        ARRAY['activate', 'session start', 'boot', 'turn start'],
        ARRAY['nebula_list_agent_records', 'nebula_create_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 3. Post-Turn Self-Update
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'post-turn-self-update',
        'Post-Turn Self-Update',
        'After every response: write agent record to DB, optionally trigger projection.',
        E'## Procedure\\n\\n'
        'After completing work on every conversational turn:\\n\\n'
        '1. **Write to the database first** \\u2014 Use nebula_create_agent_record with '
        'recordType (report|analysis|assessment|inspection|prompt|response|engineering_log|'
        'architecture_note|decision), role, title, content, tags, '
        'systemId, subsystemId, planRef, threadRef.\\n\\n'
        '2. **Optionally trigger a projection** via nebula_render_projection '
        'to regenerate the filesystem view.\\n\\n'
        '3. **Do NOT write directly to audit directories** \\u2014 the filesystem '
        'is a derived view. Direct writes will be overwritten.\\n\\n'
        '4. **Respect folder boundaries** \\u2014 Do not write to folders assigned to other roles.',
        ARRAY['turn-protocol', 'persistence', 'audit', 'post-turn'],
        ARRAY['after response', 'turn end', 'post-turn', 'after completing'],
        ARRAY['nebula_create_agent_record', 'nebula_render_projection']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 4. Engineer Backlog Check (Nebula RMS)
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'engineer-backlog-check',
        'Engineer Backlog Check (Nebula RMS)',
        'Query nebula RMS backlog before starting work. Surface pending requirements.',
        E'## Procedure\\n\\n'
        'Run at session start AND at the start of every subsequent turn '
        'before processing the user\\'s request.\\n\\n'
        '1. **Call nebula_list_requirements** with no filter, filter client-side.\\n\\n'
        '2. **Filter to backlog** \\u2014 keep requirements whose status is one of '
        'Backlog, ToDo, InProgress, Active, or Blocked.\\n\\n'
        '3. **Present before acting** \\u2014 show open count, IDs, titles, statuses, priorities.\\n\\n'
        '4. **Propose, do not auto-claim** \\u2014 surface matching items but ask before '
        'flipping status.\\n\\n'
        '5. **Record genuinely new work** via nebula_create_requirement.\\n\\n'
        '6. **Re-check before every turn** \\u2014 backlog state can shift.',
        ARRAY['engineer', 'backlog', 'requirements', 'nebula-rms'],
        ARRAY['start of turn', 'before working', 'backlog', 'requirement'],
        ARRAY['nebula_list_requirements', 'nebula_create_requirement', 'nebula_update_requirement']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        FOREACH v_role IN ARRAY ARRAY['engineer']::TEXT[] LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 5. Turn-Based Planning Check (Conduit)
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'turn-based-planning-check',
        'Turn-Based Planning Check (Conduit)',
        'Check for plans promoted to Planning status before each turn.',
        E'## Procedure\\n\\n'
        'At the start of every turn, before processing the user\\'s request:\\n\\n'
        '1. **Query the pipeline state** \\u2014 Call query_pipeline_state (or GET /state).\\n\\n'
        '2. **Inspect plans.planning** \\u2014 Look for plans with a PLANNING receipt.\\n\\n'
        '3. **Present findings** \\u2014 Show title, goal summary of each plan. '
        'Ask if user wants to discuss any.\\n\\n'
        '4. **Follow the user\\'s lead** \\u2014 elucidate or defer.\\n\\n'
        '5. **Do NOT auto-promote to Pending** \\u2014 user must explicitly confirm.',
        ARRAY['turn-protocol', 'planning', 'conduit', 'elucidation'],
        ARRAY['start of turn', 'planning check', 'promoted plan', 'plan pipeline'],
        ARRAY['conduit-mcp_query_conduit_state', 'conduit-mcp_issue_receipt']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 6. Prompt Capture (Audit Trail)
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'prompt-capture',
        'Prompt Capture (Audit Trail)',
        'Save every interactive prompt as the start of the audit trail.',
        E'## Procedure\\n\\n'
        '1. **Save every prompt** \\u2014 Use nebula_create_agent_record with '
        'recordType: "prompt". The database is the canonical store.\\n\\n'
        '2. **Link plans to prompts** \\u2014 When a prompt results in a plan, '
        'pass the promptRef to create_plan or create_proposed_plan.\\n\\n'
        '3. **Preserve continuity** \\u2014 The promptRef allows subsequent plans, '
        'proposals, and responses to reference the originating intent.',
        ARRAY['audit', 'prompt', 'capture', 'traceability'],
        ARRAY['user prompt', 'new conversation', 'question', 'request'],
        ARRAY['nebula_create_agent_record', 'conduit-mcp_create_plan',
              'conduit-mcp_create_proposed_plan']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 7. Inbox Query Procedure
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'inbox-query-procedure',
        'Inbox Query (Role-Driven Messaging)',
        'Query your role inbox for open messages before proceeding each turn.',
        E'## Procedure\\n\\n'
        'Before processing any request, query your role inbox:\\n\\n'
        '1. **Call nebula_list_agent_records**, filter for tags containing '
        '"to:<my_role>" and "status:open".\\n\\n'
        '2. **Present findings** \\u2014 Surface open messages to the user before acting.\\n\\n'
        '3. **Tag routing conventions:**\\n'
        '   - to:{role}  \\u2014 intended recipient\\n'
        '   - from:{role} \\u2014 sender\\n'
        '   - status:{state} \\u2014 open, claimed, in_progress, resolved, archived\\n'
        '   - type:{kind} \\u2014 incident, task, question, decision, finding, proposal, etc.\\n'
        '   - thread:{id} \\u2014 thread membership\\n\\n'
        '4. **Thread tracking** \\u2014 Conversations use shared threadRef UUID.\\n\\n'
        '5. **Infrastructure failure** \\u2014 If nebula-mcp is unreachable, '
        'surface as blocking. Do not silently proceed.',
        ARRAY['messaging', 'inbox', 'routing', 'communication'],
        ARRAY['start of turn', 'inbox', 'messages', 'agent communication'],
        ARRAY['nebula_list_agent_records', 'nebula_create_agent_record',
              'nebula_update_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 8. Thread Tracking
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'thread-tracking',
        'Thread Tracking (Cross-Role Conversations)',
        'Create and continue cross-role conversations via threadRef UUIDs.',
        E'## Procedure\\n\\n'
        '1. **First message** \\u2014 Author writes a record with new threadRef UUID '
        'and tags ["to:recipient", "status:open", "type:kinds"].\\n\\n'
        '2. **Response** \\u2014 Recipient writes with same threadRef, '
        'tags ["to:author", "status:in_progress", ...].\\n\\n'
        '3. **Continuation** \\u2014 Any role writes to the same thread with '
        'updated status and appropriate to: tag.\\n\\n'
        '4. **Querying** \\u2014 Filter for threadRef = "<uuid>" and order by created_at.\\n\\n'
        '5. **Resolving** \\u2014 Update all messages in thread to status:resolved.',
        ARRAY['messaging', 'thread', 'conversation', 'cross-role'],
        ARRAY['conversation', 'thread', 'cross-role', 'respond to agent'],
        ARRAY['nebula_list_agent_records', 'nebula_create_agent_record',
              'nebula_update_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 9. Tag Routing Reference
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'tag-routing-reference',
        'Tag Routing Convention Reference',
        'Reference for valid agent message tags.',
        E'## Tag Routing Reference\\n\\n'
        'All tags are lower-kebab-case. Multiple tags form a conjunction.\\n\\n'
        '### Prefix Tags\\n'
        '| Tag | Purpose | Example |\\n'
        '|-----|---------|---------|\\n'
        '| to:{role} | Recipient | to:engineer |\\n'
        '| from:{role} | Sender | from:architect |\\n'
        '| status:{state} | Lifecycle | status:open |\\n'
        '| type:{kind} | Semantic kind | type:decision |\\n'
        '| thread:{id} | Thread membership | thread:a1b2c3 |\\n\\n'
        '### Type values\\n'
        'incident, task, question, decision, spec, finding, blocker, proposal, '
        'warning, error, approval, rejection, disagreement, escalation, deferred',
        ARRAY['messaging', 'reference', 'tags', 'routing'],
        ARRAY['tag routing', 'message format', 'tag convention', 'what tags'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 10. Rover Harvest Notification
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'rover-harvest-notification',
        'Rover Harvest Notification',
        'After harvests, create cross-refs and notify Architect + Analyst.',
        E'## Procedure\\n\\n'
        '1. Execute the harvest using Rover. Always use yourself as the '
        'inference component \\u2014 do not delegate to Ollama unless told.\\n\\n'
        '2. Persist harvest output via nebula_create_harvest.\\n\\n'
        '3. Create cross-references linking harvest to knowledge entities.\\n\\n'
        '4. Notify Architect and Analyst via nebula_create_agent_record.',
        ARRAY['harvest', 'post-processing', 'notification', 'cross-reference'],
        ARRAY['rover', 'harvest', 'chat transcript', 'nebula_create_harvest'],
        ARRAY['nebula_create_harvest', 'nebula_create_cross_reference',
              'knowledge_list_entities', 'nebula_create_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        FOREACH v_role IN ARRAY ARRAY['engineer']::TEXT[] LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 11. Terrain Registration
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'terrain-registration', 'Terrain Registration',
        'Register services in terrain topology after building or deploying.',
        E'## Procedure\\n\\n'
        '1. Identify the service \\u2014 name, type, endpoint, health, deps.\\n'
        '2. Call terrain-mcp to register.\\n'
        '3. Verify via terrain_list_services.',
        ARRAY['deployment', 'infrastructure', 'service-registry'],
        ARRAY['deploy', 'build', 'set up', 'service'],
        ARRAY['terrain_register_service', 'terrain_list_services']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        FOREACH v_role IN ARRAY ARRAY['engineer']::TEXT[] LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 12. Planning Elucidation
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'planning-elucidation', 'Planning Elucidation Workflow',
        'Elucidate a planning-plan before promoting to pending.',
        E'## Procedure\\n\\n'
        '1. Present the plan.\\n'
        '2. Discuss scope (files affected).\\n'
        '3. Refine acceptance criteria.\\n'
        '4. Identify dependencies.\\n'
        '5. Confirm with user.\\n'
        '6. Persist metadata.\\n'
        '7. Issue PLAN_CREATE receipt.',
        ARRAY['planning', 'elucidation', 'promotion'],
        ARRAY['discuss plan', 'promote plan', 'elucidate'],
        ARRAY['conduit-mcp_update_plan', 'conduit-mcp_issue_receipt']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        FOREACH v_role IN ARRAY ARRAY['planner']::TEXT[] LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 13. Proposal Capture
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'proposal-capture', 'Proposal Capture (Followup Preservation)',
        'Persist followup suggestions as proposed plans.',
        E'## Procedure\\n\\n'
        '1. After suggest_followups, call create_proposed_plan for each.\\n'
        '2. Use label as title, brief description as goal.\\n'
        '3. Pass promptRef for audit trail.',
        ARRAY['proposal', 'followup', 'preservation'],
        ARRAY['suggest followup', 'after completing', 'propose'],
        ARRAY['conduit-mcp_create_proposed_plan']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['planner', 'engineer', 'architect'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 14. Nexus Boot Procedure
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'nexus-boot-procedure', 'Nexus Boot Procedure',
        'Minimum startup read set before working in nexus/.',
        E'## Procedure\\n\\n'
        'Load: nexus/CLAUDE.md, pipeline-mode.json, and conduit state. '
        '(OPERATING_MODEL.md and mode-router/SKILL.md are archived '
        'historical references -- do not read as live authority.)',
        ARRAY['bootstrap', 'startup', 'initialization'],
        ARRAY['start session', 'activate', 'boot'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'planner', 'architect', 'builder', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 15. Plan Deletion & Ticket Cleanup
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'plan-deletion-cleanup', 'Plan Deletion & Ticket Cleanup',
        'Soft-delete a plan, cancel tickets, notify UI.',
        E'## Procedure\\n\\n'
        '1. Call conduit-mcp_delete_plan.\\n'
        '2. For stuck plans: conduit-mcp_hard_delete_plan.\\n'
        '3. Idempotent on already-deleted plans.',
        ARRAY['plan', 'deletion', 'cleanup', 'ticket'],
        ARRAY['delete plan', 'remove plan', 'cancel plan'],
        ARRAY['conduit-mcp_delete_plan', 'conduit-mcp_hard_delete_plan']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['builder', 'engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 16. Orphan Detection
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'orphan-detection', 'Orphan Detection',
        'Check for DB/filesystem inconsistencies.',
        E'## Procedure\\n\\n'
        'Conduit /health endpoint has orphanScan: checks for deleted plans '
        'with residual .md files, and .md files without DB rows.',
        ARRAY['orphan', 'inconsistency', 'health'],
        ARRAY['check health', 'orphan scan'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'reviewer', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 17. Nebula-MCP Tool Reference
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'nebula-mcp-tools',
        'Nebula-MCP Tool Reference',
        'Complete catalog of nebula-mcp tools organized by domain.',
        E'## Nebula-MCP Tool Reference\\n\\n'
        'Full catalog of nebula-mcp tools, organized by domain. '
        'Available over MCP transport (Stdio or SSE on port 3102).\\n\\n'
        '### Hierarchy: Systems / Subsystems / Features\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| nebula_list_systems | List all systems with full nested hierarchy |\\n'
        '| nebula_create_system | Create a new system |\\n'
        '| nebula_update_system | Update system metadata |\\n'
        '| nebula_delete_system | Delete a system and cascade |\\n'
        '| nebula_create_subsystem | Create a subsystem |\\n'
        '| nebula_update_subsystem | Update subsystem metadata |\\n'
        '| nebula_delete_subsystem | Delete a subsystem and cascade |\\n'
        '| nebula_move_subsystem | Move a subsystem to a different parent |\\n'
        '| nebula_create_feature | Create a feature under a subsystem |\\n'
        '| nebula_update_feature | Update feature metadata |\\n'
        '| nebula_delete_feature | Delete a feature and cascade |\\n'
        '| nebula_move_feature | Move a feature to a different subsystem |\\n\\n'
        '### Requirements (Backlog / Kanban)\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| nebula_list_requirements | List requirements, filterable |\\n'
        '| nebula_create_requirement | Create a new requirement |\\n'
        '| nebula_update_requirement | Update requirement fields |\\n'
        '| nebula_move_requirement | Move requirement to a new status |\\n'
        '| nebula_delete_requirement | Delete a requirement |\\n'
        '| nebula_batch_update_requirements | Batch-update status |\\n\\n'
        '### Agent Records (Bitemporal Audit)\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| nebula_list_agent_records | List audit records, filterable |\\n'
        '| nebula_get_agent_record | Get a single record with full content |\\n'
        '| nebula_create_agent_record | Create a new record (canonical write path) |\\n'
        '| nebula_update_agent_record | Update an existing record |\\n'
        '| nebula_delete_agent_record | Delete a record |\\n\\n'
        '### Harvest Pipeline\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| nebula_list_harvests | List harvest outputs |\\n'
        '| nebula_get_harvest | Get a single harvest |\\n'
        '| nebula_create_harvest | Record a new harvest |\\n'
        '| nebula_delete_harvest | Delete a harvest |\\n\\n'
        '### Other Domains\\n'
        'See the full card for projections, cross-refs, sessions, etc.',
        ARRAY['reference', 'nebula-mcp', 'tools', 'appendix'],
        ARRAY['list tools', 'what tools', 'nebula-mcp', 'MCP reference'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 18. Tackle-MCP Tool Reference
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'tackle-mcp-tools',
        'Tackle-MCP Tool Reference',
        'Complete catalog of tackle-mcp tools for AI config and memory management.',
        E'## Tackle-MCP Tool Reference\\n\\n'
        'Tackle-mcp (port 3400) manages the AI configuration registry '
        'and Role Memory Procedure Registry.\\n\\n'
        '### AI Configuration Registry\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| get_ai_config | Get full AI configuration snapshot |\\n'
        '| validate_ai_config | Validate configuration |\\n'
        '| seed_default_ai_config | Seed defaults |\\n'
        '| import_ai_config | Replace entire configuration |\\n\\n'
        '### Providers / Harnesses / Models\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| list_ai_providers | List all providers |\\n'
        '| get_ai_provider(id) | Get a single provider |\\n'
        '| upsert_ai_provider | Create or update |\\n'
        '| delete_ai_provider(id) | Delete |\\n'
        '| list_ai_harnesses | List all harnesses |\\n'
        '| get_ai_harness(id) | Get a single harness |\\n'
        '| upsert_ai_harness | Create or update |\\n'
        '| delete_ai_harness(id) | Delete |\\n'
        '| list_ai_models | List all models |\\n'
        '| get_ai_model(id) | Get a single model |\\n'
        '| upsert_ai_model | Create or update |\\n'
        '| delete_ai_model(id) | Delete |\\n\\n'
        '### Role Configs / Bundles / Memory\\n'
        'See the full card for the complete reference.',
        ARRAY['reference', 'tackle-mcp', 'tools', 'appendix'],
        ARRAY['list tools', 'what tools', 'tackle-mcp', 'MCP reference'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 19. Conduit-MCP Tool Reference
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'conduit-mcp-tools',
        'Conduit-MCP Tool Reference',
        'Complete catalog of conduit-mcp tools for plan lifecycle and pipeline management.',
        E'## Conduit-MCP Tool Reference\\n\\n'
        'Conduit-mcp (port 3100) manages the plan lifecycle, issues receipts, '
        'and serves pipeline state.\\n\\n'
        '### Plan Lifecycle\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| query_conduit_state | Return full pipeline state |\\n'
        '| create_plan | Create a pending implementation plan |\\n'
        '| create_proposed_plan | Create a lightweight proposed plan |\\n'
        '| update_plan | Update plan metadata |\\n'
        '| delete_plan | Soft-delete a plan |\\n'
        '| hard_delete_plan | Permanently delete a stuck plan |\\n'
        '| promote_plan | Promote proposed to planning |\\n'
        '| revise_plan | Create a revision copy in planning |\\n'
        '| unblock_plan | Move blocked to pending |\\n'
        '| get_plan_receipts | Get receipt chain for a plan |\\n\\n'
        '### Receipts & Agent Status\\n'
        '| Tool | Purpose |\\n'
        '|------|---------|\\n'
        '| issue_receipt | Record a conduit event receipt |\\n'
        '| report_builder_status | Report builder process status |\\n'
        '| agent_heartbeat | Report agent liveness |\\n'
        '| agent_finished | Report agent completed task |\\n\\n'
        '### Queries\\n'
        '| query_analytics | Query conduit analytics |\\n'
        '| query_prompts | Search captured prompts |\\n'
        '| query_nebula_backlog | Query Nebula RMS backlog |\\n'
        '| query_nebula_systems | Query Nebula RMS hierarchy |',
        ARRAY['reference', 'conduit-mcp', 'tools', 'appendix'],
        ARRAY['list tools', 'what tools', 'conduit-mcp', 'MCP reference'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 20. Knowledge Stratification (L1-L4)
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'knowledge-stratification',
        'Knowledge Stratification (L1-L4)',
        'Two-axis knowledge model: abstraction levels L1-L4 combined with visibility scopes.',
        E'## Knowledge Stratification\\n\\n'
        'Every document and chunk has two independent attributes: '
        'Abstraction Level and Visibility Scope.\\n\\n'
        '### Axis 1: Abstraction Level (L1-L4)\\n'
        '| Level | Name | Description | Primary Consumers |\\n'
        '|-------|------|-------------|-------------------|\\n'
        '| L1 | Raw / operational | APIs, schemas, contracts, configs | Builder |\\n'
        '| L2 | Structured / intermediate | Subsystem design, DAG semantics | Builder, Architect |\\n'
        '| L3 | Planning / architectural | Rationale, trade-offs, philosophy | Architect, Inspector |\\n'
        '| L4 | Meta / system reasoning | Cross-system doctrine, ontology | Architect (opt-in) |\\n\\n'
        '### Axis 2: Visibility Scope\\n'
        '| Scope | Effect |\\n'
        '|-------|--------|\\n'
        '| builder | Visible to builder only |\\n'
        '| architect | Visible to architect only |\\n'
        '| planner | Visible to planner only |\\n'
        '| reviewer | Visible to reviewer only |\\n'
        '| all | Visible to all roles |\\n\\n'
        'See the full card for per-role query filters.',
        ARRAY['reference', 'knowledge', 'stratification', 'levels'],
        ARRAY['knowledge levels', 'L1 L2 L3 L4', 'stratification', 'visibility'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 21. WorkRequest Pattern Participation
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'work-request-participation',
        'WorkRequest Pattern Participation',
        'How to participate in the WorkRequest pattern: capture, plan, emit, execute, recover.',
        E'## WorkRequest Participation\\n\\n'
        'Unless the user explicitly asks for a different workflow, '
        'participate as follows:\\n\\n'
        '### 1. Prompt & Intent Capture\\n'
        'For non-trivial requests, preserve the request in prompt/planning records. '
        'Query conduit-mcp state before creating new formats.\\n\\n'
        '### 2. Implementation Plan Stacking\\n'
        'For substantial tasks: create/update a plan, stack on existing state, '
        'keep scope narrow, avoid duplicating active plans.\\n\\n'
        '### 3. WorkRequest Emission\\n'
        'Generate explicit WorkRequests when prompted or when workflow expects them. '
        'Follow existing schemas, version rather than mutate.\\n\\n'
        '### 4. Execution\\n'
        'Execute only authorized work. Respect plan boundaries, blocked states, '
        'dependency ordering.\\n\\n'
        '### 5. Recovery\\n'
        'On session restart: query conduit state and .agents/ artifacts first. '
        'Assume partial completion. Prioritize durable state over conversation memory.',
        ARRAY['governance', 'workrequest', 'participation', 'pattern'],
        ARRAY['work request', 'how to work', 'participation pattern'],
        ARRAY['conduit-mcp_query_conduit_state']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 22. Day/Night Turn Boundary
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'day-night-boundary',
        'Day/Night Turn Boundary',
        'Day (evidence accumulation) vs Night (reconciliation between sessions).',
        E'## Day/Night Turn Boundary\\n\\n'
        '### Day (within a turn)\\n'
        '- Evidence accumulation. Messages arrive, work is done, records written.\\n'
        '- No full perceptual recalculation.\\n'
        '- Each turn appends to the timeline without reconciling belief state.\\n\\n'
        '### Night (between sessions / reflection)\\n'
        '- Accumulated records reconciled. Stale threads resolved.\\n'
        '- Divergences evaluated. Projections regenerated.\\n'
        '- Belief state recomputed.\\n\\n'
        'During Day, agents must not require full recalculation to respond. '
        'The inbox query is the attention filter.',
        ARRAY['operational-model', 'day-night', 'perceptual-cycle'],
        ARRAY['day night', 'turn boundary', 'perceptual cycle', 'reconciliation'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 23. Role Governance & Epistemic Constraints
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'role-governance',
        'Role Governance & Epistemic Constraints',
        'Roundtable of epistemic agents with competing claims. No single role dominates.',
        E'## Role Governance\\n\\n'
        'Roles form a roundtable of epistemic agents with competing claims.\\n\\n'
        '### Invariants\\n'
        'I1 \\u2014 No single layer dominates.\\n'
        'I2 \\u2014 Origin gating: each role owns its binding output.\\n'
        'I3 \\u2014 Divergence is signal, not noise.\\n'
        'I4 \\u2014 Read-only provenance records.\\n\\n'
        '### Binding Outputs\\n'
        '- Architecture: type:decision (Architect)\\n'
        '- Implementation: type:change (Builder/Engineer)\\n'
        '- Review: type:approval / rejection (Reviewer)\\n'
        '- Plans: type:proposal (Planner)\\n'
        '- Triage: type:triage (Analyst)\\n'
        '- Compliance: type:violation (Inspector)\\n\\n'
        'A role may propose in any domain, but only the owning role closes.',
        ARRAY['governance', 'role', 'epistemic', 'constraints'],
        ARRAY['governance', 'role rules', 'epistemic', 'who decides'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 24. Per-Role Outbox Table
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'per-role-outbox-table',
        'Per-Role Outbox Table',
        'Reference: what each role sends, to whom, and when.',
        E'## Per-Role Outbox Table\\n\\n'
        'See the full card for the complete routing table.\\n\\n'
        '### Key entries per role:\\n'
        '- **Planner**: plan proposals to Architect/Engineer, proposals to all\\n'
        '- **Architect**: decisions to Engineer, reviews to Planner\\n'
        '- **Engineer**: tasks to self, questions to Architect, blockers to Planner\\n'
        '- **Builder**: changes to Reviewer, blockers to Planner\\n'
        '- **Reviewer**: approval/rejection, issues to Engineer\\n'
        '- **Analyst**: gaps to Planner, triage to Architect\\n'
        '- **Critic**: warnings to Analyst\\n'
        '- **Inspector**: errors/violations to Analyst/Planner\\n'
        '- **Archivist**: history to all (read-only)',
        ARRAY['reference', 'messaging', 'outbox', 'routing'],
        ARRAY['outbox', 'who sends what', 'role messages'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 25. Agent Config Frontmatter Template
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'agent-config-template',
        'Agent Config Frontmatter Template',
        'Frontmatter template for .opencode/agents/ role definition files.',
        E'## Agent Config Role Definition\\n\\n'
        'Each agent role .md file in .opencode/agents/ MUST include:\\n\\n'
        '\`\`\`yaml\\n'
        '---\\n'
        'assumes_role: <role>\\n'
        'message:\\n'
        '  inbox_query:\\n'
        '    - tags contain "to:<role>"\\n'
        '    - tags contain "status:open"\\n'
        '  record_types: [valid types]\\n'
        '  auto_present: true\\n'
        '  enrich_context: true\\n'
        '---\\n'
        '\`\`\`\\n\\n'
        '### Fields\\n'
        '- assumes_role: engineer|architect|planner|builder|reviewer|critic|analyst|inspector\\n'
        '- inbox_query: tag filters for inbox\\n'
        '- record_types: valid record types this role may write\\n'
        '- auto_present: surface inbox on every turn\\n'
        '- enrich_context: load linked data on boot\\n\\n'
        'Valid record_type values: report, analysis, assessment, inspection, '
        'prompt, response, engineering_log, architecture_note, decision',
        ARRAY['reference', 'config', 'frontmatter', 'agent-definition'],
        ARRAY['agent config', 'frontmatter', 'role definition'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder',
                         'reviewer', 'critic', 'analyst', 'inspector'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 26. Planner: Create & Manage Plans
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'planner-create-plan',
        'Planner: Create & Manage Plans',
        'How to create, propose, update, and promote implementation plans via conduit-mcp.',
        E'## Creating & Managing Plans\\n\\n'
        '### Proposed Plan (new idea)\\n'
        'Use \`conduit-mcp_create_proposed_plan\` with title, project, and goal. '
        'Issues a PROPOSED receipt; file goes to proposed/.\\n\\n'
        '### Full Plan (ready for implementation)\\n'
        'Use \`conduit-mcp_create_plan\` with title, project, goal, filesAffected, '
        'acceptanceCriteria, and dependencies. Issues a PLAN_CREATE receipt; '
        'file goes to pending/.\\n\\n'
        '### Promote Proposed to Planning\\n'
        'Use \`conduit-mcp_promote_plan\` with the plan number. '
        'Saves any edits and issues a PLANNING receipt.\\n\\n'
        '### Update Metadata\\n'
        'Use \`conduit-mcp_update_plan\` or \`conduit-mcp_report_plan_metadata\` '
        'to set filesAffected, acceptanceCriteria, dependencies.\\n\\n'
        '### Revise a Plan\\n'
        'Use \`conduit-mcp_revise_plan\` to create a revision copy (issues PLANNING on the new copy).\\n\\n'
        '### Issue Receipts (state transitions)\\n'
        'Use \`conduit-mcp_issue_receipt\` with plan_id, type (PLAN_CREATE|IMPLEMENTATION|'
        'REVIEW_PASS|REVIEW_REJECT|BLOCK|CANCELLED), and agent_role.\\n\\n'
        '### Delete a Plan\\n'
        'Use \`conduit-mcp_delete_plan\` for soft-delete (preserves audit trail). '
        'Use \`conduit-mcp_hard_delete_plan\` (with title confirmation) for permanent removal.',
        ARRAY['planner', 'plans', 'create', 'manage', 'workflow'],
        ARRAY['create plan', 'new plan', 'propose plan', 'promote plan', 'delete plan'],
        ARRAY['conduit-mcp_create_proposed_plan', 'conduit-mcp_create_plan',
              'conduit-mcp_promote_plan', 'conduit-mcp_update_plan',
              'conduit-mcp_issue_receipt', 'conduit-mcp_delete_plan',
              'conduit-mcp_revise_plan']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['planner', 'engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 27. Implementation Plan Template
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'plan-template-format',
        'Implementation Plan Template',
        'Required sections for every implementation plan: Goal, Files, AC, Dependencies.',
        E'## Implementation Plan Format\\n\\n'
        'Every plan written to pending/ must include these sections:\\n\\n'
        '\`\`\`markdown\\n'
        '## Goal\\n'
        '<what this plan achieves>\\n\\n'
        '## Files Affected\\n'
        '<absolute paths to every file that will be created or modified>\\n\\n'
        '## Acceptance Criteria\\n'
        '<how to verify the plan was implemented successfully \\u2014 '
        'specific commands, outputs, or observable states>\\n\\n'
        '## Dependencies\\n'
        '<other plan names this one depends on, or "none">\\n'
        '\`\`\`',
        ARRAY['reference', 'template', 'plan-format'],
        ARRAY['plan template', 'plan format', 'acceptance criteria', 'files affected'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['planner', 'builder', 'engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 28. Builder: Implementation Workflow
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'builder-workflow',
        'Builder: Implementation Workflow',
        'How the Builder picks up pending plans, implements them, and handles blockers.',
        E'## Builder Workflow\\n\\n'
        '### 1. Query Pipeline State\\n'
        'Use \`conduit-mcp_query_conduit_state\` to find pending plans. '
        'Check for blocked plans first \\u2014 if any exist, stop and alert.\\n\\n'
        '### 2. Read Plan Details\\n'
         'Use \`conduit-mcp_get_plan_receipts\` to review plan receipts '
         'and confirm its lifecycle state. Read the .md file from filesystem '
         'for the implementation spec (goal, files, AC, deps).\\n\\n'
         '### 3. Implement\\n'
         'Modify code according to the plan goal, files affected, and '
         'acceptance criteria. Use \`conduit-mcp_agent_heartbeat\` to report '
        'liveness.\\n\\n'
        '### 4. Handle Blockers\\n'
        'If implementation cannot proceed: \`conduit-mcp_issue_receipt\` '
        'with type BLOCK. Report the issue to the user.\\n\\n'
        '### 5. Report Completion\\n'
        'Use \`conduit-mcp_agent_finished\` when the plan is implemented. '
        'The pipeline manager handles receipt advancement automatically.\\n\\n'
        '### Continuous Execution Rule\\n'
        'The Builder works through all available plans without pausing. '
        'Only stops on: true blocker, logical impossibility, or user interrupt. '
        'Does NOT ask for approval between plans.',
        ARRAY['builder', 'workflow', 'implementation', 'plans'],
        ARRAY['builder workflow', 'implement plan', 'pending plans', 'blocker'],
        ARRAY['conduit-mcp_query_conduit_state', 'conduit-mcp_get_plan_receipts',
              'conduit-mcp_agent_heartbeat', 'conduit-mcp_issue_receipt',
              'conduit-mcp_agent_finished']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['builder', 'engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 29. Verification Commands
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'verification-commands',
        'Verification & Build Commands',
        'Build, typecheck, and test commands for the nexus workspace.',
        E'## Verification Commands\\n\\n'
        '### MCP Server\\n'
        '\`\`\`bash\\n'
        'cd nexus/typescript/conduit-mcp && npx tsc --noEmit\\n'
        'cd nexus/typescript/conduit-mcp && npx vitest run\\n'
        '\`\`\`\\n\\n'
        '### Backend (LOSM)\\n'
        '\`\`\`bash\\n'
        'cd nexus/python/ai/losm && source .venv/bin/activate && pytest\\n'
        '\`\`\`\\n\\n'
        '### UI (React)\\n'
        '\`\`\`bash\\n'
        'cd nexus-ui/nexus-plurality-ui && npx tsc --noEmit\\n'
        'cd nexus-ui/nexus-plurality-ui && npm run build\\n'
        '\`\`\`\\n\\n'
        '### Conduit UI (Angular)\\n'
        '\`\`\`bash\\n'
        'cd nexus/angular/conduit-ui && npx ng build\\n'
        '\`\`\`\\n\\n'
        '### Chat Server\\n'
        '\`\`\`bash\\n'
        'cd nexus/python/conduit && python3 agent_chat.py\\n'
        '\`\`\`',
        ARRAY['reference', 'commands', 'build', 'test', 'verification'],
        ARRAY['build', 'test', 'typecheck', 'verify', 'tsc', 'vitest', 'pytest'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'builder'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 30. MCP Server & Chat Configuration
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'mcp-server-config',
        'MCP Server & Chat Configuration',
        'Conduit-mcp server, chat server, health check, and orphan scan details.',
        E'## MCP Server Configuration\\n\\n'
        '### Conduit-mcp (port 3100)\\n'
        '- Pipeline orchestration: state machine, receipts, tickets\\n'
        '- All plan creation/promotion/state queries go through MCP tools\\n'
        '- Never write .md files directly to nexus/graph/IMPLEMENTATION_PLANS/\\n\\n'
        '### Chat Server (port 3101)\\n'
        '- Python: nexus/python/conduit/agent_chat.py\\n'
        '- MCP server proxies /chat routes:\\n'
        '  - GET /chat/config \\u2014 available agent roles\\n'
        '  - POST /chat/send \\u2014 send message to an agent\\n'
        '  - GET /chat/sessions \\u2014 active sessions\\n'
        '- Supports @planner, @builder, @reviewer, @critic notation\\n'
        '- Spawns opencode run --agent <role> as background process\\n'
        '- Streams output via SSE: /chat/stream/<id>\\n\\n'
        '### Health Check\\n'
        '- GET /health returns server status, PID, pipeline state\\n'
        '- OrphanScan section: detects soft-deleted plans with stale .md files, '
        'and filesystem artifacts with no DB row',
        ARRAY['reference', 'config', 'server', 'mcp', 'chat'],
        ARRAY['mcp server', 'chat server', 'health check', 'port 3100', 'port 3101'],
        ARRAY[]::TEXT[]
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'architect', 'planner', 'builder'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    -- ════════════════════════════════════════════════════════════════
    -- 18. Role-Lease Orientation (Plan 1286)
    -- ════════════════════════════════════════════════════════════════
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'role-lease-orientation',
        'Role-Lease Orientation (Plan 1286)',
        'Read your active role lease, consume bounded units from the READY pool, and renew or revoke the lease when window or budget expires.',
        E'## Procedure\\n\\n'
        'At the start of every turn, before processing the user''s request:\\n\\n'
        '1. **Check for an active role lease:**\\n'
        '   - Call \\`role_lease_status\\` (nebula-mcp) \\u2014 filter for your role.\\n'
        '   - If no ACTIVE lease exists, you are NOT authorized to consume work from the READY pool.\\n'
        '   - The lease carries a time window and optional unit budget.\\n\\n'
        '2. **Read the lease terms:**\\n'
        '   - \\`window_end\\`: the absolute deadline \\u2014 you MUST stop consuming work before this time.\\n'
        '   - \\`budget_units\\`: max units you may consume (NULL = unlimited).\\n'
        '   - \\`consumed_units\\`: how many you have already consumed.\\n'
        '   - \\`channel\\`: "interactive" (Freebuff), "opencode" (CLI), "ollama", "unknown".\\n\\n'
        '3. **Consume bounded units from the READY pool:**\\n'
        '   - Call \\`role_lease_status\\` at turn start to confirm remaining budget.\\n'
        '   - If \\`budget_units IS NOT NULL AND consumed_units >= budget_units\\`, the lease is exhausted \\u2014 stop consuming, surface to user.\\n'
        '   - If \\`NOW() > window_end\\`, the lease has expired \\u2014 surface to user, ask about renewal.\\n'
        '   - Each completed work item (plan implemented, task finished) increments \\`consumed_units\\`.\\n\\n'
        '4. **Renewal is an explicit decision:**\\n'
        '   - If the window or budget is running out but work remains, ask the user whether to renew.\\n'
        '   - Call \\`role_lease_renew\\` with a new window_end and/or budget_units extension.\\n'
        '   - Renewal auto-expires a stale ACTIVE lease before creating a new one.\\n\\n'
        '5. **Revoke on completion or session end:**\\n'
        '   - Call \\`role_lease_revoke\\` when you are done consuming work.\\n'
        '   - This frees the role so another session can acquire it.\\n\\n'
        '6. **Lease is NOT ownership \\u2014 unclaimed work returns to READY on expiry.**\\n'
        '   - The pipeline-health sweep detects stale leases and surfaces them as findings.\\n'
        '   - Handoff to scheduled OpenCode runs is a non-event because work lives in the DB.\\n\\n'
        '## Lease Lifecycle\\n'
        '```\\n'
        'issue \\u2192 ACTIVE (one per role)\\n'
        '  \\u251c\\u2500 window_end passes \\u2192 stale (sweep detects)\\n'
        '  \\u251c\\u2500 budget exhausted \\u2192 stale (sweep detects)\\n'
        '  \\u251c\\u2500 renew \\u2192 extended window/budget (resets stale check)\\n'
        '  \\u2514\\u2500 revoke \\u2192 RELEASED (voluntary release)\\n'
        '```',
        ARRAY['role-lease', 'orientation', 'plan-1286', 'bounded-work'],
        ARRAY['start of turn', 'role lease', 'lease check', 'am i leased', 'leased builder'],
        ARRAY['role_lease_status', 'role_lease_issue', 'role_lease_renew', 'role_lease_revoke']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        FOREACH v_role IN ARRAY ARRAY['builder', 'engineer']::TEXT[] LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;

    RAISE NOTICE 'Memory procedures seeded.';
END $$;`;
}

// ── AI Config CRUD ─────────────────────────────────────────────────

export interface AIProviderRow {
  id: string; name: string;
  type: "openai" | "anthropic" | "google" | "ollama" | "opencode" | "codex" | "spring_ai" | "lm_server" | "custom";
  endpoint_url: string | null; api_key: string | null;
  config_json: string; created_at: string; updated_at: string;
}

export interface AIHarnessRow {
  id: string; name: string; invocation_semantics: string;
  created_at: string; updated_at: string;
}

export interface AIModelRow {
  id: string; name: string; harness_id: string;
  provider_id: string | null; model_identifier: string;
  created_at: string; updated_at: string;
}

export interface AIRoleConfigRow {
  id: string; role: string;
  provider_id: string; harness_id: string; model_id: string;
  extra_params: string; created_at: string; updated_at: string;
}

export interface AIRoleModelRow {
  id: string; role: string; model_id: string; priority: number;
  provider_id: string | null; harness_id: string | null;
}

export interface ConfigBundleRow {
  id: string;
  name: string;
  role: string;
  model_id: string;
  provider_id: string | null;
  harness_id: string | null;
  priority: number;
  invocation_mode: "CLI" | "HTTP" | "SDK" | "MCP" | "INTERACTIVE";
  command: string | null;
  endpoint_url: string | null;
  timeout_ms: number | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface AIConfigSnapshot {
  providers: AIProviderRow[]; harnesses: AIHarnessRow[];
  models: AIModelRow[]; roles: AIRoleConfigRow[];
  bundles: ConfigBundleRow[];
}

export interface ConfigValidationWarning {
  role: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

// ── Providers ─────────────────────────────────────────────────────

export async function getAIProviders(): Promise<AIProviderRow[]> {
  return qAll("SELECT * FROM providers ORDER BY name");
}

export async function getAIProvider(id: string): Promise<AIProviderRow | undefined> {
  return qOne("SELECT * FROM providers WHERE id = @id", { id });
}

export async function upsertAIProvider(
  p: Partial<AIProviderRow> & { id: string; name: string; type: string },
): Promise<void> {
  const now = new Date().toISOString();
  await qRun(
    `INSERT INTO providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
     VALUES (@id, @name, @type, @endpoint_url, @api_key, @config_json, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       name = EXCLUDED.name, type = EXCLUDED.type,
       endpoint_url = EXCLUDED.endpoint_url, api_key = EXCLUDED.api_key,
       config_json = EXCLUDED.config_json, updated_at = EXCLUDED.updated_at`,
    {
      ...p, endpoint_url: p.endpoint_url ?? null, api_key: p.api_key ?? null,
      config_json: p.config_json ?? "{}",
      created_at: p.created_at ?? now, updated_at: now,
    }
  );
}

export async function deleteAIProvider(id: string): Promise<boolean> {
  const changes = await qRun("DELETE FROM providers WHERE id = @id", { id });
  return changes > 0;
}

// ── Harnesses ─────────────────────────────────────────────────────

export async function getAIHarnesses(): Promise<AIHarnessRow[]> {
  return qAll("SELECT * FROM harnesses ORDER BY name");
}

export async function getAIHarness(id: string): Promise<AIHarnessRow | undefined> {
  return qOne("SELECT * FROM harnesses WHERE id = @id", { id });
}

export async function upsertAIHarness(
  h: Partial<AIHarnessRow> & { id: string; name: string },
): Promise<void> {
  const now = new Date().toISOString();
  await qRun(
    `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
     VALUES (@id, @name, @invocation_semantics, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       name = EXCLUDED.name, invocation_semantics = EXCLUDED.invocation_semantics,
       updated_at = EXCLUDED.updated_at`,
    { ...h, invocation_semantics: h.invocation_semantics ?? "{}",
      created_at: h.created_at ?? now, updated_at: now }
  );
}

export async function deleteAIHarness(id: string): Promise<boolean> {
  const changes = await qRun("DELETE FROM harnesses WHERE id = @id", { id });
  return changes > 0;
}

// ── Models ────────────────────────────────────────────────────────

export async function getAIModels(): Promise<AIModelRow[]> {
  return qAll("SELECT * FROM models ORDER BY name");
}

export async function getAIModel(id: string): Promise<AIModelRow | undefined> {
  return qOne("SELECT * FROM models WHERE id = @id", { id });
}

export async function upsertAIModel(
  m: Partial<AIModelRow> & { id: string; name: string; harness_id: string; model_identifier: string },
): Promise<void> {
  const now = new Date().toISOString();
  await qRun(
    `INSERT INTO models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
     VALUES (@id, @name, @harness_id, @provider_id, @model_identifier, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       name = EXCLUDED.name, harness_id = EXCLUDED.harness_id,
       provider_id = EXCLUDED.provider_id, model_identifier = EXCLUDED.model_identifier,
       updated_at = EXCLUDED.updated_at`,
    { ...m, provider_id: m.provider_id ?? null,
      created_at: m.created_at ?? now, updated_at: now }
  );
}

export async function deleteAIModel(id: string): Promise<boolean> {
  const changes = await qRun("DELETE FROM models WHERE id = @id", { id });
  return changes > 0;
}

// ── Role Configs (via config_bundle) ─────────────────────────────
//
// The `role_config` table was removed. Role assignments are now stored in
// `config_bundle`, where the lowest-priority (highest preference) active
// bundle per role acts as the "primary" role config.

export async function getAIRoleConfigs(): Promise<AIRoleConfigRow[]> {
  return qAll(
    `SELECT DISTINCT ON (cb.role)
            cb.id, cb.role, cb.model_id,
            COALESCE(cb.provider_id, m.provider_id) AS provider_id,
            COALESCE(cb.harness_id, m.harness_id) AS harness_id,
            '{}'::TEXT AS extra_params, cb.created_at, cb.updated_at
     FROM config_bundle cb
     JOIN models m ON cb.model_id = m.id
     WHERE cb.is_active = 1
     ORDER BY cb.role, cb.priority ASC`
  );
}

export async function getAIRoleConfig(role: string): Promise<AIRoleConfigRow | undefined> {
  return qOne(
    `SELECT cb.id, cb.role, cb.model_id,
            COALESCE(cb.provider_id, m.provider_id) AS provider_id,
            COALESCE(cb.harness_id, m.harness_id) AS harness_id,
            '{}'::TEXT AS extra_params, cb.created_at, cb.updated_at
     FROM config_bundle cb
     JOIN models m ON cb.model_id = m.id
     WHERE cb.role = @role AND cb.is_active = 1
     ORDER BY cb.priority ASC LIMIT 1`,
    { role }
  );
}

export async function upsertAIRoleConfig(
  rc: Partial<AIRoleConfigRow> & { id: string; role: string; provider_id: string; harness_id: string; model_id: string },
): Promise<void> {
  const now = new Date().toISOString();
  await qRun(
    `INSERT INTO config_bundle (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, metadata, created_at, updated_at)
     VALUES (@id, @name, @role, @model_id, @provider_id, @harness_id, 0, 'CLI', 1, '{}', @created_at, @updated_at)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, role = EXCLUDED.role, model_id = EXCLUDED.model_id,
       provider_id = EXCLUDED.provider_id, harness_id = EXCLUDED.harness_id,
       priority = 0, is_active = 1, updated_at = EXCLUDED.updated_at`,
    { ...rc, name: `Primary: ${rc.model_id} for ${rc.role}`,
      extra_params: rc.extra_params ?? "{}",
      created_at: rc.created_at ?? now, updated_at: now }
  );
}

export async function deleteAIRoleConfig(role: string): Promise<boolean> {
  const changes = await qRun("DELETE FROM config_bundle WHERE role = @role", { role });
  return changes > 0;
}

// ── Config Bundles (replaces role_config + role_models) ──────────

export async function getConfigBundles(role: string): Promise<ConfigBundleRow[]> {
  return qAll(
    "SELECT * FROM config_bundle WHERE role = @role ORDER BY priority ASC",
    { role }
  );
}

export async function getAllConfigBundles(): Promise<ConfigBundleRow[]> {
  return qAll("SELECT * FROM config_bundle ORDER BY role, priority ASC");
}

export async function getConfigBundle(id: string): Promise<ConfigBundleRow | undefined> {
  return qOne("SELECT * FROM config_bundle WHERE id = @id", { id });
}

export async function upsertConfigBundle(
  b: Partial<ConfigBundleRow> & { id: string; name: string; role: string; model_id: string },
): Promise<void> {
  const now = new Date().toISOString();
  await qRun(
    `INSERT INTO config_bundle (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, command, endpoint_url, timeout_ms, valid_from, valid_to, is_active, metadata, created_at, updated_at)
     VALUES (@id, @name, @role, @model_id, @provider_id, @harness_id, @priority, @invocation_mode, @command, @endpoint_url, @timeout_ms, @valid_from, @valid_to, @is_active, @metadata, @created_at, @updated_at)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, role = EXCLUDED.role,
       model_id = EXCLUDED.model_id, provider_id = EXCLUDED.provider_id,
       harness_id = EXCLUDED.harness_id, priority = EXCLUDED.priority,
       invocation_mode = EXCLUDED.invocation_mode, command = EXCLUDED.command,
       endpoint_url = EXCLUDED.endpoint_url, timeout_ms = EXCLUDED.timeout_ms,
       is_active = EXCLUDED.is_active, metadata = EXCLUDED.metadata,
       updated_at = EXCLUDED.updated_at`,
    {
      ...b,
      provider_id: b.provider_id ?? null,
      harness_id: b.harness_id ?? null,
      priority: b.priority ?? 0,
      invocation_mode: b.invocation_mode ?? "CLI",
      command: b.command ?? null,
      endpoint_url: b.endpoint_url ?? null,
      timeout_ms: b.timeout_ms ?? null,
      valid_from: b.valid_from ?? null,
      valid_to: b.valid_to ?? null,
      is_active: b.is_active ?? 1,
      metadata: b.metadata ?? "{}",
      created_at: b.created_at ?? now,
      updated_at: now,
    }
  );
}

export async function deleteConfigBundle(id: string): Promise<boolean> {
  const changes = await qRun("DELETE FROM config_bundle WHERE id = @id", { id });
  return changes > 0;
}

export async function upsertConfigBundles(
  role: string, bundles: {
    model_id: string; priority: number;
    provider_id?: string | null; harness_id?: string | null;
    name?: string; invocation_mode?: "CLI" | "HTTP" | "SDK" | "MCP" | "INTERACTIVE";
    command?: string | null; endpoint_url?: string | null; timeout_ms?: number | null;
  }[],
): Promise<void> {
  if (bundles.length === 0) return;
  const now = new Date().toISOString();

  console.log(`[upsertConfigBundles] Starting for role: ${role}, bundles: ${bundles.length}`);

  await withTransaction(async (client) => {
    const deleteResult = await tRun(client, "DELETE FROM config_bundle WHERE role = @role", { role });
    console.log(`[upsertConfigBundles] Deleted rows for role ${role}:`, deleteResult);
    
    for (const b of bundles) {
      const id = `cb-${role}-${b.model_id}`;
      console.log(`[upsertConfigBundles] Inserting bundle: ${id}`);
      await tRun(client,
        `INSERT INTO config_bundle
           (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode,
            command, endpoint_url, timeout_ms, is_active, metadata, created_at, updated_at)
         VALUES
           (@id, @name, @role, @model_id, @provider_id, @harness_id, @priority, @invocation_mode,
            @command, @endpoint_url, @timeout_ms, 1, '{}', @now, @now)`,
        {
          id,
          name: b.name ?? `Bundle: ${b.model_id}`,
          role,
          model_id: b.model_id,
          priority: b.priority,
          provider_id: b.provider_id ?? null,
          harness_id: b.harness_id ?? null,
          invocation_mode: b.invocation_mode ?? "CLI",
          command: b.command ?? null,
          endpoint_url: b.endpoint_url ?? null,
          timeout_ms: b.timeout_ms ?? null,
          now,
        }
      );
    }
    console.log(`[upsertConfigBundles] Completed for role: ${role}`);
  });
}

// ── Session CRUD ────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  agent_role: string;
  start_iso: string;
  end_iso: string | null;
  exit_code: number | null;
  pid: number | null;
  is_running: number;
  error_info: string | null;
  model: string | null;
  plans_processed: string;
  plan_count: number;
  cost_usd: number | null;
  workflow_id: string | null;
  run_id: string | null;
  created_at: string;
}

export async function startSession(session: {
  id: string; agent_role: string; start_iso: string;
  plans_processed?: string[]; plan_count?: number;
  model?: string;
}): Promise<void> {
  await qRun(
    `INSERT INTO sessions (id, agent_role, start_iso, plans_processed, plan_count, model, created_at)
     VALUES (@id, @agent_role, @start_iso, @plans_processed, @plan_count, @model, @created_at)`,
    { id: session.id, agent_role: session.agent_role, start_iso: session.start_iso,
      plans_processed: JSON.stringify(session.plans_processed || []),
      plan_count: session.plan_count ?? 0, model: session.model ?? null,
      created_at: session.start_iso }
  );
}

export async function getSession(id: string): Promise<SessionRow | undefined> {
  return qOne("SELECT * FROM sessions WHERE id = @id", { id });
}

export async function endSession(id: string, exitCode: number, endIso: string): Promise<void> {
  await qRun(
    `UPDATE sessions SET end_iso = @end_iso, exit_code = @exit_code, is_running = 0 WHERE id = @id`,
    { end_iso: endIso, exit_code: exitCode, id }
  );
}

export async function updateSessionPid(id: string, pid: number): Promise<void> {
  await qRun("UPDATE sessions SET pid = @pid WHERE id = @id", { pid, id });
}

export async function releaseSessionTickets(sessionId: string): Promise<number> {
  // Tackle-mcp has no tickets; stub for interface compatibility
  return 0;
}

export async function getAllSessions(): Promise<SessionRow[]> {
  return qAll("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100");
}

// ── Circuit Breaker / Failure Recovery ─────────────────────────────

export interface CircuitBreakerRow {
  id: number;
  tripped: number;
  tripped_at: string | null;
  error: string | null;
  detail: string | null;
  source: string | null;
  retry_after: number;
  paused: number;
  wake_requested_at: string | null;
  max_retries_per_model: number;
  retry_delay_seconds: number;
  max_fallbacks: number;
  push_back_to_pending: number;
  updated_at: string | null;
}

export async function getBreaker(): Promise<CircuitBreakerRow> {
  const row = await qOne("SELECT * FROM circuit_breaker WHERE id = 1");
  return row || {
    id: 1, tripped: 0, tripped_at: null, error: null, detail: null, source: null,
    retry_after: 1800, paused: 0, wake_requested_at: null,
    max_retries_per_model: 3, retry_delay_seconds: 120, max_fallbacks: 3,
    push_back_to_pending: 1, updated_at: null,
  };
}

export async function saveFailureRecoveryConfig(config: {
  max_retries_per_model?: number;
  retry_delay_seconds?: number;
  max_fallbacks?: number;
  push_back_to_pending?: boolean;
  circuit_breaker_retry_after?: number;
}): Promise<void> {
  const pool = getDb();
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE ${TACKLE_SCHEMA}.circuit_breaker SET
      max_retries_per_model = $1,
      retry_delay_seconds = $2,
      max_fallbacks = $3,
      push_back_to_pending = $4,
      retry_after = $5,
      updated_at = $6
    WHERE id = 1`,
    [
      typeof config.max_retries_per_model === 'number' ? config.max_retries_per_model : 3,
      typeof config.retry_delay_seconds === 'number' ? config.retry_delay_seconds : 120,
      typeof config.max_fallbacks === 'number' ? config.max_fallbacks : 3,
      config.push_back_to_pending !== false ? 1 : 0,
      typeof config.circuit_breaker_retry_after === 'number' ? config.circuit_breaker_retry_after : 1800,
      now,
    ]
  );
}

// ── Agent Scheduler ──────────────────────────────────────────────────

// ── Roles Registry CRUD ─────────────────────────────────────────────

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export async function getRoles(): Promise<RoleRow[]> {
  return qAll("SELECT * FROM roles ORDER BY name");
}

export async function getRole(idOrName: string): Promise<RoleRow | undefined> {
  // Check if input looks like a UUID before trying UUID query
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(idOrName)) {
    const byId = await qOne("SELECT * FROM roles WHERE id = @id", { id: idOrName });
    if (byId) return byId;
  }
  return qOne("SELECT * FROM roles WHERE name = @name", { name: idOrName });
}

export async function upsertRole(
  r: Partial<RoleRow> & { name: string; description?: string },
): Promise<RoleRow> {
  const now = new Date().toISOString();
  // Use the DEFAULT gen_random_uuid() when no id is provided
  const hasId = !!r.id;
  return qOne(
    hasId
      ? `INSERT INTO roles (id, name, description, created_at, updated_at)
         VALUES (@id, @name, @description, @now, @now)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           updated_at = EXCLUDED.updated_at
         RETURNING *`
      : `INSERT INTO roles (name, description, created_at, updated_at)
         VALUES (@name, @description, @now, @now)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
    { id: r.id ?? undefined, name: r.name, description: r.description ?? "", now }
  );
}

export async function deleteRole(idOrName: string): Promise<boolean> {
  // Check if input looks like a UUID before trying UUID query
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let changes = 0;
  if (uuidPattern.test(idOrName)) {
    changes = await qRun("DELETE FROM roles WHERE id = @id", { id: idOrName });
  }
  if (changes === 0) {
    changes = await qRun("DELETE FROM roles WHERE name = @name", { name: idOrName });
  }
  return changes > 0;
}

export interface AgentSchedulerRow {
  id: number;
  role: string;
  model_id: string | null;
  harness: string;
  agent_config: string;
  schedule_type: string;
  schedule_value: number;
  project_dir: string;
  task_slug: string | null;
  enabled: number;
  last_run_at: string | null;
  last_run_status: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export async function listSchedulerEntries(): Promise<AgentSchedulerRow[]> {
  return qAll("SELECT * FROM agent_scheduler ORDER BY role, id ASC");
}

export async function getSchedulerEntry(id: number): Promise<AgentSchedulerRow | undefined> {
  return qOne("SELECT * FROM agent_scheduler WHERE id = @id", { id });
}

// schedule_value is INTEGER seconds; the UI/agents may send durations like
// "15m" or "1h" — parse them so they store the intended seconds instead of
// silently falling back to the default (cron strings are unparseable as
// seconds and keep the default; the runner only re-fires interval entries).
function toScheduleSeconds(v: unknown, dflt: number): number {
  if (v === undefined || v === null || v === "") return dflt;
  if (typeof v === "number") return Number.isFinite(v) && v >= 1 ? v : dflt;
  const s = String(v).trim();
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 10);
    const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, ms: 0.001 };
    const secs = n * (mult[m[2] || "s"]);
    if (secs >= 1 && Number.isFinite(secs)) return Math.round(secs);
  }
  const n2 = Number(v);
  return Number.isFinite(n2) && n2 >= 1 ? n2 : dflt;
}

export async function createSchedulerEntry(data: {
  role: string; model_id?: string; harness?: string;
  agent_config?: string; schedule_type?: string; schedule_value?: number | string;
  project_dir?: string; task_slug?: string | null; enabled?: number;
}): Promise<AgentSchedulerRow> {
  const now = new Date().toISOString();
  const row = await qOne(`
    INSERT INTO agent_scheduler (role, model_id, harness, agent_config, schedule_type, schedule_value, project_dir, task_slug, enabled, metadata, created_at, updated_at)
    VALUES (@role, @model_id, @harness, @agent_config, @schedule_type, @schedule_value, @project_dir, @task_slug, @enabled, '{}', @now, @now)
    RETURNING *
  `, {
    role: data.role,
    model_id: data.model_id ?? null,
    harness: data.harness ?? "opencode",
    agent_config: data.agent_config ?? "{}",
    schedule_type: data.schedule_type ?? "interval",
    schedule_value: toScheduleSeconds(data.schedule_value, 3600),
    project_dir: data.project_dir ?? "/home/codex/dev",
    task_slug: data.task_slug ?? null,
    enabled: data.enabled ?? 1,
    now,
  });
  return row;
}

export async function updateSchedulerEntry(id: number, data: Partial<{
  role: string; model_id: string | null; harness: string;
  agent_config: string; schedule_type: string; schedule_value: number | string;
  project_dir: string; task_slug: string | null; enabled: number; last_run_at: string;
  last_run_status: string; metadata: string;
}>): Promise<AgentSchedulerRow | undefined> {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, any> = { id, now };
  const fields = ["role", "model_id", "harness", "agent_config", "schedule_type",
    "schedule_value", "project_dir", "task_slug", "enabled", "last_run_at", "last_run_status", "metadata"];
  for (const f of fields) {
    if ((data as any)[f] !== undefined) {
      sets.push(`${f} = @${f}`);
      params[f] = f === "schedule_value"
        ? toScheduleSeconds((data as any)[f], 3600)
        : (data as any)[f];
    }
  }
  return qOne(
    `UPDATE agent_scheduler SET ${sets.join(", ")} WHERE id = @id RETURNING *`,
    params
  );
}

export async function deleteSchedulerEntry(id: number): Promise<boolean> {
  const changes = await qRun("DELETE FROM agent_scheduler WHERE id = @id", { id });
  return changes > 0;
}

/**
 * Due scheduler entry, enriched with the prompt payload an agent needs to
 * start the run: the role's DEFAULT persona (latest `opencode-persona`)
 * as base_prompt_body, the attached task's template body as
 * task_prompt_body, and assembled_prompt = base + appended task prompt.
 * When no task is attached, assembled_prompt === base_prompt_body.
 */
export interface DueSchedulerEntry extends AgentSchedulerRow {
  base_prompt_body: string | null;
  task_prompt_body: string | null;
  assembled_prompt: string | null;
}

// Latest version of a (role, slug) prompt template body.
async function resolvePromptBody(role: string, slug: string): Promise<string | null> {
  const row = await qOne(
    `SELECT DISTINCT ON (role, slug) body_md
     FROM prompts
     WHERE role = @role AND slug = @slug
     ORDER BY role, slug, version DESC
     LIMIT 1`,
    { role, slug }
  );
  return row?.body_md ?? null;
}

async function resolveSchedulerPrompt(
  entry: AgentSchedulerRow
): Promise<Pick<DueSchedulerEntry, "base_prompt_body" | "task_prompt_body" | "assembled_prompt">> {
  // Default system prompt for the role: latest `opencode-persona` template.
  const base = await resolvePromptBody(entry.role, "opencode-persona");

  // Attached task (if any): resolve its bound template and append its body.
  let taskBody: string | null = null;
  if (entry.task_slug) {
    const task = await qOne(
      `SELECT p.role AS prompt_role, p.slug AS prompt_slug
       FROM tasks t
       LEFT JOIN prompts p ON p.id = t.prompt_id
       WHERE t.task_slug = @slug
       ORDER BY t.active DESC, t.updated_at DESC
       LIMIT 1`,
      { slug: entry.task_slug }
    );
    if (task?.prompt_role && task?.prompt_slug) {
      taskBody = await resolvePromptBody(task.prompt_role, task.prompt_slug);
    }
  }

  let assembled: string | null = base;
  if (taskBody) {
    // Exact contract: base persona + separator + appended task prompt.
    // No trim() — the seeded persona bodies carry meaningful leading
    // whitespace/control chars that must survive verbatim.
    assembled = base
      ? `${base}\n\n---\n\n## Attached Task: ${entry.task_slug}\n\n${taskBody}`
      : `## Attached Task: ${entry.task_slug}\n\n${taskBody}`;
  }
  return { base_prompt_body: base, task_prompt_body: taskBody, assembled_prompt: assembled };
}

export async function getDueSchedulerEntries(): Promise<DueSchedulerEntry[]> {
  const rows = await qAll(`
    SELECT * FROM agent_scheduler
    WHERE enabled = 1
      AND schedule_type <> 'manual'
      AND (
        last_run_at IS NULL
        OR (
          schedule_type = 'interval'
          AND EXTRACT(EPOCH FROM NOW() - last_run_at::timestamp) >= schedule_value
        )
      )
    ORDER BY last_run_at ASC NULLS FIRST
  `);
  const enriched = await Promise.all(
    rows.map(async (row) => ({ ...row, ...(await resolveSchedulerPrompt(row)) }))
  );
  return enriched;
}

// ── Snapshot / Import / Export / Validate ─────────────────────────

export async function getAIConfigSnapshot(): Promise<AIConfigSnapshot> {
  return {
    providers: await getAIProviders(),
    harnesses: await getAIHarnesses(),
    models: await getAIModels(),
    roles: await getAIRoleConfigs(),
    bundles: await getAllConfigBundles(),
  };
}

export async function importAIConfig(
  data: AIConfigSnapshot & { bundles?: ConfigBundleRow[] },
): Promise<{ providers: number; harnesses: number; models: number; roles: number; bundles: number }> {
  let pCount = 0, hCount = 0, mCount = 0, bCount = 0;
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    await tRun(client, "DELETE FROM config_bundle");
    await tRun(client, "DELETE FROM models");
    await tRun(client, "DELETE FROM harnesses");
    await tRun(client, "DELETE FROM providers");

    for (const p of data.providers || []) {
      await tRun(client,
        `INSERT INTO providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
         VALUES (@id, @name, @type, @endpoint_url, @api_key, @config_json, @created_at, @updated_at)`,
        { id: p.id, name: p.name, type: p.type, endpoint_url: p.endpoint_url ?? null,
          api_key: p.api_key ?? null, config_json: p.config_json ?? "{}",
          created_at: p.created_at || now, updated_at: now }
      );
      pCount++;
    }

    for (const h of data.harnesses || []) {
      await tRun(client,
        `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
         VALUES (@id, @name, @invocation_semantics, @created_at, @updated_at)`,
        { id: h.id, name: h.name, invocation_semantics: h.invocation_semantics ?? "{}",
          created_at: h.created_at || now, updated_at: now }
      );
      hCount++;
    }

    for (const m of data.models || []) {
      await tRun(client,
        `INSERT INTO models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
         VALUES (@id, @name, @harness_id, @provider_id, @model_identifier, @created_at, @updated_at)`,
        { id: m.id, name: m.name, harness_id: m.harness_id, provider_id: m.provider_id ?? null,
          model_identifier: m.model_identifier, created_at: m.created_at || now, updated_at: now }
      );
      mCount++;
    }

    // Convert legacy roles to config_bundle entries (priority=0 primary)
    for (const r of data.roles || []) {
      await tRun(client,
        `INSERT INTO config_bundle
           (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, metadata, created_at, updated_at)
         VALUES
           (@id, @name, @role, @model_id, @provider_id, @harness_id, 0, 'CLI', 1, '{}', @created_at, @updated_at)
         ON CONFLICT (role, model_id) DO NOTHING`,
        { id: `cb-${r.role}-${r.model_id}`, name: `Primary: ${r.model_id} for ${r.role}`,
          role: r.role, model_id: r.model_id, provider_id: r.provider_id ?? null,
          harness_id: r.harness_id ?? null, created_at: r.created_at || now, updated_at: now }
      );
    }

    for (const b of data.bundles || []) {
      await tRun(client,
        `INSERT INTO config_bundle
           (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode,
            command, endpoint_url, timeout_ms, valid_from, valid_to, is_active, metadata, created_at, updated_at)
         VALUES
           (@id, @name, @role, @model_id, @provider_id, @harness_id, @priority, @invocation_mode,
            @command, @endpoint_url, @timeout_ms, @valid_from, @valid_to, @is_active, @metadata, @created_at, @updated_at)`,
        {
          id: b.id || `cb-${b.role}-${b.model_id}`,
          name: b.name ?? `Bundle: ${b.model_id}`,
          role: b.role, model_id: b.model_id,
          provider_id: b.provider_id ?? null,
          harness_id: b.harness_id ?? null,
          priority: b.priority ?? 0,
          invocation_mode: b.invocation_mode ?? "CLI",
          command: b.command ?? null,
          endpoint_url: b.endpoint_url ?? null,
          timeout_ms: b.timeout_ms ?? null,
          valid_from: b.valid_from ?? null,
          valid_to: b.valid_to ?? null,
          is_active: b.is_active ?? 1,
          metadata: b.metadata ?? "{}",
          created_at: b.created_at || now,
          updated_at: now,
        }
      );
      bCount++;
    }
  });

  console.log(`[import-ai-config] Imported ${pCount} providers, ${hCount} harnesses, ${mCount} models, ${bCount} bundles.`);
  return { providers: pCount, harnesses: hCount, models: mCount, roles: (data.roles || []).length, bundles: bCount };
}

export async function validateAIConfig(): Promise<ConfigValidationWarning[]> {
  const cfg = await getAIConfigSnapshot();
  const warnings: ConfigValidationWarning[] = [];

  const harnessMap = new Map(cfg.harnesses.map(h => [h.id, h]));
  const modelMap = new Map(cfg.models.map(m => [m.id, m]));
  const providerMap = new Map(cfg.providers.map(p => [p.id, p]));
  const bundleMap = new Map<string, ConfigBundleRow[]>();
  for (const b of cfg.bundles) {
    const list = bundleMap.get(b.role) || [];
    list.push(b);
    bundleMap.set(b.role, list);
  }

  for (const rc of cfg.roles) {
    if (!modelMap.has(rc.model_id)) {
      warnings.push({
        role: rc.role, field: "model_id",
        message: `Primary model '${rc.model_id}' not found in models table.`,
        severity: "error",
      });
    } else {
      const model = modelMap.get(rc.model_id)!;
      const harness = harnessMap.get(model.harness_id);
      if (!harness) {
        warnings.push({
          role: rc.role, field: "harness_id",
          message: `Primary model '${rc.model_id}' references harness '${model.harness_id}' which does not exist.`,
          severity: "error",
        });
      } else {
        const sem = parseJsonSafe(harness.invocation_semantics, {});
        if (!sem?.binary) {
          warnings.push({
            role: rc.role, field: "invocation_semantics.binary",
            message: `Harness '${harness.name}' for primary model '${model.name}' has no 'binary' in invocation_semantics.`,
            severity: "error",
          });
        }
      }
      if (model.provider_id && !providerMap.has(model.provider_id)) {
        warnings.push({
          role: rc.role, field: "provider_id",
          message: `Primary model '${rc.model_id}' references provider '${model.provider_id}' which does not exist.`,
          severity: "warning",
        });
      }
    }

    const bundles = bundleMap.get(rc.role) || [];
    for (const b of bundles) {
      if (!modelMap.has(b.model_id)) {
        warnings.push({
          role: rc.role, field: "model_id",
          message: `Bundle model '${b.model_id}' not found in models table.`,
          severity: "error",
        });
        continue;
      }
      const model = modelMap.get(b.model_id)!;
      const harnessId = b.harness_id || model.harness_id;
      const harness = harnessMap.get(harnessId);
      if (!harness) {
        warnings.push({
          role: rc.role, field: "harness_id",
          message: `Bundle model '${b.model_id}' references harness '${harnessId}' which does not exist.`,
          severity: "error",
        });
      } else {
        const sem = parseJsonSafe(harness.invocation_semantics, {});
        if (!sem?.binary) {
          warnings.push({
            role: rc.role, field: "invocation_semantics.binary",
            message: `Harness '${harness.name}' for bundle model '${model.name}' has no 'binary' in invocation_semantics.`,
            severity: "warning",
          });
        }
      }
      const providerId = b.provider_id || model.provider_id;
      if (providerId && !providerMap.has(providerId)) {
        warnings.push({
          role: rc.role, field: "provider_id",
          message: `Bundle model '${b.model_id}' references provider '${providerId}' which does not exist.`,
          severity: "warning",
        });
      }
    }

    if (bundles.length === 0) {
      warnings.push({
        role: rc.role, field: "bundles",
        message: `Role '${rc.role}' has no config bundles configured. If the primary model fails, execution will halt.`,
        severity: "warning",
      });
    }
  }

  return warnings;
}

function parseJsonSafe(text: string, fallback: any): any {
  try { return JSON.parse(text); } catch { return fallback; }
}

// ── Resolved config (joined rows for agent_chat) ────────────────────

export interface ResolvedRoleConfig {
  role: string;
  model_identifier: string;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  api_key: string | null;
  endpoint_url: string | null;
  harness_name: string;
  invocation_semantics: any;
  fallback_models: ResolvedFallbackModel[];
}

export interface ResolvedFallbackModel {
  priority: number;
  model_identifier: string;
  provider_type: string;
  provider_name: string;
  provider_id: string;
  api_key: string | null;
  endpoint_url: string | null;
  harness_name: string;
  harness_id: string;
  invocation_semantics: any;
  invocation_mode: string;
  command: string | null;
  timeout_ms: number | null;
}

export async function getResolvedRoleConfig(role: string): Promise<ResolvedRoleConfig | null> {
  const row = await qOne(
    `SELECT cb.role,
            m.model_identifier,
            p.id            AS provider_id,
            p.name          AS provider_name,
            COALESCE(p.type, '') AS provider_type,
            p.api_key,
            COALESCE(cb.endpoint_url, p.endpoint_url) AS endpoint_url,
            COALESCE(h.name, '') AS harness_name,
            COALESCE(h.invocation_semantics, '{}') AS invocation_semantics
     FROM config_bundle cb
     JOIN models m          ON cb.model_id = m.id
     LEFT JOIN providers p  ON COALESCE(cb.provider_id, m.provider_id) = p.id
     LEFT JOIN harnesses h  ON COALESCE(cb.harness_id, m.harness_id) = h.id
     WHERE cb.role = @role AND cb.is_active = 1
     ORDER BY cb.priority ASC LIMIT 1`,
    { role }
  );
  if (!row) return null;

  const fallbacks = await getResolvedFallbackModels(role);

  return {
    role: row.role,
    model_identifier: row.model_identifier,
    provider_id: row.provider_id ?? "",
    provider_name: row.provider_name ?? "",
    provider_type: row.provider_type,
    api_key: row.api_key ?? null,
    endpoint_url: row.endpoint_url ?? null,
    harness_name: row.harness_name,
    invocation_semantics: parseJsonSafe(row.invocation_semantics, {}),
    fallback_models: fallbacks,
  };
}

export async function getResolvedFallbackModels(role: string): Promise<ResolvedFallbackModel[]> {
  const rows = await qAll(
    `SELECT cb.priority,
            m.model_identifier,
            p.type          AS provider_type,
            p.name          AS provider_name,
            p.api_key,
            cb.endpoint_url,  -- bundle-level override
            p.id            AS provider_id,
            h.name          AS harness_name,
            h.id            AS harness_id,
            h.invocation_semantics,
            cb.invocation_mode,
            cb.command,
            cb.timeout_ms
     FROM config_bundle cb
     JOIN models m        ON cb.model_id = m.id
     LEFT JOIN providers p ON COALESCE(cb.provider_id, m.provider_id) = p.id
     LEFT JOIN harnesses h ON COALESCE(cb.harness_id, m.harness_id) = h.id
     WHERE cb.role = @role AND cb.is_active = 1
     ORDER BY cb.priority ASC`,
    { role }
  );

  return rows.map((row: any) => ({
    priority: row.priority,
    model_identifier: row.model_identifier,
    provider_type: row.provider_type ?? "",
    provider_name: row.provider_name ?? "",
    provider_id: row.provider_id ?? "",
    api_key: row.api_key ?? null,
    endpoint_url: row.endpoint_url ?? null,
    harness_name: row.harness_name ?? "",
    harness_id: row.harness_id ?? "",
    invocation_semantics: parseJsonSafe(row.invocation_semantics, {}),
    invocation_mode: row.invocation_mode ?? "CLI",
    command: row.command ?? null,
    timeout_ms: row.timeout_ms ?? null,
  }));
}

// Export resolved types with new fields
export interface ResolvedFallbackModelExtended extends ResolvedFallbackModel {
  invocation_mode: string;
  command: string | null;
  timeout_ms: number | null;
}

export type { ResolvedRoleConfig as RoleConfigResolved };

// ── Seed defaults ───────────────────────────────────────────────────

const DEFAULT_PROVIDERS = [
  { name: "OpenAI", type: "openai", endpoint_url: "https://api.openai.com/v1" },
  { name: "Anthropic", type: "anthropic", endpoint_url: "https://api.anthropic.com/v1" },
  { name: "Ollama", type: "ollama", endpoint_url: "http://localhost:11434" },
  { name: "OpenCode", type: "opencode", endpoint_url: "http://localhost:3100" },
  { name: "Codex", type: "codex", endpoint_url: "" },
];

const DEFAULT_MODELS: Array<{ id: string; name: string; harnessId: string; providerId: string; modelId: string }> = [
  { id: "mod-gpt4o", name: "GPT-4o", harnessId: "harn-opencode", providerId: "prov-openai", modelId: "gpt-4o" },
  { id: "mod-claude-sonnet", name: "Claude Sonnet 4", harnessId: "harn-opencode", providerId: "prov-anthropic", modelId: "claude-sonnet-4-20250514" },
  { id: "mod-llama3", name: "Llama 3 (local)", harnessId: "harn-ollama-sdk", providerId: "prov-ollama", modelId: "llama3" },
  { id: "mod-big-pickle", name: "Big Pickle", harnessId: "harn-opencode", providerId: "prov-opencode", modelId: "big-pickle" },
  { id: "mod-codex-gpt4o", name: "GPT-4o (via Codex)", harnessId: "harn-codex-cli", providerId: "prov-codex", modelId: "gpt-4o" },
];

const ALL_ROLES = ["planner", "builder", "reviewer", "critic", "analyst", "architect", "inspector", "engineer", "rover"] as const;

export async function seedDefaultAIConfig(force?: boolean): Promise<{
  seeded: boolean; providers: number; harnesses: number; models: number; roles: number; message: string;
}> {
  if (!force) {
    const existing = await qOne("SELECT COUNT(*) as c FROM providers");
    if (existing?.c > 0) {
      return { seeded: false, providers: 0, harnesses: 0, models: 0, roles: 0,
        message: "Config already exists — not overwriting." };
    }
  }

  let pCount = 0, hCount = 0, mCount = 0, rCount = 0;
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    for (const p of DEFAULT_PROVIDERS) {
      const id = `prov-${p.type}`;
      const changes = await tRun(client,
        `INSERT INTO providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
         VALUES (@id, @name, @type, @endpoint_url, '', '{}', @now, @now)
         ON CONFLICT (id) DO NOTHING`,
        { id, name: p.name, type: p.type, endpoint_url: p.endpoint_url, now }
      );
      if (changes > 0) pCount++;
    }

    const opencodeSemantics = JSON.stringify({
      binary: "opencode", capabilities: { model: true, agent: true, working_directory: true, system_prompt: false },
      execution: { mode: "interactive", subcommand: "run" },
      semantics: { model: { type: "flag", flag: "--model" }, agent: { type: "flag", flag: "--agent" }, working_directory: { type: "flag", flag: "--dir" } },
      role_mapping: { strategy: "agent" },
    });
    let changes = await tRun(client,
      `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
       VALUES (@id, @name, @invocation_semantics, @now, @now)
       ON CONFLICT (id) DO NOTHING`,
      { id: "harn-opencode", name: "Opencode CLI", invocation_semantics: opencodeSemantics, now }
    );
    if (changes > 0) hCount++;

    const ollamaSemantics = JSON.stringify({
      binary: "ollama", capabilities: { model: true, agent: false, working_directory: false, system_prompt: true },
      execution: { mode: "daemon" },
      semantics: { model: { type: "positional_after_subcommand", subcommand: "run" }, system_prompt: { type: "flag", flag: "--system" } },
      role_mapping: { strategy: "none" },
    });
    changes = await tRun(client,
      `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
       VALUES (@id, @name, @invocation_semantics, @now, @now)
       ON CONFLICT (id) DO NOTHING`,
      { id: "harn-ollama-sdk", name: "Ollama SDK", invocation_semantics: ollamaSemantics, now }
    );
    if (changes > 0) hCount++;

    const codexSemantics = JSON.stringify({
      binary: "codex", capabilities: { model: false, agent: false, working_directory: true, system_prompt: true },
      execution: { mode: "oneshot", subcommand: "exec" },
      semantics: { working_directory: { type: "flag", flag: "--cd" } },
      role_mapping: { strategy: "prompt_file" },
    });
    changes = await tRun(client,
      `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
       VALUES (@id, @name, @invocation_semantics, @now, @now)
       ON CONFLICT (id) DO NOTHING`,
      { id: "harn-codex-cli", name: "Codex CLI", invocation_semantics: codexSemantics, now }
    );
    if (changes > 0) hCount++;

    for (const md of DEFAULT_MODELS) {
      const changes = await tRun(client,
        `INSERT INTO models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
         VALUES (@id, @name, @harness_id, @provider_id, @model_identifier, @now, @now)
         ON CONFLICT (id) DO NOTHING`,
        { id: md.id, name: md.name, harness_id: md.harnessId, provider_id: md.providerId, model_identifier: md.modelId, now }
      );
      if (changes > 0) mCount++;
    }

    for (const role of ALL_ROLES) {
      const changes = await tRun(client,
        `INSERT INTO config_bundle
           (id, name, role, model_id, priority, provider_id, harness_id, invocation_mode, is_active, metadata, created_at, updated_at)
         VALUES
           (@id, @name, @role, @model_id, @priority, @provider_id, @harness_id, 'CLI', 1, '{}', @now, @now)
         ON CONFLICT (role, model_id) DO NOTHING`,
        { id: `cb-${role}-mod-gpt4o`, name: `Default: GPT-4o for ${role}`, role, model_id: "mod-gpt4o", priority: 0,
          provider_id: "prov-openai", harness_id: "harn-opencode", now }
      );
      if (changes > 0) rCount++;
    }
  });

  return {
    seeded: true, providers: pCount, harnesses: hCount, models: mCount, roles: rCount,
    message: `${force ? "Force re-s" : "S"}eeded ${pCount} providers, ${hCount} harnesses, ${mCount} models, ${rCount} role configs.`,
  };
}


