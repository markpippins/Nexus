import { Pool, PoolClient, types } from "pg";
import { readFileSync } from "fs";
import path from "path";

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
 * - Versions 7-9 load external SQL files from nexus/schemas/tackle/ at
 *   runtime (prompts_tasks_tool_access.sql, seed_prompts.sql,
 *   roles_default_timestamps.sql). They were originally applied externally
 *   via psql on 2026-07-25; registered here so green-field installs
 *   auto-apply them. The SQL files are idempotent and self-stamp
 *   schema_version.
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
  // ── v7-v9 were originally applied externally via psql on 2026-07-25 and
  //    self-stamped tackle.schema_version. They are registered here so that
  //    green-field installs auto-apply them. Each Migration.up() loads the
  //    SQL file at runtime and executes it as a single query. Because the
  //    SQL files are idempotent (CREATE TABLE IF NOT EXISTS, ON CONFLICT
  //    DO NOTHING/UPDATE, ALTER ... SET DEFAULT is a no-op once applied) and
  //    self-stamp with ON CONFLICT (version) DO UPDATE, re-running on an
  //    already-current DB is safe — though runMigrations skips them via the
  //    version check before up() is ever called. Schema SQL lives under
  //    nexus/schemas/tackle/, resolved from this src/ dir.
  {
    version: 7,
    description: "Create tackle.prompts (reusable versioned prompt templates), tackle.tasks (concrete assignments FK->prompts), tackle.role_tool_access (per-tool default-deny allowlist). Architect decision d708c452. [file: prompts_tasks_tool_access.sql]",
    up: async (exec) => {
      const sqlPath = path.resolve(__dirname, "../../../schemas/tackle/prompts_tasks_tool_access.sql");
      const sql = readFileSync(sqlPath, "utf8");
      await exec(sql);
      console.log("[tackle-migrations] v7: Created tackle.prompts, tackle.tasks, tackle.role_tool_access");
    },
  },
  {
    version: 8,
    description: "Seed tackle.prompts with 11 rows (operator system-prompt-base/tail + 9 role opencode-persona v1) and one active inspector task. Add builder-fallback role. Engineer intent ab3befcc. [file: seed_prompts.sql]",
    up: async (exec) => {
      const sqlPath = path.resolve(__dirname, "../../../schemas/tackle/seed_prompts.sql");
      const sql = readFileSync(sqlPath, "utf8");
      await exec(sql);
      console.log("[tackle-migrations] v8: Seeded 11 prompts + 1 inspector task + builder-fallback role");
    },
  },
  {
    version: 9,
    description: "Add DEFAULT NOW() to tackle.roles.created_at and tackle.roles.updated_at (baseline inconsistency fix so casual role inserts work). Spotted when seeding builder-fallback during v8. Back-compatible. [file: roles_default_timestamps.sql]",
    up: async (exec) => {
      const sqlPath = path.resolve(__dirname, "../../../schemas/tackle/roles_default_timestamps.sql");
      const sql = readFileSync(sqlPath, "utf8");
      await exec(sql);
      console.log("[tackle-migrations] v9: Added DEFAULT NOW() to tackle.roles.created_at and updated_at");
    },
  },
  {
    version: 10,
    description: "Create tackle.system_logs for operational log persistence (GET/POST/DELETE /logs endpoints)",
    up: async (exec) => {
      await exec(`
        CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.system_logs (
          id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          level       TEXT NOT NULL CHECK (level IN ('INFO','WARN','ERROR','DEBUG')),
          category    TEXT NOT NULL,
          message     TEXT NOT NULL,
          source      TEXT,
          details     JSONB
        )
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_system_logs_level
          ON ${TACKLE_SCHEMA}.system_logs (level)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_system_logs_category
          ON ${TACKLE_SCHEMA}.system_logs (category)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp
          ON ${TACKLE_SCHEMA}.system_logs (timestamp DESC)
      `);
      console.log("[tackle-migrations] v10: Created tackle.system_logs table with indexes");
    },
  },
  {
    version: 11,
    description: "Register tackle.agent_timeclock — agent clock in/out table. Previously lived in the nebula schema (owned by the timeclock service via SQLAlchemy create_all); moved nebula -> tackle on 2026-08-02 via copy-repoint-drop. Idempotent: no-op where the table already exists (e.g. live DB), creates it on green-field installs. Mirrors the timeclock MCP model (python/timeclock/models.py) and the live table DDL (PK + clock_in/role/status indexes).",
    up: async (exec) => {
      await exec(`
        CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.agent_timeclock (
          id             UUID        NOT NULL DEFAULT gen_random_uuid(),
          role           TEXT        NOT NULL,
          model          TEXT        NOT NULL,
          session_id     TEXT,
          clock_in       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          clock_out      TIMESTAMPTZ,
          status         TEXT        NOT NULL DEFAULT 'active',
          metadata       JSONB,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          recorded_on_dt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          valid_from     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          valid_until    TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00'
        )
      `);
      await exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS agent_timeclock_pkey
          ON ${TACKLE_SCHEMA}.agent_timeclock (id)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS agent_timeclock_clock_in_idx
          ON ${TACKLE_SCHEMA}.agent_timeclock (clock_in)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS agent_timeclock_role_idx
          ON ${TACKLE_SCHEMA}.agent_timeclock (role)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS agent_timeclock_status_idx
          ON ${TACKLE_SCHEMA}.agent_timeclock (status)
      `);
      console.log("[tackle-migrations] v11: Registered tackle.agent_timeclock table + indexes");
    },
  },
  {
    version: 12,
    description: "Add optional task_slug link to tackle.agent_scheduler — scheduled jobs can attach a task (from tackle.tasks) whose prompt is appended to the role's default persona when the job runs. Loose reference (no FK) so tasks can be deleted; deleteTackleTask clears references.",
    up: async (exec) => {
      await exec(`
        ALTER TABLE ${TACKLE_SCHEMA}.agent_scheduler
          ADD COLUMN IF NOT EXISTS task_slug TEXT
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_agent_scheduler_task_slug
          ON ${TACKLE_SCHEMA}.agent_scheduler (task_slug)
      `);
      console.log("[tackle-migrations] v12: Added task_slug to tackle.agent_scheduler");
    },
  },
  {
    version: 13,
    description: "Allow schedule_type 'manual' in tackle.agent_scheduler — the UI offers on-demand entries; the previous CHECK only allowed interval/cron so saving a manual row failed with a constraint violation.",
    up: async (exec) => {
      // Drop ANY existing CHECK on schedule_type regardless of its auto-generated
      // name, then re-add with 'manual' allowed.
      await exec(`
        DO $$
        DECLARE
          c record;
        BEGIN
          FOR c IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = '${TACKLE_SCHEMA}.agent_scheduler'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%schedule_type%'
          LOOP
            EXECUTE format('ALTER TABLE ${TACKLE_SCHEMA}.agent_scheduler DROP CONSTRAINT %I', c.conname);
          END LOOP;
        END $$;
      `);
      await exec(`
        ALTER TABLE ${TACKLE_SCHEMA}.agent_scheduler
          ADD CONSTRAINT agent_scheduler_schedule_type_check
          CHECK (schedule_type IN ('interval', 'cron', 'manual'))
      `);
      console.log("[tackle-migrations] v13: Allowed schedule_type 'manual' in tackle.agent_scheduler");
    },
  },
  {
    version: 14,
    description: "ACP v1: Create tackle.projection_configs and seed six v1 projection families (opencode-agent-*, claude-md, gemini-md, agents-md, codex-index, agents-operating-model). Plan 1280.",
    up: async (exec) => {
      await exec(`
        CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.projection_configs (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name            TEXT NOT NULL UNIQUE,
          description     TEXT NOT NULL DEFAULT '',
          type            TEXT NOT NULL DEFAULT 'deterministic'
                            CHECK(type IN ('deterministic','inference')),
          source_query    TEXT NOT NULL DEFAULT '',
          template        TEXT NOT NULL DEFAULT '',
          parameter_schema JSONB NOT NULL DEFAULT '{}',
          target_path     TEXT NOT NULL,
          schedule        TEXT NOT NULL DEFAULT '',
          enabled         INTEGER NOT NULL DEFAULT 1,
          last_rendered_at TIMESTAMPTZ,
          last_sha256     TEXT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await exec(`
        CREATE INDEX IF NOT EXISTS idx_projection_configs_enabled
          ON ${TACKLE_SCHEMA}.projection_configs (enabled)
      `);
      await exec(`
        CREATE INDEX IF NOT EXISTS idx_projection_configs_name
          ON ${TACKLE_SCHEMA}.projection_configs (name)
      `);

      // Seed the six v1 projection families
      const now = new Date().toISOString();

      // 1. opencode-agent-* — one file per role in .opencode/agents/
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.projection_configs (name, description, type, source_query, template, target_path, schedule)
         VALUES ($1, $2, 'deterministic',
           'SELECT r.name AS role, r.description AS role_description FROM tackle.roles r ORDER BY r.name',
           $3,
           '/home/codex/dev/.opencode/agents/{{role}}.md',
           '')
         ON CONFLICT (name) DO NOTHING`,
        [
          "opencode-agents",
          "Agent persona files — one .md per role under .opencode/agents/. Template embeds role name, role description, persona body from tackle.prompts, and procedure cards from tackle.role_memory.",
          `---
assumes_role: {{role}}
description: |
  {{role_description}}
mode: primary
permission:
  read: allow
  edit: allow
  bash: allow
  task: allow
---
{{persona_body}}

## Available Procedure Cards

{{procedures_list}}
`,
        ]
      );

      // 2. claude-md
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.projection_configs (name, description, type, source_query, template, target_path, schedule)
         VALUES ($1, $2, 'deterministic', '', $3, '/home/codex/dev/CLAUDE.md', '')
         ON CONFLICT (name) DO NOTHING`,
        [
          "claude-md",
          "CLAUDE.md — top-level agent baseline for Claude. Currently hand-maintained; projection preserves current content via template fidelity.",
          `<!-- GENERATED header will be prepended at render time -->
# CLAUDE.md

> **Version:** (see git history)
> **Scope:** Agent behavior for /home/codex/dev workspace.
> This file is a **GENERATED projection** from tackle data.
> Source: projection:claude-md
> Do not edit directly — changes will be overwritten on next render.

This file provides baseline agent behavior. Role-specific configuration lives in .opencode/agents/<role>.md (also generated).
`,
        ]
      );

      // 3. gemini-md
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.projection_configs (name, description, type, source_query, template, target_path, schedule)
         VALUES ($1, $2, 'deterministic', '', $3, '/home/codex/dev/GEMINI.md', '')
         ON CONFLICT (name) DO NOTHING`,
        [
          "gemini-md",
          "GEMINI.md — Gemini-specific agent configuration. Projection from tackle data.",
          `<!-- GENERATED header will be prepended at render time -->
# GEMINI.md

> **Scope:** Agent behavior for Gemini models in the /home/codex/dev workspace.
> This file is a **GENERATED projection** from tackle data.
> Source: projection:gemini-md
> Do not edit directly.

See CLAUDE.md and AGENTS.md for the governing doctrine. This file contains Gemini-specific overrides.
`,
        ]
      );

      // 4. agents-md
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.projection_configs (name, description, type, source_query, template, target_path, schedule)
         VALUES ($1, $2, 'deterministic', '', $3, '/home/codex/dev/AGENTS.md', '')
         ON CONFLICT (name) DO NOTHING`,
        [
          "agents-md",
          "AGENTS.md — Multi-model agent behavior specification. Projection from tackle data.",
          `<!-- GENERATED header will be prepended at render time -->
# AGENTS.md

> **Version:** 2.1 (trimmed 2026-06-24)
> **Scope:** Agent behavior for /home/codex/dev workspace.
> This file is a **GENERATED projection** from tackle data.
> Source: projection:agents-md
> Do not edit directly.

See CLAUDE.md for the full governing doctrine.
`,
        ]
      );

      // 5. codex-index
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.projection_configs (name, description, type, source_query, template, target_path, schedule)
         VALUES ($1, $2, 'deterministic', '', $3, '/home/codex/dev/.codex/INDEX.md', '')
         ON CONFLICT (name) DO NOTHING`,
        [
          "codex-index",
          ".codex/INDEX.md — Codex-specific index. Projection from tackle data.",
          `<!-- GENERATED header will be prepended at render time -->
# Codex Index

> This file is a **GENERATED projection** from tackle data.
> Source: projection:codex-index
> Do not edit directly.

Index of Codex-specific configuration and context.
`,
        ]
      );

      // 6. agents-operating-model
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.projection_configs (name, description, type, source_query, template, target_path, schedule)
         VALUES ($1, $2, 'deterministic', '', $3, '/home/codex/dev/nexus/.agents/OPERATING_MODEL.md', '')
         ON CONFLICT (name) DO NOTHING`,
        [
          "agents-operating-model",
          "nexus/.agents/OPERATING_MODEL.md — Nexus operating model. Projection from tackle data.",
          `<!-- GENERATED header will be prepended at render time -->
# Nexus Operating Model

> This file is a **GENERATED projection** from tackle data.
> Source: projection:agents-operating-model
> Do not edit directly.

## Operating Model

Nexus follows a database-first architecture: canonical state lives in PostgreSQL; filesystem artifacts are derived projections.
`,
        ]
      );

      console.log("[tackle-migrations] v14: Created tackle.projection_configs + seeded 6 projection families");
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
      // ON CONFLICT (version) DO UPDATE: some migrations (v7-v9) self-stamp
      // schema_version at the bottom of their SQL file. This wrapper stamp
      // must be idempotent so a self-stamped migration doesn't crash on PK
      // violation. Re-stamping also refreshes the timestamp if a migration
      // is re-applied in any future recovery scenario.
      await exec(
        `INSERT INTO ${TACKLE_SCHEMA}.schema_version (version, description, applied_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (version) DO UPDATE
         SET description = EXCLUDED.description,
             applied_at  = EXCLUDED.applied_at`,
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

    -- ──────────────────────────────────────────────────────────
    --  1. Pipeline Health Check
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'pipeline-health-check',
        'Pipeline Health Check',
        'DB-first pipeline health check: blocked plans, plan-status drift (stuck pending + expired/cancelled tickets + external completion evidence), flagged changes before each turn (resolved/maintenance noise excluded).',
        '## Procedure\n'
        '\n'
        'DB-first health check of the WorkRequest pipeline. Canonical state lives in PostgreSQL (\`vision.*\`, \`conduit.*\`, \`nebula.*\`); the filesystem is a derived projection and \`nexus/.conduit-data\` is retired (posterity mirror: \`nexus/audit/CONDUIT_DATA\`). Run at the start of every conversational turn, before responding to the user:\n'
        '**Automated backstop:** a scheduled sweep (\`nexus/bin/pipeline-health-sweep.py\`, systemd user timer \`nexus-pipeline-health.timer\`, every 30 min) runs these checks **plus the projection-vs-replay drift scan** (\`conduit-srv GET /wr/drift-scan\`, plan 1285 — active WRs whose \`conduit.work_request_state\` projection disagrees with event replay) and posts findings to the Assembly \`drift-reports\` forum (a new thread only when the finding set changes; resolution thread when it clears). At turn start, prefer the latest pipeline-health thread in \`drift-reports\`; the queries below are the manual fallback.\n'
        '\n'
        '1. **Blocked plans** — plans whose latest receipt is \`BLOCK\`/\`HOLD\`, or with failed/stale tickets, mean the pipeline is jammed — report the blocker prominently. Query:\n'
        '\n'
        '   WITH latest AS (SELECT DISTINCT ON (plan_id) plan_id, type, created_at\n'
        '     FROM vision.receipts WHERE plan_id ~ ''^[0-9]+$''\n'
        '     ORDER BY plan_id, created_at DESC)\n'
        '   SELECT plan_id, type FROM latest WHERE type IN (''BLOCK'',''HOLD'') ORDER BY created_at DESC;\n'
        '\n'
        '2. **Plan-status drift** (pending/PLAN_CREATE + expired/cancelled ticket + external completion evidence) — plans that LOOK pending but the work actually finished, was abandoned, or ran outside the pipeline (the 1274/1275 and 2026-08-09 ghost-batch failure modes). Four signals in one query:\n'
        '\n'
        '   WITH latest AS (\n'
        '     SELECT DISTINCT ON (plan_id) plan_id, type, created_at\n'
        '     FROM vision.receipts WHERE plan_id ~ ''^[0-9]+$''\n'
        '     ORDER BY plan_id, created_at DESC),\n'
        '   stuck AS (\n'
        '     SELECT plan_id, created_at FROM latest\n'
        '     WHERE type = ''PLAN_CREATE'' AND created_at < NOW() - INTERVAL ''24 hours'')\n'
        '   SELECT s.plan_id, to_char(s.created_at,''YYYY-MM-DD'') AS last_plan_create,\n'
        '     (SELECT count(*) FROM vision.tickets t\n'
        '       WHERE t.plan_id = s.plan_id AND (t.status = ''expired''\n'
        '         OR (t.status IN (''open'',''claimed'',''stale'')\n'
        '             AND t.expires_at IS NOT NULL AND t.expires_at < NOW()))) AS expired_tickets,\n'
        '     (SELECT count(*) FROM vision.tickets t\n'
        '       WHERE t.plan_id = s.plan_id AND t.status = ''cancelled'') AS cancelled_tickets,\n'
        '     (SELECT count(*) FROM nebula.agent_records ar\n'
        '       WHERE (ar.plan_ref = s.plan_id\n'
        '          OR ar.content ~* (''(^|[^0-9])'' || s.plan_id || ''([^0-9]|$)''))\n'
        '         AND ar.record_type IN (''report'',''inspection'',''engineering_log'',''assessment'',''analysis'',''decision'')\n'
        '         AND COALESCE(ar.title,'''') NOT ILIKE ''%pre-fk-snapshot%''\n'
        '         AND COALESCE(ar.title,'''') NOT ILIKE ''%drift%''\n'
        '         AND COALESCE(ar.title,'''') NOT ILIKE ''%ghost%''\n'
        '         AND COALESCE(ar.title,'''') NOT ILIKE ''%cross-reference%''\n'
        '         AND COALESCE(ar.title,'''') NOT ILIKE ''CROSS REFERENCES%'') AS evidence_rows\n'
        '   FROM stuck s ORDER BY s.created_at LIMIT 20;\n'
        '\n'
        '   Interpretation per row:\n'
        '   - \`expired_tickets > 0\`: the plan''s ticket(s) expired unclaimed (24h, no re-arm).\n'
        '   - \`cancelled_tickets > 0\`: the plan''s ticket(s) were cancelled while the plan is still pending — abandoned/ghost work (the July-2026 batch signature; 142 ghosts closed via CANCELLED receipts 2026-08-09). Cleanup: issue a \`CANCELLED\` receipt via conduit-srv \`POST /api/receipts/\` (append-only closure) — NOT delete_plan (upstream already archived) and NOT re-dispatch.\n'
        '   - \`evidence_rows > 0\` (noise excluded — pre-fk-snapshot bulk rows, self-authored drift/ghost cleanup records, prompts/responses, cross-reference indexes): external completion evidence exists (agent records, verification inspections, engineering logs referencing the plan). The plan is implemented-but-pending (drift): fix by closure — record IMPLEMENTATION + REVIEW_PASS via conduit — NOT by re-dispatch. Heuristic signal — confirm each candidate manually before closing (UUID/substring coincidences and plan-mirror assessments can still false-positive).\n'
        '   - Oldest-first ordering with \`LIMIT 20\` keeps the report bounded; revisit the tail next turn.\n'
        '   - \`evidence_rows = 0 AND expired_tickets = 0 AND cancelled_tickets = 0\`: genuinely stuck-pending — escalate to the owning role or re-arm the ticket.\n'
        '\n'
        '3. **Flagged changes / blocker reports** — change reports that failed review and inspection blocker reports live in \`nebula.agent_records\`:\n'
        '\n'
        '   SELECT record_type, role, left(title,70) AS title, created_at\n'
        '   FROM nebula.agent_records\n'
        '   WHERE ((tags && ARRAY[''type:rejection'',''type:violation'',''type:incident''])\n'
        '      OR record_type = ''inspection'')\n'
        '     AND NOT (tags && ARRAY[''status:resolved'',''status:done'',''status:closed'',''resolved'',''done'',''closed''])\n'
        '     AND NOT (tags && ARRAY[''cycle:hourly-maintenance'',''hourly-maintenance''])\n'
        '     AND NOT (record_type = ''inspection'' AND (title IN (''.gitkeep'',''REGISTRY'') OR tags = ''{}''))\n'
        '   ORDER BY created_at DESC LIMIT 20;\n'
        '\n'
        '   Noise excluded: records tagged resolved/done/closed (incl. bare variants), routine\n'
        '   hourly-maintenance cycle records, and empty-tag inspection artifacts (.gitkeep/REGISTRY).\n'
        '   Remaining rows are genuinely open incidents/rejections/violations and verification records.\n'
        '\n'
        '4. **Persistence** — these checks are persistent. Report on every turn until resolved. Do not suppress because you already reported before. When the automated sweep is healthy, its \`drift-reports\` thread is the live report; manual checks here are the fallback (sweep down or ad-hoc triage).\n'
        '\n'
        '5. **Full change-detection** — for completed plans and inspection reports, load the \`pipeline-watch\` skill and run its check procedure.',
        ARRAY['turn-protocol', 'pipeline', 'blocker', 'health-check', 'drift'],
        ARRAY['start of turn', 'before responding', 'health check', 'pipeline check', 'drift', 'stuck pending', 'expired ticket', 'cancelled ticket', 'ghost plan', 'implemented but pending'],
        ARRAY['pipeline-watch']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'builder', 'critic', 'engineer', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  2. Bootstrap Self-Update (Activation)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'bootstrap-self-update',
        'Bootstrap Self-Update (Activation)',
        'On activation: ensure audit directories, query inbox, present open items.',
        '## Procedure\n'
        '\n'
        'On role activation (every session start):\n'
        '\n'
        '1. **Ensure projection target directories exist:**\n'
        '   \`\`\`\n'
        '   mkdir -p nexus/audit/{PROMPTS,RESPONSES,PLANS/pending,IMPLEMENTATION_PLANS/active,CHANGES/committed,ENGINEERING/reports,...}\n'
        '   find nexus/audit -type d -empty -not -path ''*/.git/*'' -exec touch {}/.gitkeep \\;\n'
        '   \`\`\`\n'
        '   These are on-demand projection targets, not the canonical store.\n'
        '\n'
        '2. **Query your inbox:**\n'
        '   - Use \`nebula_list_agent_records\` and filter for tags containing \`"to:<your_role>"\` and \`"status:open"\`\n'
        '   - If nebula-mcp is unreachable, surface this as a blocking infrastructure issue — do not silently proceed without checking the inbox\n'
        '   - Present any open items to the user before proceeding\n'
        '\n'
        '3. **Query nebula projection config** to verify current role→folder assignments. Read \`nexus/audit/AGENT_FOLDER_MAP.md\` as a static reference copy.\n'
        '\n'
        '4. **Present any new items** to the user before proceeding with their request.',
        ARRAY['turn-protocol', 'activation', 'bootstrap', 'inbox'],
        ARRAY['activate', 'session start', 'boot', 'turn start'],
        ARRAY['nebula_list_agent_records', 'nebula_create_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'builder', 'critic', 'engineer', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  3. Post-Turn Self-Update
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'post-turn-self-update',
        'Post-Turn Self-Update',
        'After every response: write agent record to DB, optionally trigger projection.',
        '## Procedure\n'
        '\n'
        'After completing work on every conversational turn:\n'
        '\n'
        '1. **Write to the database first** — Use \`nebula_create_agent_record\` with:\n'
        '   - \`recordType\`: one of \`report\`, \`analysis\`, \`assessment\`, \`inspection\`, \`prompt\`, \`response\`, \`engineering_log\`, \`architecture_note\`, \`decision\`\n'
        '   - \`role\`: your current role\n'
        '   - \`title\`: human-readable summary\n'
        '   - \`content\`: the full markdown body\n'
        '   - \`tags\`: relevant tags for filtering (e.g., \`["architecture", "phase-2"]\`)\n'
        '   - \`systemId\`, \`subsystemId\`, \`planRef\`: optional FK references\n'
        '   - \`threadRef\`: optional UUID to group messages into a thread\n'
        '\n'
        '2. **Optionally trigger a projection** via \`nebula_render_projection\` to regenerate the filesystem view. This is optional — the canonical record is already in the DB.\n'
        '\n'
        '3. **Do NOT write directly to audit directories** — the filesystem is a derived view. Direct writes will be overwritten by the next projection regeneration.\n'
        '\n'
        '4. **Respect folder boundaries** — Do not write to folders assigned to other roles.',
        ARRAY['turn-protocol', 'persistence', 'audit', 'post-turn'],
        ARRAY['after response', 'turn end', 'post-turn', 'after completing'],
        ARRAY['nebula_create_agent_record', 'nebula_render_projection', 'nebula_list_agent_records']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'builder', 'critic', 'engineer', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  4. Engineer Backlog Check (Nebula RMS)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'engineer-backlog-check',
        'Engineer Backlog Check (Nebula RMS)',
        'Query nebula RMS backlog before starting work. Surface pending requirements.',
        '## Procedure\n'
        '\n'
        'Engineers must run this check at session start AND at the start of every subsequent turn **before** processing the user''s request.\n'
        '\n'
        '1. **Call \`nebula_list_requirements\`** with no filter to retrieve the entire current requirement set; filter client-side by status.\n'
        '\n'
        '2. **Filter to backlog-relevant items**: keep requirements whose \`status\` is one of \`Backlog\`, \`ToDo\`, \`InProgress\`, \`Active\`, or \`Blocked\`. Exclude \`Done\`, \`Accepted\`, \`Cancelled\`.\n'
        '\n'
        '3. **Present the backlog before acting:**\n'
        '   > "Backlog context — [N] open requirement(s) in Nebula RMS:\n'
        '   > - **[id]** \`[title]\` — [status] · [priority] · parent: [parent]\n'
        '   > Your current request may overlap with one of these. Want to claim an existing item, record new work, or proceed outside the backlog?"\n'
        '\n'
        '4. **Propose, do not auto-claim** — if the request matches a backlog item, surface the candidate and ask before flipping status. Never unilaterally transition a requirement''s status.\n'
        '\n'
        '5. **Record genuinely new work** — if the request is new, create a requirement via \`nebula_create_requirement\`.\n'
        '\n'
        '6. **Re-check before every turn** — backlog state can shift between turns.',
        ARRAY['engineer', 'backlog', 'requirements', 'nebula-rms'],
        ARRAY['start of turn', 'before working', 'backlog', 'requirement'],
        ARRAY['nebula_list_requirements', 'nebula_create_requirement', 'nebula_update_requirement']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  5. Turn-Based Planning Check (Conduit)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'turn-based-planning-check',
        'Turn-Based Planning Check (Conduit)',
        'Check for plans promoted to Planning status before each turn.',
        '## Procedure\n'
        '\n'
        'At the start of every turn, before processing the user''s request:\n'
        '\n'
        '1. **Query the pipeline state** — Call \`query_pipeline_state\` (or read \`/state\` via HTTP) to get the current \`PipelineState\`.\n'
        '\n'
        '2. **Inspect \`plans.planning\`** — Look for plans in the \`planning\` array. These are plans with a \`PLANNING\` receipt that are awaiting elucidation.\n'
        '\n'
        '3. **Present findings to the user:**\n'
        '   > "Before we proceed — you have [N] plan(s) in Planning that were promoted but not yet discussed:\n'
        '   > - **#NNNN**: [title] — [goal summary]\n'
        '   > Would you like to discuss any of these before we continue?"\n'
        '\n'
        '4. **Follow the user''s lead:**\n'
        '   - If they want to discuss a planning plan, help elucidate it (files affected, acceptance criteria, dependencies) then call \`issue_receipt\` with \`PLAN_CREATE\` to move it to Pending.\n'
        '   - If they say "not now", proceed with the original request. Planning plans remain in Planning for a future turn.\n'
        '\n'
        '5. **Do NOT auto-promote to Pending** — the user must explicitly confirm.',
        ARRAY['turn-protocol', 'planning', 'conduit', 'elucidation'],
        ARRAY['start of turn', 'planning check', 'promoted plan', 'plan pipeline'],
        ARRAY['conduit-mcp_query_conduit_state', 'conduit-mcp_issue_receipt']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['architect', 'builder', 'engineer', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  6. Prompt Capture (Audit Trail)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'prompt-capture',
        'Prompt Capture (Audit Trail)',
        'Save every interactive prompt as the start of the audit trail.',
        '## Procedure\n'
        '\n'
        'Every interactive prompt must be saved as the start of the audit trail.\n'
        '\n'
        '1. **Save every prompt** — Use \`nebula_create_agent_record\` with \`recordType: "prompt"\`. The database is the canonical store — do not write directly to filesystem directories.\n'
        '\n'
        '2. **Link plans to prompts** — When a prompt results in an implementation plan, pass the \`promptRef\` (prompt number) to \`create_plan\` or \`create_proposed_plan\`. This creates a bidirectional audit trail: prompt → plan references.\n'
        '\n'
        '3. **Preserve continuity** — The prompt number allows subsequent plans, proposals, and responses to reference the originating intent.',
        ARRAY['audit', 'prompt', 'capture', 'traceability'],
        ARRAY['user prompt', 'new conversation', 'question', 'request'],
        ARRAY['nebula_create_agent_record', 'conduit-mcp_create_plan', 'conduit-mcp_create_proposed_plan']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'builder', 'critic', 'engineer', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  7. Inbox Query (Role-Driven Messaging)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'inbox-query-procedure',
        'Inbox Query (Role-Driven Messaging)',
        'Query your role inbox for open messages before proceeding each turn.',
        '\n'
        '## Procedure\n'
        '\n'
        'Before processing any request, query your role''s inbox for messages from other agents.\n'
        '\n'
        '1. **Query your inbox (R17, verified)** — the nebula REST API is the simple path:\n'
        '\n'
        '   \`\`\`bash\n'
        '   curl -s "http://localhost:3101/api/agent-records?role=<your_role>&createdAfter=<pointer_iso>" \\\n'
        '     | python3 -c ''import sys,json; d=json.load(sys.stdin); [print(i["createdAt"], i["title"][:60]) for i in d.get("items",[])]''\n'
        '   \`\`\`\n'
        '\n'
        '   - Store the last-seen pointer at \`http://localhost:3101/api/inbox-pointer/<role>\` (GET / PUT, ISO timestamps).\n'
        '   - **Caveat (verified):** this endpoint applies \`role\` + \`createdAfter\` but silently IGNORES \`tags\` and \`limit\` (returns up to 100, newest first).\n'
        '   - Records return \`createdAt\` as epoch ms — convert to ISO before using it in \`createdAfter\`/the pointer.\n'
        '\n'
        '2. **Ready-made helper** — \`nexus/bin/check-inbox.sh --role <your_role>\` wraps the exact tag-faithful query:\n'
        '   - \`--all\` ignores the pointer, \`--pointer <ISO>\` overrides it, \`--update-pointer\` advances it, \`--limit N\`, \`--raw\`, \`-h\`.\n'
        '   - Default path: single \`nebula_get_inbox\` MCP call on nebula-mcp 3102 (Streamable HTTP) via the canonical client lib \`nexus/python/nebula-mcp-client/\` — resolves the stored pointer and applies \`tags:["to:<role>"]\` server-side in one round-trip. \`--pointer <ISO>\` / \`--all\` fall back to \`nebula_list_agent_records\` with an explicit \`createdAfter\`.\n'
        '\n'
        '3. **Weekly review (once per week, non-destructive)** — look back 7 days for anything that slipped through. \`--since 7d\` (shorthand for \`--pointer "<7 days ago ISO>"\`) overrides the \`createdAfter\` filter for this call only and leaves the stored pointer untouched, so the next normal check never re-delivers already-seen records:\n'
        '\n'
        '   \`\`\`bash\n'
        '   nexus/bin/check-inbox.sh --role <your_role> --since 7d --limit 100\n'
        '   \`\`\`\n'
        '\n'
        '   - Assess what was missed and surface any items that slipped through.\n'
        '   - If the review covered everything, optionally mark it all as seen by adding \`--update-pointer\` (advances to the newest record in the window).\n'
        '   - The raw-REST equivalent — a *permanent* rewind that re-delivers the week on the next check — is \`PUT /api/inbox-pointer/<role>\` with a 7-day-old ISO timestamp; rarely wanted.\n'
        '\n'
        '4. **Present findings** — Surface any open messages to the user before acting. Do NOT silently process inbox items.\n'
        '\n'
        '5. **Tag routing conventions:**\n'
        '   - \`to:{role}\` — intended recipient (engineer, architect, planner, etc.)\n'
        '   - \`from:{role}\` — sender\n'
        '   - \`status:{state}\` — open, claimed, in_progress, resolved, archived\n'
        '   - \`type:{kind}\` — incident, task, question, decision, finding, proposal, etc.\n'
        '   - \`thread:{id}\` — thread membership (short form UUID)\n'
        '\n'
        '6. **Thread tracking** — Conversations between roles use \`threadRef\` (shared UUID across messages):\n'
        '   - First message: new UUID threadRef\n'
        '   - Response: same threadRef, updated status\n'
        '   - Query: \`nebula_list_agent_records\` with \`threadRef = "<uuid>"\`\n'
        '\n'
        '7. **Infrastructure failure** — If nebula-mcp / nebula REST is unreachable, surface as a blocking issue. Do not silently proceed.\n'
        '\n'
        '',
        ARRAY['messaging', 'inbox', 'routing', 'communication'],
        ARRAY['start of turn', 'inbox', 'messages', 'agent communication'],
        ARRAY['nebula_list_agent_records', 'nebula_create_agent_record', 'nebula_update_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  8. Thread Tracking (Cross-Role Conversations)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'thread-tracking',
        'Thread Tracking (Cross-Role Conversations)',
        'Create and continue cross-role conversations via threadRef UUIDs.',
        '## Procedure\n'
        '\n'
        'Conversations between roles use \`threadRef\` (a shared UUID across messages).\n'
        '\n'
        '1. **First message**: Author writes a record with a new \`threadRef\` UUID and tags \`["to:recipient", "status:open", "type:kinds"]\`.\n'
        '\n'
        '2. **Response**: Recipient writes a record with the same \`threadRef\`, tags \`["to:author", "status:in_progress", "type:kinds"]\`.\n'
        '\n'
        '3. **Continuation**: Any role writes to the same thread with updated \`status\` and appropriate \`to:\` tag.\n'
        '\n'
        '4. **Querying threads**: Filter for \`threadRef = "<uuid>"\` and order by \`created_at\`.\n'
        '\n'
        '5. **Resolving threads**: Update all messages in the thread to \`status:resolved\`.\n'
        '\n'
        '## Common Thread Lifecycle\n'
        '\n'
        '1. Open → Claimed → In Progress → Resolved\n'
        '2. Open → Resolved (simple acknowledgment)\n'
        '3. Open → Escalated → (owning role decision) → Resolved',
        ARRAY['messaging', 'thread', 'conversation', 'cross-role'],
        ARRAY['conversation', 'thread', 'cross-role', 'respond to agent'],
        ARRAY['nebula_list_agent_records', 'nebula_create_agent_record', 'nebula_update_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    --  9. Tag Routing Convention Reference
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'tag-routing-reference',
        'Tag Routing Convention Reference',
        'Reference for valid agent message tags (to:, from:, status:, type:, thread:).',
        '## Tag Routing Reference\n'
        '\n'
        'All tags are lower-kebab-case. Multiple tags form a conjunction.\n'
        '\n'
        '### Prefix Tags\n'
        '\n'
        '| Tag | Purpose | Examples |\n'
        '|-----|---------|----------|\n'
        '| \`to:{role}\` | Intended recipient | \`to:engineer\`, \`to:architect\`, \`to:planner\` |\n'
        '| \`from:{role}\` | Sender | \`from:architect\` |\n'
        '| \`status:{state}\` | Message lifecycle | \`status:open\`, \`status:claimed\`, \`status:in_progress\`, \`status:resolved\`, \`status:archived\` |\n'
        '| \`type:{kind}\` | Semantic kind | \`type:incident\`, \`type:task\`, \`type:question\`, \`type:decision\`, \`type:spec\`, \`type:finding\`, \`type:blocker\`, \`type:proposal\`, \`type:warning\`, \`type:error\`, \`type:approval\`, \`type:rejection\`, \`type:disagreement\`, \`type:escalation\`, \`type:deferred\`, \`type:db-change\` |\n'
        '| \`thread:{id}\` | Thread membership | \`thread:a1b2c3\` |\n'
        '\n'
        '### DB-Change Routing Tag\n'
        '- \`type:db-change\` — plan requires database work; recipient DBA posts the proposed alterations to the Assembly Drafts forum (slug \`draft\`) and applies them ONLY after admin approval, BEFORE a Builder starts (doctrine 2026-08-07). Pair with \`to:dba\`, \`planRef:<N>\`, \`status:open\`; completion reported with \`status:resolved\`/\`status:done\`.\n'
        '- The Drafts forum (slug \`draft\`) is the DBA''s DB-work channel: DBA posts proposals there AND checks it for admin approval/rejection replies and incoming DB-change requests (in addition to the nebula inbox).\n'
        '\n'
        '### Divergence Tags\n'
        '- \`type:disagreement\` — Explicit conflicting position\n'
        '- \`type:escalation\` — Request for owning role to resolve\n'
        '- \`type:deferred\` — Known conflict tabled for later\n'
        '\n'
        '### Domain Tags (ad-hoc, lowercase)\n'
        '- \`domain:knowledge-infrastructure\`, \`domain:type-spec\`, etc.\n'
        '- \`priority:high\`, \`priority:medium\`, \`priority:low\`\n'
        '\n'
        '### Where these tags are used (verified)\n'
        '- **R17 inbox query:** the nebula REST endpoint (\`3101\`) applies \`role\` + \`createdAfter\` but IGNORES \`tags\`/\`limit\`; for exact tag-routed queries use \`nexus/bin/check-inbox.sh\` (MCP HTTP+SSE on 3102).\n'
        '- **R13 session-start forum check:** the Assembly \`issues-and-open-questions\` check now uses the Assembly REST API on 3107 (\`GET /api/forums/issues-and-open-questions/threads\`) — there is no \`3102/tools/call\` route on nebula-mcp.',
        ARRAY['messaging', 'reference', 'tags', 'routing'],
        ARRAY['tag routing', 'message format', 'tag convention', 'what tags'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 10. Rover Harvest Notification
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'rover-harvest-notification',
        'Rover Harvest Notification',
        'After harvests, create cross-refs and notify Architect + Analyst.',
        '## Procedure\n'
        '\n'
        '1. **Execute the harvest** using Rover. Always use yourself as the inference component — do not delegate to Ollama unless explicitly told.\n'
        '\n'
        '2. **Persist harvest output** to the database via \`nebula_create_harvest\` (or \`POST /api/harvests\`).\n'
        '\n'
        '3. **Create cross-references** linking the harvest to knowledge entities:\n'
        '   a. Direct references via \`nebula_create_cross_reference\` with \`relType: "informs"\` (harvest → entity) and \`relType: "sourced_from"\` (entity → harvest). Use \`knowledge_list_entities\` to find matching entities.\n'
        '   b. Run automated discovery scripts: \`embed_harvests.py\`, \`embed_knowledge_entities.py\`, \`cross_schema_classifier.py\`, \`provenance_linker.py\` (requires Ollama + pgvector).\n'
        '\n'
        '4. **Notify Architect and Analyst** via \`nebula_create_agent_record\`:\n'
        '   - \`tags: ["to:architect", "status:open", "type:finding", "thread:..."]\`\n'
        '   - \`tags: ["to:analyst", "status:open", "type:finding", "thread:..."]\`\n'
        '   - Same \`threadRef\` UUID for both so they share a conversation thread.\n'
        '   - Title: "New harvest material available: <topic/summary>"',
        ARRAY['harvest', 'post-processing', 'notification', 'cross-reference'],
        ARRAY['rover', 'harvest', 'chat transcript', 'nebula_create_harvest'],
        ARRAY['nebula_create_harvest', 'nebula_create_cross_reference', 'knowledge_list_entities', 'nebula_create_agent_record']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 11. Terrain Registration
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'terrain-registration',
        'Terrain Registration',
        'Register services in terrain topology after building or deploying.',
        '## Procedure\n'
        '\n'
        '1. **Identify the service** — name, type (api|db|queue|worker|ui), endpoint, health check, dependencies.\n'
        '\n'
        '2. **Call \`terrain-mcp\`** to register:\n'
        '   - \`terrain_register_service\` — create new entry\n'
        '   - \`terrain_update_service\` — update existing metadata\n'
        '   - Include: \`name\`, \`type\`, \`endpoint\`, \`health_check\`, \`depends_on\`, \`metadata\` (version, region, etc.)\n'
        '\n'
        '3. **Verify** via \`terrain_list_services\` — confirm the service appears with correct topology links.',
        ARRAY['deployment', 'infrastructure', 'service-registry', 'topology'],
        ARRAY['deploy', 'build', 'set up', 'service', 'register'],
        ARRAY['terrain_register_service', 'terrain_list_services']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 12. Planning Elucidation Workflow
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'planning-elucidation',
        'Planning Elucidation Workflow',
        'Elucidate a planning-plan before promoting it to pending.',
        '## Procedure\n'
        '\n'
        '1. **Present the plan** — show title, goal, existing metadata.\n'
        '\n'
        '2. **Discuss scope** — "Which files or modules would this change affect?" Capture as \`filesAffected\`.\n'
        '\n'
        '3. **Refine Acceptance Criteria** — define concrete, testable criteria.\n'
        '\n'
        '4. **Identify Dependencies** — check if this plan depends on others.\n'
        '\n'
        '5. **Confirm** — present summary and get explicit user confirmation.\n'
        '\n'
        '6. **Persist metadata** via \`update_plan\` or \`report_plan_metadata\`.\n'
        '\n'
        '7. **Move to Pending** — call \`issue_receipt\` with \`PLAN_CREATE\`.',
        ARRAY['planning', 'elucidation', 'promotion'],
        ARRAY['discuss plan', 'promote plan', 'elucidate', 'planning plan'],
        ARRAY['conduit-mcp_update_plan', 'conduit-mcp_issue_receipt']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['planner'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 13. Proposal Capture (Followup Preservation)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'proposal-capture',
        'Proposal Capture (Followup Preservation)',
        'Persist followup suggestions as proposed plans after completing work.',
        '## Procedure\n'
        '\n'
        '1. After calling \`suggest_followups\`, call \`create_proposed_plan\` for each suggestion.\n'
        '2. Use the suggestion label as title and a brief description as goal.\n'
        '3. Pass the current promptRef for bidirectional audit trail: prompt → proposal → implementation plan.\n'
        '4. Proposed plans are lightweight ideas — no files or acceptance criteria.',
        ARRAY['proposal', 'followup', 'preservation'],
        ARRAY['suggest followup', 'after completing', 'propose', 'follow-up'],
        ARRAY['conduit-mcp_create_proposed_plan']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['architect', 'engineer', 'planner'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 14. Nexus Boot Procedure
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'nexus-boot-procedure',
        'Nexus Boot Procedure',
        'Minimum startup read set before making changes in nexus/.',
        '## Procedure\n'
        '\n'
        'Load at minimum:\n'
        '1. \`nexus/CLAUDE.md\`\n'
        '2. \`nexus/.agents/pipeline-mode.json\`\n'
        '3. \`nexus/.agents/OPERATING_MODEL.md\`\n'
        '4. \`nexus/.agents/skills/mode-router/SKILL.md\`\n'
        '5. Current conduit-mcp pipeline state (query via GET /state)\n'
        '\n'
        'Additional .agents/ documents as needed, not indiscriminately.',
        ARRAY['bootstrap', 'startup', 'initialization'],
        ARRAY['start session', 'activate', 'boot', 'nexus'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['architect', 'auditor', 'builder', 'DBA', 'engineer', 'epistemologist', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 15. Plan Deletion & Ticket Cleanup
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'plan-deletion-cleanup',
        'Plan Deletion & Ticket Cleanup',
        'Soft-delete a plan, cancel its open tickets, and notify the UI.',
        '## Procedure\n'
        '\n'
        '1. Call \`conduit-mcp_delete_plan\` with the plan number.\n'
        '   - Soft-deletes in DB (deleted=1)\n'
        '   - Removes .md files from all IMPLEMENTATION_PLANS/ subdirs\n'
        '   - Cancels open tickets with closure_reason = plan_deleted\n'
        '   - Calls removePlanFromMemory() on the watcher\n'
        '   - Emits plan_deleted SSE event to the UI\n'
        '\n'
        '2. For stuck plans that cannot be recovered, use \`conduit-mcp_hard_delete_plan\` (irreversible). Requires confirmPlanTitle to match as a safety guard.\n'
        '\n'
        '3. Running delete_plan on an already-deleted plan is safe — it cleans up residual watcher state.',
        ARRAY['plan', 'deletion', 'cleanup', 'ticket'],
        ARRAY['delete plan', 'remove plan', 'cancel plan', 'stuck plan'],
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
    -- ──────────────────────────────────────────────────────────
    -- 16. Orphan Detection
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'orphan-detection',
        'Orphan Detection',
        'Check for inconsistencies between DB state and filesystem artifacts.',
        '## Procedure\n'
        '\n'
        'The conduit MCP /health endpoint includes an orphanScan section:\n'
        '- Plans deleted in DB (deleted=1) that still have .md files on disk\n'
        '- .md files on disk with no corresponding DB row\n'
        '\n'
        'Use this as a periodic check. The watcher getState() also filters soft-deleted plans from the filesystem-driven cache.',
        ARRAY['orphan', 'inconsistency', 'health'],
        ARRAY['check health', 'orphan scan', 'inconsistency'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'inspector', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 17. Nebula-MCP Tool Reference
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'nebula-mcp-tools',
        'Nebula-MCP Tool Reference',
        'Complete catalog of nebula-mcp tools organized by domain.',
        '## Nebula-MCP Tool Reference\n'
        '\n'
        'Full catalog of nebula-mcp tools, organized by domain. Available over MCP transport (Stdio or SSE on port 3102).\n'
        '\n'
        '### Hierarchy: Systems / Subsystems / Features\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| nebula_list_systems | List all systems with full nested hierarchy |\n'
        '| nebula_create_system | Create a new system |\n'
        '| nebula_update_system | Update system metadata |\n'
        '| nebula_delete_system | Delete a system and cascade |\n'
        '| nebula_create_subsystem | Create a subsystem |\n'
        '| nebula_update_subsystem | Update subsystem metadata |\n'
        '| nebula_delete_subsystem | Delete a subsystem and cascade |\n'
        '| nebula_move_subsystem | Move a subsystem to a different parent |\n'
        '| nebula_create_feature | Create a feature under a subsystem |\n'
        '| nebula_update_feature | Update feature metadata |\n'
        '| nebula_delete_feature | Delete a feature and cascade |\n'
        '| nebula_move_feature | Move a feature to a different subsystem |\n'
        '\n'
        '### Requirements (Backlog / Kanban)\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| nebula_list_requirements | List requirements, filterable |\n'
        '| nebula_create_requirement | Create a new requirement |\n'
        '| nebula_update_requirement | Update requirement fields |\n'
        '| nebula_move_requirement | Move requirement to a new status |\n'
        '| nebula_delete_requirement | Delete a requirement |\n'
        '| nebula_batch_update_requirements | Batch-update status |\n'
        '\n'
        '### Agent Records (Bitemporal Audit)\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| nebula_list_agent_records | List audit records, filterable |\n'
        '| nebula_get_agent_record | Get a single record with full content |\n'
        '| nebula_create_agent_record | Create a new record (canonical write path) |\n'
        '| nebula_update_agent_record | Update an existing record |\n'
        '| nebula_delete_agent_record | Delete a record |\n'
        '\n'
        '### Harvest Pipeline\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| nebula_list_harvests | List harvest outputs |\n'
        '| nebula_get_harvest | Get a single harvest |\n'
        '| nebula_create_harvest | Record a new harvest |\n'
        '| nebula_delete_harvest | Delete a harvest |\n'
        '\n'
        '### Projections (Markdown Generation)\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| nebula_list_projections | List projection configs |\n'
        '| nebula_create_projection | Create a projection config |\n'
        '| nebula_render_projection | Execute projection, write output |\n'
        '| nebula_delete_projection | Delete a projection |\n'
        '\n'
        '### Cross-References\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| nebula_list_cross_references | List cross-references, filterable |\n'
        '| nebula_get_cross_reference | Get a single cross-reference |\n'
        '| nebula_create_cross_reference | Create a cross-reference link |\n'
        '| nebula_delete_cross_reference | Delete a cross-reference |\n'
        '\n'
        '### Other Domains\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| nebula_create_folder | Create a system folder |\n'
        '| nebula_delete_folder | Delete a system folder |\n'
        '| nebula_list_sessions | List work sessions |\n'
        '| nebula_create_session | Record a work session |\n'
        '| nebula_update_session | Update session outcome |\n'
        '| nebula_delete_session | Delete a session |\n'
        '| nebula_list_workspaces | List workspace mappings |\n'
        '| nebula_create_workspace | Map system to filesystem path |\n'
        '| nebula_delete_workspace | Remove workspace mapping |\n'
        '| nebula_read_docs | Read README/ARCHITECTURE from disk |\n'
        '| nebula_read_system_docs | Read docs from all system workspaces |\n'
        '| nebula_read_subsystem_docs | Read docs from subsystem workspaces |\n'
        '| nebula_list_plans | List implementation plans |\n'
        '| nebula_get_plan | Fetch a single plan |\n'
        '| nebula_get_preferences | Get all user preferences |\n'
        '| nebula_set_preference | Set a preference value |\n'
        '| nebula_delete_preference | Delete a preference |\n'
        '| nebula_get_system_info | Get info tab content |\n'
        '| nebula_set_system_info | Save info tab content |\n'
        '| nebula_demote_system | Demote system into subsystem |\n'
        '| nebula_import | Bulk-import data |\n'
        '| nebula_seed | Idempotently seed example data |\n'
        '| nebula_query_conduit_plans | List conduit plans (bitemporal) |\n'
        '| nebula_query_conduit_plan_history | Full lifecycle of one plan |\n'
        '| nebula_query_conduit_plan_receipts | Receipts for a plan |\n'
        '| nebula_query_conduit_as_of | Point-in-time snapshot |\n'
        '| nebula_list_deleted_conduit_plans | Find soft-deleted plans |\n'
        '| nebula_health | Check server and DB health',
        ARRAY['reference', 'nebula-mcp', 'tools', 'appendix'],
        ARRAY['list tools', 'what tools', 'nebula-mcp', 'MCP reference'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 18. Tackle-MCP Tool Reference
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'tackle-mcp-tools',
        'Tackle-MCP Tool Reference',
        'Complete catalog of tackle-mcp tools for AI config and memory management.',
        '## Tackle-MCP Tool Reference\n'
        '\n'
        'Tackle-mcp (port 3400) manages the AI configuration registry and Role Memory Procedure Registry.\n'
        '\n'
        '### AI Configuration Registry\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| get_ai_config | Get full AI configuration snapshot |\n'
        '| validate_ai_config | Validate configuration |\n'
        '| seed_default_ai_config | Seed default providers, harnesses, models |\n'
        '| import_ai_config | Replace entire configuration snapshot |\n'
        '\n'
        '### Providers\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| list_ai_providers | List all AI providers |\n'
        '| get_ai_provider(id) | Get a single provider |\n'
        '| upsert_ai_provider | Create or update a provider |\n'
        '| delete_ai_provider(id) | Delete a provider |\n'
        '\n'
        '### Harnesses\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| list_ai_harnesses | List all AI harnesses |\n'
        '| get_ai_harness(id) | Get a single harness |\n'
        '| upsert_ai_harness | Create or update a harness |\n'
        '| delete_ai_harness(id) | Delete a harness |\n'
        '\n'
        '### Models\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| list_ai_models | List all AI models |\n'
        '| get_ai_model(id) | Get a single model |\n'
        '| upsert_ai_model | Create or update a model |\n'
        '| delete_ai_model(id) | Delete a model |\n'
        '\n'
        '### Role Configs & Bundles\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| list_ai_role_configs | List all role configs |\n'
        '| get_ai_role_config(role) | Get a single role config |\n'
        '| upsert_ai_role_config | Create or update role config |\n'
        '| list_config_bundles(role) | List bundles for a role |\n'
        '| upsert_config_bundle | Create or update a bundle |\n'
        '| delete_config_bundle(id) | Delete a bundle |\n'
        '\n'
        '### Role Memory Procedures\n'
        '| Tool | Purpose | Reads From |\n'
        '|------|---------|------------|\n'
        '| memory_get_procedures(role) | Return procedure index for a role | Redis |\n'
        '| memory_get_procedure(slug) | Return full procedure card | Redis |\n'
        '| memory_check_since(role, since) | Check if memory changed | PostgreSQL |\n'
        '| memory_refresh() | Trigger full PG\\u2192Redis sync | role-memory-srv |',
        ARRAY['reference', 'tackle-mcp', 'tools', 'appendix'],
        ARRAY['list tools', 'what tools', 'tackle-mcp', 'MCP reference'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 19. Conduit-MCP Tool Reference
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'conduit-mcp-tools',
        'Conduit-MCP Tool Reference',
        'Complete catalog of conduit-mcp tools for plan lifecycle and pipeline management.',
        '## Conduit-MCP Tool Reference\n'
        '\n'
        'Conduit-mcp (port 3100) manages the plan lifecycle, issues receipts, and serves pipeline state.\n'
        '\n'
        '### Plan Lifecycle\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| query_conduit_state | Return full pipeline state |\n'
        '| create_plan | Create a pending implementation plan |\n'
        '| create_proposed_plan | Create a lightweight proposed plan |\n'
        '| update_plan | Update plan metadata |\n'
        '| delete_plan | Soft-delete a plan |\n'
        '| hard_delete_plan | Permanently delete a stuck plan |\n'
        '| promote_plan | Promote proposed \\u2192 planning |\n'
        '| revise_plan | Create a revision copy in planning |\n'
        '| unblock_plan | Move blocked \\u2192 pending |\n'
        '| report_plan_metadata | Update plan title/description |\n'
        '| get_plan_receipts | Get receipt chain for a plan |\n'
        '\n'
        '### Receipts & Agent Status\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| issue_receipt | Record a conduit event receipt |\n'
        '| report_builder_status | Report builder process status |\n'
        '| agent_heartbeat | Report agent liveness and state |\n'
        '| agent_finished | Report agent completed its task |\n'
        '\n'
        '### Queries\n'
        '| Tool | Purpose |\n'
        '|------|---------|\n'
        '| query_analytics | Query conduit analytics metrics |\n'
        '| query_prompts | Search captured prompts with lineage |\n'
        '| query_nebula_backlog | Query Nebula RMS backlog |\n'
        '| query_nebula_systems | Query Nebula RMS hierarchy |',
        ARRAY['reference', 'conduit-mcp', 'tools', 'appendix'],
        ARRAY['list tools', 'what tools', 'conduit-mcp', 'MCP reference'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 20. Knowledge Stratification (L1-L4)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'knowledge-stratification',
        'Knowledge Stratification (L1-L4)',
        'Two-axis knowledge model: abstraction levels L1-L4 combined with visibility scopes.',
        '## Knowledge Stratification\n'
        '\n'
        'Every document and chunk has two independent attributes: Abstraction Level and Visibility Scope.\n'
        '\n'
        '### Axis 1: Abstraction Level (L1-L4)\n'
        '\n'
        '| Level | Name | Description | Primary Consumers |\n'
        '|-------|------|-------------|-------------------|\n'
        '| L1 | Raw / operational | APIs, schemas, contracts, error codes, configs | Builder |\n'
        '| L2 | Structured / intermediate | Subsystem design, DAG semantics, data models | Builder, Architect |\n'
        '| L3 | Planning / architectural | Rationale, trade-offs, migration philosophy | Architect, Inspector |\n'
        '| L4 | Meta / system reasoning | Cross-system doctrine, ontology, governance | Architect (opt-in) |\n'
        '\n'
        '### Axis 2: Visibility Scope\n'
        '\n'
        '| Scope | Effect |\n'
        '|-------|--------|\n'
        '| builder | Visible to builder role only |\n'
        '| architect | Visible to architect role only |\n'
        '| planner | Visible to planner role only |\n'
        '| reviewer | Visible to reviewer role only |\n'
        '| all | Visible to all roles |\n'
        '\n'
        '### Per-Role Query Filters\n'
        '\n'
        '| Role | Level Filter | Visibility Filter |\n'
        '|------|-------------|-------------------|\n'
        '| Builder | level \\u2264 1 primary, \\u2264 2 secondary | scope IN (builder, all) |\n'
        '| Architect | level \\u2264 3 primary, L4 allowed | scope IN (architect, all) |\n'
        '| Planner | level \\u2264 2 primary, \\u2264 3 allowed | scope IN (planner, all) |\n'
        '| Reviewer | level \\u2264 2 | scope IN (reviewer, builder, all) |\n'
        '| Inspector | level \\u2264 3 | scope IN (all) |\n'
        '| Analyst | level \\u2264 3 | scope IN (analyst, all) |\n'
        '\n'
        '### Cross-Reference Semantics\n'
        'Cross-references are a conditional expansion operator, not a default join. Builders start narrow and expand when blocked; Architects start broader for design context; Inspectors expand aggressively for compliance.',
        ARRAY['reference', 'knowledge', 'stratification', 'levels'],
        ARRAY['knowledge levels', 'L1 L2 L3 L4', 'stratification', 'visibility'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 21. WorkRequest Pattern Participation
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'work-request-participation',
        'WorkRequest Pattern Participation',
        'How to participate in the WorkRequest pattern: capture, plan, emit, execute, recover.',
        '## WorkRequest Participation\n'
        '\n'
        'Unless the user explicitly asks for a different workflow, participate in the WorkRequest pattern as follows:\n'
        '\n'
        '### 1. Prompt & Intent Capture\n'
        'For non-trivial requests, preserve the request in prompt or planning records. Query conduit-mcp pipeline state before creating new record formats. Extend existing records instead of inventing parallel files. Avoid claiming archival is complete if the storage path doesn''t exist.\n'
        '\n'
        '### 2. Implementation Plan Stacking\n'
        'When the task is substantial, cross-file, risky, or spans sessions:\n'
        '- Create or update an implementation plan in the expected location\n'
        '- Stack new plans on top of existing state, don''t overwrite history\n'
        '- Keep scope narrow enough to be executable\n'
        '- Verify no pending/active plan covers the same work\n'
        '\n'
        '### 3. WorkRequest Emission\n'
        'Generate explicit WorkRequests when:\n'
        '- Prompted by the user\n'
        '- The active repository workflow clearly expects them\n'
        '- Follow existing schemas and lifecycle conventions\n'
        '- Supersede or version existing artifacts instead of mutating history\n'
        '\n'
        '### 4. Execution\n'
        '- Execute only work that is directly requested or already authorized\n'
        '- Respect plan boundaries, blocked states, dependency ordering\n'
        '- Update implementation records after meaningful work\n'
        '\n'
        '### 5. Recovery\n'
        'On session restart or ambiguous state:\n'
        '- Query conduit-mcp pipeline state and .agents/ artifacts first\n'
        '- Assume work may already be partially complete\n'
        '- Prefer reconciling with durable state over conversational memory',
        ARRAY['governance', 'workrequest', 'participation', 'pattern'],
        ARRAY['work request', 'how to work', 'participation pattern', 'WR pattern'],
        ARRAY['conduit-mcp_query_conduit_state']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'builder', 'critic', 'engineer', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 22. Day/Night Turn Boundary
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'day-night-boundary',
        'Day/Night Turn Boundary',
        'Perceptual cycle: Day (evidence accumulation within a turn) vs Night (reconciliation between sessions).',
        '## Day/Night Turn Boundary\n'
        '\n'
        'Sessions follow a perceptual cycle:\n'
        '\n'
        '### Day (within a turn)\n'
        '- Evidence accumulation\n'
        '- Messages arrive, inbox is queried, work is done, records are written\n'
        '- No full perceptual recalculation\n'
        '- Each turn appends to the timeline without reconciling the entire belief state\n'
        '\n'
        '### Night (between sessions / on explicit reflection)\n'
        '- Accumulated records are reconciled\n'
        '- Stale threads are resolved or archived\n'
        '- Divergences that accumulated during the day are evaluated\n'
        '- Projections are regenerated\n'
        '- The belief state is recomputed\n'
        '\n'
        '### Triggers for Night mode\n'
        '- Session end (user disconnects)\n'
        '- Explicit type:reconciliation request\n'
        '- Scheduler-driven reflection cycle (future)\n'
        '\n'
        '### Constraint\n'
        'During Day, agents MUST NOT require full perceptual recalculation to respond. The inbox query is the attention filter \\u2014 it answers "what needs my attention right now?" without resolving the entire epistemic state.',
        ARRAY['operational-model', 'day-night', 'perceptual-cycle', 'reconciliation'],
        ARRAY['day night', 'turn boundary', 'perceptual cycle', 'reconciliation'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 23. Role Governance & Epistemic Constraints
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'role-governance',
        'Role Governance & Epistemic Constraints',
        'Roundtable of epistemic agents: no single role closes decisions in another''s domain.',
        '## Role Governance\n'
        '\n'
        'Roles form a **roundtable of epistemic agents** with competing claims. No single role may unilaterally close a decision in another''s domain.\n'
        '\n'
        '### Invariants\n'
        '\n'
        '**I1 \\u2014 No single layer dominates.**\n'
        'A Planner cannot override an Architecture decision without a thread. An Engineer cannot unilaterally close a Reviewer rejection.\n'
        '\n'
        '**I2 \\u2014 Origin gating.** Each role owns its domain''s binding output:\n'
        '\n'
        '| Domain | Binding Output | Owning Role |\n'
        '|--------|---------------|-------------|\n'
        '| Architecture decisions | type:decision, recordType: architecture_note | Architect |\n'
        '| Implementation work | type:change, recordType: report | Builder/Engineer |\n'
        '| Review judgement | type:approval / type:rejection | Reviewer |\n'
        '| Plan proposals | type:proposal, recordType: assessment | Planner |\n'
        '| Issue triage | type:triage, recordType: analysis | Analyst |\n'
        '| Compliance violations | type:violation, recordType: inspection | Inspector |\n'
        '\n'
        'A role may propose candidates in any domain (via type:finding, type:warning) but only the owning role emits the binding type:decision or type:approval.\n'
        '\n'
        '**I3 \\u2014 Divergence is signal, not noise.**\n'
        'Conflicting assessments must be preserved as visible records \\u2014 never silently collapsed. Resolution happens through explicit threads.\n'
        '\n'
        '**I4 \\u2014 Read-only provenance records.**\n'
        'recordType: response and recordType: prompt are immutable history. Archivist records are append-only. These must never be updated, only created.\n'
        '\n'
        '### Divergence Tags\n'
        '- type:disagreement \\u2014 Explicit conflicting position\n'
        '- type:escalation \\u2014 Request for owning role to resolve\n'
        '- type:deferred \\u2014 Known conflict tabled for later',
        ARRAY['governance', 'role', 'epistemic', 'constraints'],
        ARRAY['governance', 'role rules', 'epistemic', 'who decides'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 24. Per-Role Outbox Table
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'per-role-outbox-table',
        'Per-Role Outbox Table',
        'Reference: what each role sends, to whom, and when.',
        '## Per-Role Outbox Table\n'
        '\n'
        '| Role | record_type | Tags | To | When |\n'
        '|------|------------|------|----|------|\n'
        '| **Planner** | prompt | type:plan | Architect | Plan needs architecture spec |\n'
        '| | prompt | type:plan | Engineer | Plan ready to implement |\n'
        '| | assessment | type:proposal | All | New work proposal |\n'
        '| | report | type:db-change | DBA | Plan needs DB change — DBA posts to Drafts forum, applies after admin approval, before builder |\n'
        '| | prompt | type:question | Analyst | Needs analysis |\n'
        '| **Architect** | architecture_note | type:decision | Engineer | Arch decision to implement |\n'
        '| | architecture_note | type:spec_ref | Engineer | Reference spec produced |\n'
        '| | engineering_log | type:incident | Engineer | Bug/fix needed |\n'
        '| | engineering_log | type:task | Engineer | Small task |\n'
        '| | assessment | type:review | Planner | Arch review of a plan |\n'
        '| | engineering_log | type:question | Planner | Design clarification |\n'
        '| **Engineer** | engineering_log | type:task | Self | Personal backlog |\n'
        '| | engineering_log | type:question | Architect | Design question |\n'
        '| | engineering_log | type:blocker | Planner | Blocked, needs decision |\n'
        '| | report | type:implementation | Reviewer | Ready for review |\n'
        '| | analysis | type:finding | Architect | Discovered during work |\n'
        '| **Builder** | report | type:change | Reviewer | Implementation complete |\n'
        '| | engineering_log | type:blocker | Planner | Blocked on build |\n'
        '| **Reviewer** | assessment | type:approval | Archive | Approved \\u2014 done |\n'
        '| | assessment | type:rejection | Engineer | Needs fixes |\n'
        '| | inspection | type:issue | Engineer | Issue found |\n'
        '| **Analyst** | analysis | type:gap | Planner | Gap analysis |\n'
        '| | analysis | type:triage | Architect | Triaged issue |\n'
        '| | analysis | type:recommendation | Engineer | Suggestion |\n'
        '| **Critic** | inspection | type:warning | Analyst | Warning, triage first |\n'
        '| **Inspector** | inspection | type:error | Analyst | Error, triage |\n'
        '| | inspection | type:violation | Planner | Compliance violation |\n'
        '| **Archivist** | report | type:history | All | Read-only historical record |',
        ARRAY['reference', 'messaging', 'outbox', 'routing'],
        ARRAY['outbox', 'who sends what', 'role messages', 'message routing'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'auditor', 'builder', 'critic', 'DBA', 'engineer', 'epistemologist', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 25. Agent Config Frontmatter Template
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'agent-config-template',
        'Agent Config Frontmatter Template',
        'Frontmatter template for .opencode/agents/ role definition files.',
        '## Agent Config Role Definition\n'
        '\n'
        'Each agent role .md file (in .opencode/agents/) MUST include a message block in its frontmatter:\n'
        '\n'
        '\`\`\`yaml\n'
        '---\n'
        'assumes_role: <role>\n'
        'message:\n'
        '  inbox_query:\n'
        '    - tags contain "to:<role>"\n'
        '    - tags contain "status:open"\n'
        '  record_types: [list of valid record types for this role]\n'
        '  auto_present: true\n'
        '  enrich_context: true\n'
        '---\n'
        '\`\`\`\n'
        '\n'
        '### Fields\n'
        '- assumes_role: The role this agent config activates (engineer, architect, planner, etc.)\n'
        '- inbox_query: Tag filters for inbox querying\n'
        '- record_types: Valid agent record types this role may write\n'
        '- auto_present: Whether to surface inbox items on every turn start\n'
        '- enrich_context: Whether to load linked system/subsystem/plan data on boot\n'
        '\n'
        '### Valid record_type values\n'
        'report, analysis, assessment, inspection, prompt, response, engineering_log, architecture_note, decision',
        ARRAY['reference', 'config', 'frontmatter', 'agent-definition'],
        ARRAY['agent config', 'frontmatter', 'role definition', '.opencode/agents'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'builder', 'critic', 'engineer', 'inspector', 'planner', 'reviewer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 26. Planner: Create & Manage Plans
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'planner-create-plan',
        'Planner: Create & Manage Plans',
        'How to create, update, and promote implementation plans (via nebula_create_plan), and route DB-change plans to the Engineer before a Builder starts.',
        '## Creating & Managing Plans\n'
        '\n'
        '### Create a Plan (ready for implementation)\n'
        'Use \`nebula_create_plan\` (nebula-mcp) with title, project, goal, filesAffected, acceptanceCriteria, and dependencies. conduit-mcp create_plan / create_proposed_plan are REMOVED stubs (TOOL_NOT_FOUND) — do not call them. The plan lands in nebula.implementation_plans (status pending) and conduit-mcp auto-bootstraps a PLAN_CREATE receipt + builder ticket within ~30s.\n'
        '\n'
        '### Proposed / Planning states\n'
        'There is no create_proposed_plan tool. Start ideas as a full plan via nebula_create_plan; use conduit-mcp_revise_plan to create a revision copy for planning discussion. Use conduit-mcp_update_plan / report_plan_metadata to set filesAffected, acceptanceCriteria, dependencies.\n'
        '\n'
        '### ⚠ DB-Change Routing (mandatory rule)\n'
        '**Plans that require database changes go to the DBA for the DB work BEFORE a Builder starts implementation.** When creating or updating a plan whose goal, filesAffected, or acceptance criteria involve schema changes, migrations, DDL, seed/data backfills, or index changes:\n'
        '1. Write a nebula agent record tagged \`["to:dba", "type:db-change", "planRef:<N>", "status:open"]\`    describing exactly which database changes are required (tables, columns,    migrations, data). Use recordType report.\n'
        '2. Put the DB change as the FIRST acceptance criterion of the plan so the builder    knows the schema must exist before implementation.\n'
        '3. The DBA posts the proposed alterations to the Assembly Drafts forum\n'
        '    (slug \`draft\`) and applies them ONLY after admin approval. The Builder must\n'
        '    not start implementation until the DBA completes the DB change (approval +\n'
        '    application) and the plan is still pending/ready. If a builder ticket is\n'
        '    already open for a DB-change plan, escalate via \`type:escalation\` to keep\n'
        '    sequencing.\n'
        '\n'
        '### Update Metadata\n'
        'Use \`conduit-mcp_update_plan\` or \`conduit-mcp_report_plan_metadata\` to set filesAffected, acceptanceCriteria, dependencies.\n'
        '\n'
        '### Revise a Plan\n'
        'Use \`conduit-mcp_revise_plan\` to create a revision copy (issues PLANNING on the new copy).\n'
        '\n'
        '### Issue Receipts (state transitions)\n'
        'Use \`conduit-mcp_issue_receipt\` with plan_id, type (PLAN_CREATE|IMPLEMENTATION|REVIEW_PASS|REVIEW_REJECT|BLOCK|PLANNING|HOLD|CANCELLED), and agent_role.\n'
        '\n'
        '### Delete a Plan\n'
        'Use \`conduit-mcp_delete_plan\` for soft-delete (preserves audit trail). Use \`conduit-mcp_hard_delete_plan\` (with title confirmation) for permanent removal.',
        ARRAY['planner', 'plans', 'create', 'manage', 'workflow', 'db-change'],
        ARRAY['create plan', 'new plan', 'propose plan', 'promote plan', 'delete plan', 'database change', 'schema change', 'migration'],
        ARRAY['nebula_create_plan', 'conduit-mcp_update_plan', 'conduit-mcp_revise_plan', 'conduit-mcp_issue_receipt', 'conduit-mcp_delete_plan', 'conduit-mcp_hard_delete_plan']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['engineer', 'planner'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 27. Implementation Plan Template
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'plan-template-format',
        'Implementation Plan Template',
        'Required sections for every implementation plan: Goal, Files, AC, Dependencies.',
        '## Implementation Plan Format\n'
        '\n'
        'Every plan written to pending/ must include these sections:\n'
        '\n'
        '\`\`\`markdown\n'
        '## Goal\n'
        '<what this plan achieves>\n'
        '\n'
        '## Files Affected\n'
        '<absolute paths to every file that will be created or modified>\n'
        '\n'
        '## Acceptance Criteria\n'
        '<how to verify the plan was implemented successfully — specific commands, outputs, or observable states>\n'
        '\n'
        '## Dependencies\n'
        '<other plan names this one depends on, or "none">\n'
        '\`\`\`',
        ARRAY['reference', 'template', 'plan-format'],
        ARRAY['plan template', 'plan format', 'acceptance criteria', 'files affected'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['builder', 'engineer', 'planner'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 28. Builder: Implementation Workflow
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'builder-workflow',
        'Builder: Implementation Workflow',
        'How the Builder picks up pending plans, implements them, and handles blockers.',
        '## Builder Workflow\n'
        '\n'
        '### 1. Query Pipeline State\n'
        'Use \`conduit-mcp_query_conduit_state\` to find pending plans. Check for blocked plans first — if any exist, stop and alert.\n'
        '\n'
        '### 2. Read Plan Details\n'
        'Use \`conduit-mcp_get_plan_receipts\` to review plan receipts and confirm its lifecycle state. Read the .md file from filesystem for the implementation spec (goal, files, AC, deps).\n'
        '\n'
        '### 3. Implement\n'
        'Modify code according to the plan goal, files affected, and acceptance criteria. Use \`conduit-mcp_agent_heartbeat\` to report liveness.\n'
        '\n'
        '### 4. Handle Blockers\n'
        'If implementation cannot proceed: \`conduit-mcp_issue_receipt\` with type BLOCK. Report the issue to the user.\n'
        '\n'
        '### 5. Report Completion\n'
        'Use \`conduit-mcp_agent_finished\` when the plan is implemented. The pipeline manager handles receipt advancement automatically.\n'
        '\n'
        '### Continuous Execution Rule\n'
        'The Builder works through all available plans without pausing. Only stops on: true blocker, logical impossibility, or user interrupt. Does NOT ask for approval between plans.',
        ARRAY['builder', 'workflow', 'implementation', 'plans'],
        ARRAY['builder workflow', 'implement plan', 'pending plans', 'blocker'],
        ARRAY['conduit-mcp_query_conduit_state', 'conduit-mcp_get_plan_receipts', 'conduit-mcp_agent_heartbeat', 'conduit-mcp_issue_receipt', 'conduit-mcp_agent_finished']
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
    -- ──────────────────────────────────────────────────────────
    -- 29. Verification & Build Commands
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'verification-commands',
        'Verification & Build Commands',
        'Build, typecheck, and test commands for the nexus workspace.',
        '## Verification Commands\n'
        '\n'
        '### MCP Server\n'
        '\`\`\`bash\n'
        'cd nexus/typescript/conduit-mcp && npx tsc --noEmit\n'
        'cd nexus/typescript/conduit-mcp && npx vitest run\n'
        '\`\`\`\n'
        '\n'
        '### Backend (LOSM)\n'
        '\`\`\`bash\n'
        'cd nexus/python/ai/losm && source .venv/bin/activate && pytest\n'
        '\`\`\`\n'
        '\n'
        '### UI (React)\n'
        '\`\`\`bash\n'
        'cd nexus-ui/nexus-plurality-ui && npx tsc --noEmit\n'
        'cd nexus-ui/nexus-plurality-ui && npm run build\n'
        '\`\`\`\n'
        '\n'
        '### Conduit UI (Angular)\n'
        '\`\`\`bash\n'
        'cd nexus/angular/conduit-ui && npx ng build\n'
        '\`\`\`\n'
        '\n'
        '### Chat Server\n'
        '\`\`\`bash\n'
        'cd nexus/python/conduit && python3 agent_chat.py\n'
        '\`\`\`',
        ARRAY['reference', 'commands', 'build', 'test', 'verification'],
        ARRAY['build', 'test', 'typecheck', 'verify', 'tsc', 'vitest', 'pytest'],
        '{}'
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
    -- ──────────────────────────────────────────────────────────
    -- 30. MCP Server & Chat Configuration
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'mcp-server-config',
        'MCP Server & Chat Configuration',
        'Conduit-mcp server, chat server, health check, and orphan scan details.',
        '## MCP Server Configuration\n'
        '\n'
        '### Conduit-mcp (port 3100)\n'
        '- Pipeline orchestration: state machine, receipts, tickets\n'
        '- All plan creation/promotion/state queries go through MCP tools\n'
        '- Never write .md files directly to nexus/graph/IMPLEMENTATION_PLANS/\n'
        '\n'
        '### Chat Server (port 3101)\n'
        '- Python: nexus/python/conduit/agent_chat.py\n'
        '- MCP server proxies /chat routes:\n'
        '  - GET /chat/config — available agent roles\n'
        '  - POST /chat/send — send message to an agent\n'
        '  - GET /chat/sessions — active sessions\n'
        '- Supports @planner, @builder, @reviewer, @critic notation\n'
        '- Spawns opencode run --agent <role> as background process\n'
        '- Streams output via SSE: /chat/stream/<id>\n'
        '\n'
        '### Health Check\n'
        '- GET /health returns server status, PID, pipeline state\n'
        '- OrphanScan section: detects soft-deleted plans with stale .md files, and filesystem artifacts with no DB row',
        ARRAY['reference', 'config', 'server', 'mcp', 'chat'],
        ARRAY['mcp server', 'chat server', 'health check', 'port 3100', 'port 3101'],
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['architect', 'builder', 'engineer', 'planner'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 31. Role-Lease Orientation (Plan 1286)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'role-lease-orientation',
        'Role-Lease Orientation (Plan 1286)',
        'Read your active role lease, consume bounded units from the READY pool via the canonical POST /consume endpoint (unified accounting across all three channels), rely on auto-exhaustion (revoke + agent record), and respect the scheduler emptiness check + T16 runaway guardrail. Run wr-conf-002 to verify.',
        '## Procedure\n'
        '\n'
        'At the start of every turn, before processing the user''s request:\n'
        '\n'
        '1. **Check for an active role lease:**\n'
        '   - Call \`role_lease_status\` (nebula-mcp) — filter for your role.\n'
        '   - If no ACTIVE lease exists, you are NOT authorized to consume work from the READY pool.\n'
        '   - The lease carries a time window and optional unit budget.\n'
        '\n'
        '2. **Read the lease terms:**\n'
        '   - \`window_end\`: the absolute deadline — you MUST stop consuming work before this time.\n'
        '   - \`budget_units\`: max units you may consume (NULL = unlimited).\n'
        '   - \`consumed_units\`: how many you have already consumed.\n'
        '   - \`channel\`: "interactive" (Freebuff), "opencode" (CLI), "ollama", "unknown".\n'
        '\n'
        '3. **Consume bounded units from the READY pool:**\n'
        '   - Call \`role_lease_status\` at turn start to confirm remaining budget.\n'
        '   - If \`budget_units IS NOT NULL AND consumed_units >= budget_units\`, the lease is exhausted — stop consuming, surface to user.\n'
        '   - If \`NOW() > window_end\`, the lease has expired — surface to user, ask about renewal.\n'
        '   - **After each completed work item:** call \`POST /api/role-leases/consume\` with \`{"role":"<your_role>"}\` to increment consumed_units.\n'
        '     The endpoint returns \`{"ok":true,"consumed":N,"budget":M,"exhausted":bool}\` — check \`exhausted\` to confirm remaining budget.\n'
        '\n'
        '4. **Exhaustion is automatic — the endpoint handles it (1285 remediation):**\n'
        '   - When \`consumed_units >= budget_units\`, the consume endpoint:\n'
        '     a. Auto-revokes the lease (\`status → RELEASED\`).\n'
        '     b. Emits a \`type:lease-exhausted\` agent record (visible in architect/engineer inbox).\n'
        '   - You do NOT need to manually check for exhaustion — the response includes \`exhausted: true\`.\n'
        '   - If exhausted, surface to the user and stop consuming. A new lease must be issued to resume.\n'
        '\n'
        '5. **Renewal is an explicit decision:**\n'
        '   - If the window or budget is running out but work remains, ask the user whether to renew.\n'
        '   - Call \`role_lease_renew\` with a new window_end and/or budget_units extension.\n'
        '   - Renewal auto-expires a stale ACTIVE lease before creating a new one.\n'
        '\n'
        '6. **Revoke on completion or session end:**\n'
        '   - Call \`role_lease_revoke\` when you are done consuming work.\n'
        '   - This frees the role so another session can acquire it.\n'
        '\n'
        '7. **Lease is NOT ownership — unclaimed work returns to READY on expiry.**\n'
        '   - The pipeline-health sweep detects stale leases (check #5) and surfaces them as findings.\n'
        '   - Handoff to scheduled OpenCode runs is a non-event because work lives in the DB.\n'
        '\n'
        '## Three-Channel Accounting (plan 1286)\n'
        '\n'
        'All execution channels hit the same canonical endpoint:\n'
        '\n'
        '\`\`\`\n'
        'POST /api/role-leases/consume  {"role":"<role>"}\n'
        '\`\`\`\n'
        '\n'
        '| Channel | Integration Point |\n'
        '|---|---|\n'
        '| execution_worker.py | \`urllib.request\` POST after plan-backed success (5s timeout, with-block) |\n'
        '| harness-srv (Ollama) | \`fetch\` POST after \`/api/generate\` response (5s AbortController) |\n'
        '| harness-srv (OpenCode) | \`fetch\` POST after spawn close (5s AbortController) |\n'
        '| Interactive (Freebuff) | Manual \`curl\` POST after each completed work item |\n'
        '\n'
        'One endpoint, one implementation — no inline SQL in three places.\n'
        '\n'
        '## Emptiness Check (1285 remediation slice 1)\n'
        '\n'
        'The scheduler (\`agent_scheduler_runner.py\`) now checks eligibility before launching:\n'
        '- \`_has_eligible_work(role)\` is called BEFORE \`launch_agent()\`.\n'
        '- Builder: checks \`execution.requests\` READY count > 0.\n'
        '- Reviewer: checks \`vision.tickets\` open reviewer count > 0.\n'
        '- Logs \`skip (role=X, eligible=0)\` and increments \`skipped_empty\` in the summary.\n'
        '- This prevents the runaway-reviewer incident (e6d854da) where reviewer launched with 0 plans.\n'
        '\n'
        '## T16 Runaway Guardrail (1285 remediation slice 2)\n'
        '\n'
        'harness-srv runs a watchdog loop (60s interval, 15min threshold):\n'
        '- Tracks active sessions with jobId, role, model, startedAt, promptFile, **pid**.\n'
        '- Checks \`nebula.agent_records\` for durable output since launch.\n'
        '- On detection of an idle session (>15min, no output):\n'
        '  1. \`process.kill(pid, ''SIGTERM'')\` — direct PID, not \`pkill -f\`.\n'
        '  2. Unloads Ollama model via \`POST /api/generate {keep_alive: 0}\`.\n'
        '  3. Emits \`type:runaway-detected\` agent record.\n'
        '- \`GET /sessions\` on harness-srv (:3420) shows active session list.\n'
        '\n'
        '**Spawn refactor:** \`executeOpencode\` uses \`child_process.spawn\` (not \`execFile\`)\n'
        'so the child PID is captured for direct SIGTERM. Timeout: SIGTERM → 5s grace → SIGKILL.\n'
        '\n'
        '## Conformance Test (wr-conf-002)\n'
        '\n'
        'Deterministic, LLM-free integration test — 16 tests, 6 ACs:\n'
        '\n'
        '\`\`\`bash\n'
        'cd /home/codex/dev/nexus\n'
        'python3 -m pytest python/nexus_core/wrp/tests/test_conformance_role_leases.py -v\n'
        '\`\`\`\n'
        '\n'
        '| AC | Coverage |\n'
        '|---|---|\n'
        '| AC1 | Lease issue + status query (POST /issue, GET /role-leases, 409 on dup) |\n'
        '| AC2 | Three-channel consumption (single, triple, 404 on no-lease) |\n'
        '| AC3 | Exhaustion hook (exhausted=true, auto-revoke, agent record, multi-unit) |\n'
        '| AC4 | Scheduler emptiness check (builder READY>0, reviewer open=0) |\n'
        '| AC5 | Harness-srv session tracking (GET /sessions, health check) |\n'
        '| AC6 | Pipeline-health sweep #5 (/stale for expired-window leases) |\n'
        '\n'
        '## Lease Lifecycle\n'
        '\`\`\`\n'
        'issue → ACTIVE (one per role)\n'
        '  ├─ window_end passes → stale (sweep detects)\n'
        '  ├─ consume → consumed_units++ (unified POST /consume)\n'
        '  │   └─ budget exhausted → auto-revoke + type:lease-exhausted record\n'
        '  ├─ renew → extended window/budget (resets stale check)\n'
        '  └─ revoke → RELEASED (voluntary release)\n'
        '\`\`\`\n'
        '\n'
        '## INTERACTIVE Channel (Freebuff-Hosted Roles)\n'
        '\n'
        'Roles that run inside the Freebuff interactive session are never launched by harness-srv\n'
        'or the scheduler. They are represented in \`tackle.config_bundle\` with:\n'
        '\n'
        '- \`invocation_mode = ''INTERACTIVE''\`\n'
        '- \`harness_id = ''harn-freebuff''\` — a harness with \`binary: null\`, \`execution.mode: hosted\`, \`host: freebuff\`\n'
        '- \`model_id\` still resolves for lease accounting, but no launch path may spawn it\n'
        '\n'
        '### Guards\n'
        '\n'
        '**harness-srv \`/run\`:** HTTP 400 refuses any role whose resolved config_bundle has \`invocation_mode = ''INTERACTIVE''\`:\n'
        '\`\`\`\n'
        'error: "role <role> is INTERACTIVE-hosted (Freebuff) — cannot be launched via harness-srv; run it in the Freebuff interactive session instead"\n'
        '\`\`\`\n'
        '**Scheduler:** \`agent_scheduler_runner.py\` calls \`_is_interactive_hosted(role)\`; if true,\n'
        'logs \`skip (role=X, interactive-hosted)\` and increments \`skipped_interactive\` in the\n'
        'tick summary. The scheduler never launches an INTERACTIVE-hosted role.\n'
        '\n'
        '### Real Task\n'
        '\n'
        'The \`leased-builder\` role has a real dispatchable task:\n'
        '\n'
        '\`\`\`\n'
        'tackle.tasks: role=leased-builder, task_slug=implement-change, scope="Implement the approved change under an active role lease (bounded consumption)"\n'
        'wind.tasks:   id=...0005, name="Implement Change (Leased)" → links to the tackle task\n'
        '\`\`\`\n'
        '\`resolve-context\` on this wind task returns \`role=leased-builder, harness_id=harn-freebuff\`\n'
        'with the full leased-builder persona prompt (5561 chars). The interactive session resolves\n'
        'the context, picks up the work, and executes it under the bounded role lease.\n'
        '\n'
        '### Conformance (wr-conf-005)\n'
        '\n'
        '7 tests asserting the INTERACTIVE guard (commit 235b8c3):\n'
        '\n'
        '\`\`\`bash\n'
        'cd /home/codex/dev/nexus\n'
        'python3 -m pytest python/nexus_core/wrp/tests/test_conformance_interactive_guard.py -v\n'
        '\`\`\`\n'
        '\n'
        '| AC | Assertion |\n'
        '|---|---|\n'
        '| AC1 | leased-builder config_bundle → INTERACTIVE + harn-freebuff; resolve-context maps to freebuff harness |\n'
        '| AC2 | \`/run\` refuses with HTTP 400 and never registers a session; control wind task still resolves launchable |\n'
        '| AC3 | Scheduler shadow skips the leased-builder entry: \`skipped_interactive >= 1\`, \`launched = 0\` |\n'
        '',
        ARRAY['role-lease', 'orientation', 'plan-1286', 'bounded-work'],
        ARRAY['start of turn', 'role lease', 'lease check', 'am i leased', 'leased builder'],
        ARRAY['role_lease_status', 'role_lease_issue', 'role_lease_renew', 'role_lease_revoke']
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
    -- ──────────────────────────────────────────────────────────
    -- 32. Investigation resources: knowledge graph, audit DB, cross-refs
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'investigation-resources',
        'Investigation resources: knowledge graph, audit DB, cross-refs',
        'Where to look when investigating "what exists / what changed / how is X linked to Y": the knowledge graph (knowledge-srv 3109), the canonical audit database (nebula agent records, 3101), and the cross-references table (nebula.cross_references).',
        '# Investigation resources: knowledge graph, audit DB, cross-refs\n'
        '\n'
        '## When to use this card\n'
        '\n'
        'You are investigating an inventory / baseline question (e.g. T01): what\n'
        'entities exist, what audit trail exists, or how is X linked to Y. Answer\n'
        'from the database-first resources below — not by scanning filesystem\n'
        'directories.\n'
        '\n'
        '## 1. Knowledge graph (knowledge-srv, port 3109)\n'
        '\n'
        'Serves the \`knowledge\` schema (knowledge.postgres: graph_entities,\n'
        'graph_edges, graph_cross_references, graph_migrations).\n'
        '\n'
        'REST endpoints (all GET):\n'
        '\n'
        '- \`/knowledge/summary\` — entity/edge/cross-ref counts by section and\n'
        '  relation type. Live state: 2539 entities, 31 edges, 13 cross-refs,\n'
        '  15 migrations. Sections include work_requests (1897), plans (419),\n'
        '  types (41), gaps_and_blockers (41), actors (39), rules (32),\n'
        '  architectural_observations (26), decisions (16), topology (13),\n'
        '  epistemic_types (8), state_machines (4), boundaries (3).\n'
        '- \`/knowledge/entities\` — all graph entities\n'
        '- \`/knowledge/entities/:section/:entity_id\` — single entity\n'
        '- \`/knowledge/entities/:section/:entity_id/relations\` — outgoing edges\n'
        '- \`/knowledge/edges\` — all edges\n'
        '- \`/knowledge/cross-references\` — graph-level cross-references\n'
        '- \`/knowledge/migrations\` — migration history\n'
        '\n'
        '## 2. Canonical audit database (nebula agent records)\n'
        '\n'
        'The database is the ONLY canonical audit trail (filesystem audit dirs are\n'
        'derived projections). Query via nebula-mcp tools:\n'
        '\n'
        '- \`nebula_list_agent_records\` — filters: role, type, tag(s) (AND\n'
        '  conjunction), search, createdAfter/createdBefore (ISO 8601), level,\n'
        '  visibilityScope, planRef, limit/offset.\n'
        '- \`nebula_get_agent_record\` — full content of one record.\n'
        '- \`nebula_create_agent_record\` / \`nebula_update_agent_record\` — write path.\n'
        '\n'
        'Record types: report, analysis, assessment, inspection, prompt, response,\n'
        'engineering_log, architecture_note, decision.\n'
        'Levels: 1 (raw/operational), 2 (structured), 3 (planning/architectural),\n'
        '4 (meta/system reasoning).\n'
        'Visibility: builder, architect, planner, reviewer, all.\n'
        'Tag routing convention: to:, from:, status:, type:, threadRef (lower-kebab).\n'
        '\n'
        '## 3. Cross-references table (nebula.cross_references)\n'
        '\n'
        'The join between plans, agent records, and knowledge entities. History\n'
        'lives in nebula.cross_references_history.\n'
        '\n'
        '- \`nebula_list_cross_references\` — filter by sourceType/sourceId,\n'
        '  targetType/targetId, relType.\n'
        '- \`nebula_create_cross_reference\` / \`nebula_get_cross_reference\` /\n'
        '  \`nebula_delete_cross_reference\`.\n'
        '\n'
        'rel_type taxonomy (valid values):\n'
        '\n'
        '- wrp:depends_on, wrp:implements, wrp:tracked_by, wrp:impacts_system,\n'
        '  wrp:supersedes\n'
        '- ag:references_plan, ag:same_thread_as, ag:prompted_by, ag:spawns_plan\n'
        '- kv:sourced_from, kv:informs, kv:cross_schema, kv:name_overlap,\n'
        '  kv:description_overlap\n'
        '\n'
        'The knowledge graph also exposes its own cross-refs via\n'
        'knowledge-srv \`GET /knowledge/cross-references\`\n'
        '(graph_cross_references — currently 13 links).\n'
        '\n'
        '## Anti-patterns\n'
        '\n'
        '- Do not read audit/ or IMPLEMENTATION_PLANS/ markdown as operational\n'
        '  state; query the DB via nebula-mcp.\n'
        '- Do not guess rel_type strings; use the taxonomy above.\n'
        '- When a question says "who/what references X", start from\n'
        '  nebula.cross_references and expand via relations.\n'
        '',
        ARRAY['investigation', 'knowledge-graph', 'audit', 'cross-references', 'database-first', 't01'],
        ARRAY['investigation', 'knowledge graph', 'audit database', 'cross-refs', 'what entities exist', 'what changed', 'linked to', 'baseline', 'inventory', 't01'],
        ARRAY['nebula_list_agent_records', 'nebula_get_agent_record', 'nebula_list_cross_references', 'nebula_create_cross_reference', 'nebula_get_cross_reference', 'nebula_delete_cross_reference']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'engineer'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 33. Knowledge Graph import + embed pipeline (disk JSON → PostgreSQL)
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'knowledge-graph-pipeline',
        'Knowledge Graph import + embed pipeline (disk JSON → PostgreSQL)',
        'How to import the disk KG (graph/nexus-knowledge-graph.json) into knowledge.graph_entities, backfill asset_id, and re-embed. Use bin/import-knowledge-graph.sh — never run migrate_graph.py bare.',
        '## When to use this card\n'
        '\n'
        '- You edited graph/nexus-knowledge-graph.json and need the changes in PostgreSQL\n'
        '- Entity counts, embeddings, or knowledge_entity assets look stale/duplicated\n'
        '- Any task touching knowledge.graph_entities, graph_entity_embeddings, or the Knowledge Steward role\n'
        '\n'
        '## Canonical pipeline (4 steps)\n'
        '\n'
        '\`\`\`\n'
        'graph/nexus-knowledge-graph.json   (edit this — the disk source of truth)\n'
        '   │\n'
        '   ▼\n'
        'bin/import-knowledge-graph.sh     (ONE command: import + cleanup + backfill + embed)\n'
        '   │\n'
        '   ▼\n'
        'knowledge.graph_entities          ← migrate_graph.py (python/steward/)\n'
        'knowledge.graph_entity_embeddings ← embed-knowledge-graph.sh (bin/)\n'
        'semantics.canonical_asset         ← asset_id backfill via sql/V083__graph_entities_asset_id_backfill.sql\n'
        '\`\`\`\n'
        '\n'
        '## Usage\n'
        '\n'
        '\`\`\`bash\n'
        '# Full cycle (import + asset backfill + embed):\n'
        'nexus/bin/import-knowledge-graph.sh\n'
        '\n'
        '# Import + backfill only (embed later):\n'
        'nexus/bin/import-knowledge-graph.sh --skip-embed\n'
        '\n'
        '# Inspect only, no writes:\n'
        'nexus/bin/import-knowledge-graph.sh --dry-run\n'
        '\n'
        '# Show migration history:\n'
        'python3 python/steward/migrate_graph.py --list   # requires NEXUS_DB_DSN env\n'
        '\`\`\`\n'
        '\n'
        '## CRITICAL — do not run migrate_graph.py bare\n'
        '\n'
        '- migrate_graph.py defaults to the WRONG DSN (\`postgresql://nexus:nexus@localhost:5432/graph\`).\n'
        '  The wrapper always exports \`NEXUS_DB_DSN=postgresql://pguser:pgpass@localhost:5432/nexus\`.\n'
        '- migrate_graph.py DELETEs all graph_entities/graph_edges/graph_cross_references then re-INSERTs\n'
        '  with fresh gen_random_uuid() ids. Because nothing FKs to graph_entities, a bare re-import\n'
        '  silently: (1) leaves old \`knowledge_entity\` canonical_asset rows unreferenced (asset count\n'
        '  inflates), and (2) leaves graph_entity_embeddings rows pointing at deleted entity uuids\n'
        '  (orphans accumulate).\n'
        '\n'
        '## Invariant (must hold after every run)\n'
        '\n'
        '\`\`\`\n'
        'count(graph_entities) == count(graph_entity_embeddings)\n'
        '                       == count(canonical_asset WHERE asset_kind=''knowledge_entity'' AND expired_at IS NULL)\n'
        'AND 0 graph_entities with NULL asset_id\n'
        'AND 0 orphan embeddings\n'
        '\`\`\`\n'
        '\n'
        '## Steward ownership\n'
        '\n'
        'The Knowledge Steward role has exclusive write access to knowledge.graph_* tables.\n'
        'All other agents are read-only. The import wrapper is the sanctioned write path.',
        ARRAY['kg', 'knowledge-graph', 'embed', 'steward', 'graph_entities', 'embeddings', 'canonical_asset', 'import-knowledge-graph', 'migrate_graph'],
        ARRAY['knowledge graph', 'knowledge-graph', 'import kg', 're-embed', 'graph_entities', 'embed-knowledge-graph', 'migrate_graph', 'KG import', 'steward'],
        ARRAY['bash', 'nebula_list_agent_records']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['analyst', 'architect', 'inspector', 'operator'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 34. Search audit archives
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'operator-audit-search',
        'Search audit archives',
        'When the user asks about past completed work, change reports, prompts, or inspections, use query_archive (filters by category: completed-plans, build-logs, prompts, changes), query_prompts (search + project filter), query_inspections (status filters), or query_changes (committed, flagged, reviewed). Return pagination-aware responses and always name the original file path so the user can cross-check.',
        '# Search audit archives\n'
        '\n'
        '## When to use this card\n'
        '\n'
        'The user asks about historical artifacts — "previous work", "completed\n'
        'plans", "audit log", "change reports", "prompt history",\n'
        '"inspections", "what did we ship last week".\n'
        '\n'
        '## Procedure\n'
        '\n'
        '1. **Choose category by question shape:**\n'
        '   - Completed plans / build logs → \`query_archive\` with\n'
        '     \`{ category: "completed-plans" | "build-logs" }\`\n'
        '   - Prompts (captured prompts with lineage) → \`query_prompts\` with\n'
        '     \`{ search: "<term>", project: "<name>" }\` (both optional)\n'
        '   - Inspections (reports, errors, warnings, blockers, todos) →\n'
        '     \`query_inspections\` with \`{ status: "resolved" | "unresolved" |\n'
        '     "pending", category: "report" | "error" | "warning" | ... }\`\n'
        '   - Change reports → \`query_changes\` with\n'
        '     \`{ category: "committed" | "flagged" | "reviewed" }\`\n'
        '2. **Pagination:** all four tools accept \`{ page, pageSize }\`.\n'
        '   Default page size is 50; increase or decrease as the user requests.\n'
        '3. **Always include the file path.** Every returned entry has a\n'
        '   \`file_path\` or \`path\` field — name it in your reply so the user\n'
        '   can cross-check on disk.\n'
        '\n'
        '## Reporting shape\n'
        '\n'
        '- For a list query: report \`total results, page X/Y\`, then list\n'
        '  \`[date | title | path]\` rows from the actual payload.\n'
        '- For a single-result query: quote the entry verbatim.\n'
        '\n'
        '## Anti-patterns\n'
        '\n'
        '- Do not paraphrase an audit entry''s summary; quote it.\n'
        '- Do not omit the file path — that''s the cross-check lever.\n'
        '- Do not invent dates or titles.\n'
        '\n'
        '## MCP tools used\n'
        '\n'
        '- \`query_archive\` — search archived pipeline artifacts (category filter)\n'
        '- \`query_prompts\` — captured prompts with lineage (search, project)\n'
        '- \`query_inspections\` — inspection records (category, status, plan ref)\n'
        '- \`query_changes\` — change reports (category filter)\n'
        '',
        ARRAY['audit', 'archive', 'prompts', 'inspections', 'changes', 'operator'],
        ARRAY['previous work', 'completed plan', 'audit log', 'change report', 'prompt history', 'inspections'],
        ARRAY['query_archive', 'query_prompts', 'query_inspections', 'query_changes']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['operator'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 35. No-hallucination rule for tool data
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'operator-no-hallucination-rule',
        'No-hallucination rule for tool data',
        'Always report exactly what the tool returned. If the tool returned an error, report the error verbatim. If it returned JSON, summarize the payload structure (keys, counts) and then quote specific fields the user asked about. Never produce plan IDs, requirement IDs, statuses, or any data that did not come back in the tool response.',
        '# No-hallucination rule for tool data\n'
        '\n'
        '## When to use this card\n'
        '\n'
        'Always. This is the operator''s most important procedure card. Every\n'
        'reply that includes data must be grounded in tool output.\n'
        '\n'
        '## Rule\n'
        '\n'
        'Report exactly what the tool returned, in this order:\n'
        '\n'
        '1. **Report the structure first.** "The tool returned\n'
        '   \`{ count: 12, records: [...] }\`." Name the keys, count, and the\n'
        '   top-level shape. The user can ask follow-up questions about\n'
        '   specific fields once they trust the surface shape.\n'
        '2. **Quote the specific fields the user asked about**, verbatim from\n'
        '   the payload. Do not paraphrase values that are short enough to\n'
        '   quote (\`< 200\` chars). For longer values, summarize then offer to\n'
        '   quote in full.\n'
        '3. **Errors are facts, not failures to hide.** If the tool returned\n'
        '   \`{ error: "..." }\` or threw an exception, report the error\n'
        '   verbatim. Do not say "couldn''t find it" or "no data available" —\n'
        '   quote the error string.\n'
        '4. **Never invent data.** No plan IDs (\`#0123\`), requirement IDs\n'
        '   (\`req-456\`), WR IDs (\`wr-789\`), statuses, counts, or timestamps\n'
        '   that did not appear in the tool response. If you don''t have a\n'
        '   tool result for a field the user asked about, say so and dispatch\n'
        '   the appropriate tool.\n'
        '\n'
        '## Why this exists as a card\n'
        '\n'
        'The other roles (engineer, architect, planner, etc.) get this rule\n'
        'inlined in their system prompt. The operator was previously getting\n'
        'it from an in-prompt \`CRITICAL: You MUST use the actual data\`\n'
        'directive. Loading this card lets the operator consult the same rule\n'
        'via the procedure-card pathway at request time, consistent with how\n'
        'the other roles load cards at turn start (see AGENTS.md Role Memory\n'
        'Procedure Registry).\n'
        '\n'
        '## Anti-patterns\n'
        '\n'
        '- "I see 5 pending plans" when the tool returned 3 — never.\n'
        '- "The plan title is X" when the tool returned title Y — quote, don''t\n'
        '  paraphrase a Y into an X.\n'
        '- Omitting an error block from the response because it "looked\n'
        '  unimportant".\n'
        '- Producing a quoted plan ID that the user mentioned in an earlier\n'
        '  exchange but that did NOT appear in this turn''s tool response.\n'
        '\n'
        '## MCP tools used\n'
        '\n'
        '(none — this card governs reporting behavior, not tool selection)\n'
        '',
        ARRAY['hallucination', 'grounding', 'tool-data', 'operator', 'critical'],
        '{}',
        '{}'
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['operator'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 36. Query and report pipeline state
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'operator-pipeline-query',
        'Query and report pipeline state',
        'When the user asks about pipeline status, use query_conduit_state to fetch the full state view. Report plans by derived_status (pending/active/blocked/completed/archived/hold); circuit breaker status; builder activity; recent receipts. Do not summarize if the user is asking for a specific field — fetch it explicitly.',
        '# Query and report pipeline state\n'
        '\n'
        '## When to use this card\n'
        '\n'
        'The user asks about pipeline status — "how are plans doing", "is the\n'
        'pipeline jammed", "what is the pipeline working on right now", "circuit\n'
        'breaker", "builder activity", "any blocked plans", recent receipts.\n'
        '\n'
        '## Procedure\n'
        '\n'
        '1. **Default:** call \`query_conduit_state\` (no args). It returns the\n'
        '   full pipeline JSON. Treat this as the single source of truth for\n'
        '   pipeline state — never reconstruct plan counts from memory or\n'
        '   earlier exchanges.\n'
        '2. **Read buckets in this order and report each non-empty one:**\n'
        '   - \`plans.blocked\` — if non-empty, this is the most important finding.\n'
        '     List plan number + title for each.\n'
        '   - \`plans.active\` — in-progress work; report builder ticket status.\n'
        '   - \`plans.pending\` — queued; report count.\n'
        '   - \`plans.hold\` — parked architectural work; report count.\n'
        '   - \`plans.completed\` — usually omit unless user asks; report count only.\n'
        '   - \`plans.archived\` — omit unless user asks explicitly.\n'
        '3. **Always report** \`builder.status\` (running/idle/stale/killed) and\n'
        '   \`circuitBreaker.tripped\` (true/false). These are the two health\n'
        '   signals.\n'
        '4. **Specific field request** — if the user asked for one field ("just\n'
        '   the blocked plans", "circuit breaker status"), report *only* that\n'
        '   field. Do not dump the full state.\n'
        '5. **For a specific plan''s history:** call \`get_plan_receipts\` with\n'
        '   \`{ plan_id: "<number>" }\` and report the receipt chain.\n'
        '6. **For a list of work requests:** call \`runtime_list_work_requests\`,\n'
        '   optionally with \`{ status: "QUEUED" | "CLAIMED" | "SETTLED" | ... }\`.\n'
        '\n'
        '## Anti-patterns\n'
        '\n'
        '- Do not say "the pipeline looks healthy" without citing the bucket\n'
        '  counts and the circuit breaker status from the actual tool output.\n'
        '- Do not list plan numbers from memory — always run the tool.\n'
        '- Do not collapse \`hold\` + \`blocked\` into a single count; they have\n'
        '  different operational meanings (blocked = jammed, hold = parked).\n'
        '\n'
        '## MCP tools used\n'
        '\n'
        '- \`query_conduit_state\` — full pipeline JSON\n'
        '- \`runtime_list_work_requests\` — list WorkRequests (status filter)\n'
        '- \`get_plan_receipts\` — per-plan receipt chain\n'
        '\n'
        '## Reporting shape\n'
        '\n'
        '\`\`\`\n'
        'Pipeline: <builder.status>, breaker <tripped|closed>\n'
        'Pending: <n>, Active: <n>, Blocked: <n>, Hold: <n>, Completed: <n>\n'
        '[if blocked:] BLOCKED — plan #<n> <title>: <reason>\n'
        '\`\`\`\n'
        '',
        ARRAY['pipeline', 'conduit', 'status', 'operator'],
        ARRAY['how are plans', 'pending plans', 'pipeline status', 'what is the pipeline doing', 'circuit breaker', 'builder activity', 'blocked plans'],
        ARRAY['query_conduit_state', 'runtime_list_work_requests', 'get_plan_receipts']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['operator'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 37. Look up requirements
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'operator-requirement-lookup',
        'Look up requirements',
        'When the user asks about backlog items, requirements, or system features, use query_nebula_backlog (filters status, priority). For system hierarchy questions, use query_nebula_systems. For audit history (harvests, candidates): tackle_list_harvest_candidates with filters. Report specific rows by ID, not summary sentences.',
        '# Look up requirements\n'
        '\n'
        '## When to use this card\n'
        '\n'
        'The user asks about requirements, backlog, RMS, systems, features, or\n'
        'pending work items — "what''s in the backlog", "show me high-priority\n'
        'requirements", "what systems do we have", "is there a requirement for\n'
        'X".\n'
        '\n'
        '## Procedure\n'
        '\n'
        '1. **Backlog query:** call \`query_nebula_backlog\`. It accepts optional\n'
        '   \`{ status: "Backlog" | "InProgress" | "Done", priority: "High" |\n'
        '   "Medium" | "Low" }\`. Without filters it returns the full backlog.\n'
        '2. **System hierarchy:** call \`query_nebula_systems\` (no args). Returns\n'
        '   the full system → subsystem → feature tree. Use this when the user\n'
        '   asks "what systems do we have" or "where does feature X live".\n'
        '3. **Cross-reference a harvest candidate to a plan:** if the user\n'
        '   mentions a harvest or candidate by ID, use\n'
        '   \`tackle_list_harvest_candidates\` (filters available) and, when the\n'
        '   user wants to act on one, \`tackle_spawn_plan_from_candidate\`.\n'
        '\n'
        '## Reporting shape\n'
        '\n'
        '- Report specific rows by their actual ID — never invented IDs.\n'
        '- For backlog: list \`[reqId | status | priority | title]\` rows.\n'
        '- For systems: collapse the hierarchy into nested bullet form.\n'
        '- Always quote the count returned by the tool.\n'
        '\n'
        '## Anti-patterns\n'
        '\n'
        '- Do not synthesize a requirement description from conversation memory.\n'
        '- Do not invent IDs.\n'
        '- If the tool returns 0 rows, say so plainly.\n'
        '\n'
        '## MCP tools used\n'
        '\n'
        '- \`query_nebula_backlog\` — list requirements (status, priority filter)\n'
        '- \`query_nebula_systems\` — system hierarchy tree\n'
        '- \`tackle_list_harvest_candidates\` — harvest candidates audit listing\n'
        '- \`tackle_spawn_plan_from_candidate\` — convert candidate into a plan\n'
        '',
        ARRAY['requirements', 'backlog', 'rms', 'systems', 'operator'],
        ARRAY['requirement', 'backlog', 'what work is pending', 'rms', 'systems', 'features'],
        ARRAY['query_nebula_backlog', 'query_nebula_systems', 'tackle_list_harvest_candidates', 'tackle_spawn_plan_from_candidate']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['operator'];
        FOREACH v_role IN ARRAY v_roles LOOP
            INSERT INTO ${SQL}.role_memory (memory_id, role, as_of_dt, expiration_dt)
            VALUES (v_memory_id, v_role, NOW(), NULL);
        END LOOP;
    END IF;
    -- ──────────────────────────────────────────────────────────
    -- 38. WorkRequest lifecycle inspection
    -- ──────────────────────────────────────────────────────────
    v_memory_id := NULL;
    INSERT INTO ${SQL}.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'operator-workrequest-lifecycle',
        'WorkRequest lifecycle inspection',
        'When the user asks about work requests (WRs) by ID or status, use runtime_list_work_requests (status filter) first. For a specific WR: runtime_get_work_request for folded state, runtime_get_work_request_events for raw event log. The runtime_transition tool applies state-machine events (WR_CLAIMED/ACKED/SETTLED/REJECTED/FAILED/NOOP/DEFERRED) — only use it when the user explicitly asks for a state transition, and always confirm before issuing.',
        '# WorkRequest lifecycle inspection\n'
        '\n'
        '## When to use this card\n'
        '\n'
        'The user asks about work requests — "WR-123 status", "list queued\n'
        'WRs", "what''s the event log for WR-foo", "transition this WR", or\n'
        'mentions a WorkRequest ID.\n'
        '\n'
        '## Procedure\n'
        '\n'
        '1. **List** → \`runtime_list_work_requests\` with optional\n'
        '   \`{ status: "VALIDATED" | "QUEUED" | "CLAIMED" | "ACKED" | "SETTLED"\n'
        '   | "REJECTED" | "FAILED", limit }\`.\n'
        '2. **One WR''s folded state** → \`runtime_get_work_request\` with\n'
        '   \`{ wrId: "<id>" }\`.\n'
        '3. **One WR''s raw event log** → \`runtime_get_work_request_events\`\n'
        '   with \`{ wrId: "<id>" }\`.\n'
        '4. **Advance the pipeline by one tick** → \`runtime_tick\` (no args).\n'
        '   Use sparingly; only when the user explicitly asks "advance the\n'
        '   pipeline" or "tick".\n'
        '5. **Apply a transition** → \`runtime_transition\` with\n'
        '   \`{ wrId, type: "WR_CLAIMED" | "WR_ACKED" | "WR_SETTLED" |\n'
        '   "WR_REJECTED" | "WR_FAILED" | "WR_NOOP" | "WR_DEFERRED", payload? }\`.\n'
        '   **Confirm with the user first.** This mutates state.\n'
        '\n'
        '## Reporting shape\n'
        '\n'
        '- For a list: report \`count\` + per-WR \`[id | status | intent.objective]\`.\n'
        '- For a single WR''s folded state: quote the \`status\`, \`currentEvent\`,\n'
        '  and any included receipt summaries.\n'
        '- For an event log: report the events in chronological order with\n'
        '  \`[seq | type | timestamp]\` rows from the actual payload.\n'
        '\n'
        '## Anti-patterns\n'
        '\n'
        '- Never call \`runtime_transition\` without user confirmation.\n'
        '- Never guess a WR ID from the conversation — confirm the ID with the\n'
        '  user before any mutating call.\n'
        '- Do not collapse \`WR_NOOP\` and \`WR_DEFERRED\` — they mean different\n'
        '  things (NOOP = nothing to do; DEFERRED = intentionally parked).\n'
        '\n'
        '## MCP tools used\n'
        '\n'
        '- \`runtime_list_work_requests\`\n'
        '- \`runtime_get_work_request\`\n'
        '- \`runtime_get_work_request_events\`\n'
        '- \`runtime_tick\` (advance pipeline by one transition)\n'
        '- \`runtime_transition\` (mutating — confirm first)\n'
        '',
        ARRAY['workrequest', 'wr', 'runtime', 'lifecycle', 'operator'],
        ARRAY['work request', 'wr-', 'work-request lifecycle', 'wr status', 'transition wr'],
        ARRAY['runtime_list_work_requests', 'runtime_get_work_request', 'runtime_get_work_request_events', 'runtime_transition']
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_memory_id;
    IF v_memory_id IS NOT NULL THEN
        v_roles := ARRAY['operator'];
        FOREACH v_role IN ARRAY v_roles LOOP
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

// ── Task registry (tackle.tasks) ────────────────────────────────────
//
// v7 created tackle.tasks; v8 seeded one inspector task. These exports
// expose the registry to the /tasks REST route and to the inspector
// dispatch flow. The CLI (nexus/typescript/tackle-cli) talks to PG
// directly for its own queries — these functions are the server-side
// mirror for in-process and HTTP consumers.

export interface TackleTaskRow {
  id: string;
  role: string;
  task_slug: string;
  scope: string;
  acceptance_criteria: string[];
  prompt_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined from tackle.prompts for dispatch convenience.
  prompt_role?: string;
  prompt_slug?: string;
  prompt_version?: number;
}

/**
 * List tasks. Default: active only. If includeInactive=true, return all.
 * If role is given, filter by role.
 */
export async function listTackleTasks(
  role?: string,
  includeInactive = false
): Promise<TackleTaskRow[]> {
  const conditions: string[] = [];
  const params: Record<string, any> = {};
  if (!includeInactive) conditions.push("active = TRUE");
  if (role) {
    params.role = role;
    conditions.push("role = @role");
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  return qAll(
    `SELECT id, role, task_slug, scope, acceptance_criteria,
            prompt_id, active, created_at, updated_at
     FROM tasks
     ${where}
     ORDER BY role, task_slug`,
    params
  );
}

/**
 * Fetch one task by task_slug, joining the referenced prompt so the
 * caller gets the (role/slug/version) triple for the template the task
 * binds to. Returns the most-recent active row, falling back to the
 * most-recent inactive row if no active task exists with that slug.
 */
export async function getTackleTask(
  taskSlug: string
): Promise<TackleTaskRow | undefined> {
  return qOne(
    `SELECT t.id, t.role, t.task_slug, t.scope, t.acceptance_criteria,
            t.prompt_id, t.active, t.created_at, t.updated_at,
            p.role      AS prompt_role,
            p.slug      AS prompt_slug,
            p.version   AS prompt_version
     FROM tasks t
     LEFT JOIN prompts p ON p.id = t.prompt_id
     WHERE t.task_slug = @slug
     ORDER BY t.active DESC, t.updated_at DESC
     LIMIT 1`,
    { slug: taskSlug }
  );
}

/**
 * Resolve the dispatch payload for the inspector role: every active
 * task assigned to `inspector`, each bundled with the full prompt body
 * for its referenced template (latest version of that (role, slug)).
 *
 * This is the "wire" in "wire inspector task dispatch" — the /tasks
 * route returns this and the inspector (or any consumer) gets a single
 * JSON document containing both the task definition AND the prompt body
 * needed to execute it, so the consumer doesn't need a second round-trip
 * to resolve the template.
 */
export async function getInspectorDispatch(): Promise<{
  tasks: Array<TackleTaskRow & {
    prompt_body_md: string | null;
    prompt_title: string | null;
    prompt_parameter_schema: Record<string, any> | null;
    prompt_tags: string[] | null;
  }>;
}> {
  const tasks = await qAll(
    `SELECT id, role, task_slug, scope, acceptance_criteria,
            prompt_id, active, created_at, updated_at
     FROM tasks
     WHERE role = @role AND active = TRUE
     ORDER BY task_slug`,
    { role: "inspector" }
  );

  // Resolve each task's prompt_id to the full latest-version template.
  // We do this with one extra query per task rather than a single JOIN
  // because the task references a *specific* prompt_id (a specific
  // version), but the consumer wants the LATEST version of the same
  // (role, slug). Fetching the latest requires a DISTINCT ON window,
  // which is fiddly to express as a JOIN — the per-task round-trip is
  // small (today: exactly one inspector task) and keeps the query legible.
  const enriched = await Promise.all(
    tasks.map(async (t) => {
      const prompt = await qOne(
        `SELECT DISTINCT ON (role, slug)
                id, role, slug, version, title, body_md,
                parameter_schema, tags, created_at, updated_at
         FROM prompts
         WHERE role = (SELECT role FROM prompts WHERE id = @pid)
           AND slug = (SELECT slug FROM prompts WHERE id = @pid)
         ORDER BY role, slug, version DESC`,
        { pid: t.prompt_id }
      );
      return {
        ...t,
        prompt_role: prompt?.role ?? null,
        prompt_slug: prompt?.slug ?? null,
        prompt_version: prompt?.version ?? null,
        prompt_body_md: prompt?.body_md ?? null,
        prompt_title: prompt?.title ?? null,
        prompt_parameter_schema: prompt?.parameter_schema ?? null,
        prompt_tags: prompt?.tags ?? null,
      };
    })
  );

  return { tasks: enriched };
}

// ── Prompts (tackle.prompts) ───────────────────────────────────────

export async function listPrompts(
  role?: string
): Promise<any[]> {
  const params: Record<string, any> = {};
  let where = "";
  if (role) { params.role = role; where = "WHERE role = @role"; }
  return qAll(
    `SELECT id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at
     FROM prompts ${where} ORDER BY role, slug, version DESC`,
    params
  );
}

export async function getPromptByRoleSlug(
  role: string,
  slug: string
): Promise<any | undefined> {
  return qOne(
    `SELECT id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at
     FROM prompts WHERE role = @role AND slug = @slug
     ORDER BY version DESC LIMIT 1`,
    { role, slug }
  );
}

export async function upsertPrompt(data: {
  id?: string;
  role: string;
  slug: string;
  version?: number;
  title: string;
  body_md: string;
  parameter_schema?: Record<string, any>;
  tags?: string[];
}): Promise<any> {
  const latest = await qOne(
    "SELECT version FROM prompts WHERE role = @role AND slug = @slug ORDER BY version DESC LIMIT 1",
    { role: data.role, slug: data.slug }
  );
  const version = data.version || (latest ? latest.version + 1 : 1);

  if (data.id) {
    const rows = await qRun(
      `UPDATE prompts SET role = @role, slug = @slug, version = @version,
       title = @title, body_md = @body_md,
       parameter_schema = @ps::jsonb, tags = @tags, updated_at = NOW()
       WHERE id = @id`,
      { id: data.id, role: data.role, slug: data.slug, version,
        title: data.title, body_md: data.body_md,
        ps: JSON.stringify(data.parameter_schema || {}),
        tags: data.tags || [] }
    );
    if (rows > 0) {
      return { id: data.id, role: data.role, slug: data.slug, version };
    }
    // ID not found — fall through to insert
  }

  const result = await q(
    `INSERT INTO prompts (role, slug, version, title, body_md, parameter_schema, tags)
     VALUES (@role, @slug, @version, @title, @body_md, @ps::jsonb, @tags)
     ON CONFLICT (role, slug, version) DO UPDATE
     SET title = EXCLUDED.title, body_md = EXCLUDED.body_md,
         parameter_schema = EXCLUDED.parameter_schema, tags = EXCLUDED.tags,
         updated_at = NOW()
     RETURNING id`,
    { role: data.role, slug: data.slug, version,
      title: data.title, body_md: data.body_md,
      ps: JSON.stringify(data.parameter_schema || {}),
      tags: data.tags || [] }
  );
  return { id: result.rows[0].id, role: data.role, slug: data.slug, version };
}

// ── Tool Access (tackle.role_tool_access) ───────────────────────────

export async function listToolAccess(role?: string): Promise<any[]> {
  const params: Record<string, any> = {};
  let where = "";
  if (role) { params.role = role; where = "WHERE role = @role"; }
  return qAll(
    `SELECT id, role, mcp_id, tool_slug, created_at
     FROM role_tool_access ${where} ORDER BY role, tool_slug`,
    params
  );
}

export async function updateToolAccess(
  id: string,
  data: { allowed: boolean }
): Promise<any | undefined> {
  if (data.allowed === false) {
    await qRun("DELETE FROM role_tool_access WHERE id = @id", { id });
    return { id, deleted: true };
  }
  return qOne("SELECT id, role, mcp_id, tool_slug FROM role_tool_access WHERE id = @id", { id });
}

// ── Tasks (extend) ──────────────────────────────────────────────────

export async function upsertTackleTask(data: {
  id?: string;
  role: string;
  task_slug: string;
  scope?: string;
  acceptance_criteria?: string[];
  prompt_id: string;
  active?: boolean;
}): Promise<any> {
  return qOne(
    `INSERT INTO tasks (role, task_slug, scope, acceptance_criteria, prompt_id, active)
     VALUES (@role, @slug, @scope, @ac, @pid, @active)
     ON CONFLICT (role, task_slug) DO UPDATE
     SET scope = EXCLUDED.scope, acceptance_criteria = EXCLUDED.acceptance_criteria,
         prompt_id = EXCLUDED.prompt_id, active = EXCLUDED.active, updated_at = NOW()
     RETURNING *`,
    { role: data.role, slug: data.task_slug, scope: data.scope || '',
      ac: data.acceptance_criteria || [], pid: data.prompt_id,
      active: data.active !== false }
  );
}

/**
 * Delete a task by (role, task_slug). The tasks table only guarantees
 * task_slug uniqueness WITHIN a role (UNIQUE(role, task_slug)), so the
 * delete is scoped by role to avoid collateral damage to a same-slug
 * task belonging to another role. Because agent_scheduler references
 * tasks by task_slug (loose link, no FK — migration v12), any scheduler
 * entries pointing at the task have their task_slug cleared so scheduled
 * jobs gracefully fall back to the role's default persona only.
 */
export async function deleteTackleTask(taskSlug: string, role?: string): Promise<boolean> {
  if (role) {
    await qRun(
      "UPDATE agent_scheduler SET task_slug = NULL WHERE task_slug = @slug AND role = @role",
      { slug: taskSlug, role }
    );
  } else {
    await qRun(
      "UPDATE agent_scheduler SET task_slug = NULL WHERE task_slug = @slug",
      { slug: taskSlug }
    );
  }
  const params: Record<string, any> = { slug: taskSlug };
  let where = "task_slug = @slug";
  if (role) {
    params.role = role;
    where += " AND role = @role";
  }
  const changes = await qRun(`DELETE FROM tasks WHERE ${where}`, params);
  return changes > 0;
}

// ── Role Checkpoints ────────────────────────────────────────────────

export async function getRoleCheckpoints(): Promise<Record<string, { role: string; last_active: string }>> {
  const rows = await qAll(
    `SELECT role, MAX(as_of_dt) as last_active
     FROM role_memory GROUP BY role ORDER BY role`
  );
  const result: Record<string, any> = {};
  for (const r of rows) {
    result[r.role] = { role: r.role, last_active: r.last_active };
  }
  return result;
}

export interface AgentSchedulerRow {
  id: number;
  role: string;
  model_id: string | null;
  harness: string;
  agent_config: string;
  schedule_type: string;
  schedule_value: number;
  cron_expr: string | null;
  event_criteria: string | null;
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

// ── Scheduler coercion helpers ─────────────────────────────────────
// agent_scheduler stores `enabled` and `schedule_value` as INTEGER
// columns, but tackle-ui sends `enabled: true/false` (boolean) and
// schedule values as strings. Coerce to the DB types here so live mode
// matches mock mode instead of failing with integer-cast errors.
function toEnabledInt(v: unknown, dflt: number): number {
  if (v === undefined || v === null || v === "") return dflt;
  if (v === true || v === 1 || v === "1" || v === "true") return 1;
  if (v === false || v === 0 || v === "0" || v === "false") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

// ── Schedule value coercion ────────────────────────────────────────
// agent_scheduler.schedule_value is INTEGER seconds. The UI sends
// durations like "15m", "1h", "90" or cron strings; cron strings cannot
// be expressed as seconds so they fall back to the default (the runner
// only re-fires interval entries anyway). Durations ARE parseable, so
// "15m" stores 900 instead of silently collapsing to 3600.
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
  cron_expr?: string; event_criteria?: string | object | null;
  project_dir?: string; task_slug?: string | null;
  enabled?: number | boolean | string;
}): Promise<AgentSchedulerRow> {
  const now = new Date().toISOString();
  const row = await qOne(`
    INSERT INTO agent_scheduler (role, model_id, harness, agent_config, schedule_type, schedule_value, cron_expr, event_criteria, project_dir, task_slug, enabled, metadata, created_at, updated_at)
    VALUES (@role, @model_id, @harness, @agent_config, @schedule_type, @schedule_value, @cron_expr, @event_criteria, @project_dir, @task_slug, @enabled, '{}', @now, @now)
    RETURNING *
  `, {
    role: data.role,
    model_id: data.model_id ?? null,
    harness: data.harness ?? "opencode",
    agent_config: data.agent_config ?? "{}",
    schedule_type: data.schedule_type ?? "interval",
    schedule_value: toScheduleSeconds(data.schedule_value, 3600),
    cron_expr: data.cron_expr ?? null,
    event_criteria: data.event_criteria == null ? null
      : typeof data.event_criteria === "string" ? data.event_criteria
      : JSON.stringify(data.event_criteria),
    project_dir: data.project_dir ?? "/home/codex/dev",
    task_slug: data.task_slug ?? null,
    enabled: toEnabledInt(data.enabled, 1),
    now,
  });
  return row;
}

export async function updateSchedulerEntry(id: number, data: Partial<{
  role: string; model_id: string | null; harness: string;
  agent_config: string; schedule_type: string; schedule_value: number | string;
  cron_expr: string | null; event_criteria: string | object | null;
  project_dir: string; enabled: number | boolean | string; last_run_at: string;
  last_run_status: string; metadata: string;
}>): Promise<AgentSchedulerRow | undefined> {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = @now"];
  const params: Record<string, any> = { id, now };
  const fields = ["role", "model_id", "harness", "agent_config", "schedule_type",
    "schedule_value", "cron_expr", "event_criteria", "project_dir", "task_slug", "enabled", "last_run_at", "last_run_status", "metadata"];
  for (const f of fields) {
    if ((data as any)[f] !== undefined) {
      sets.push(`${f} = @${f}`);
      params[f] = f === "enabled"
        ? toEnabledInt((data as any)[f], 1)
        : f === "schedule_value"
        ? toScheduleSeconds((data as any)[f], 3600)
        : f === "event_criteria" && (data as any)[f] != null
        ? typeof (data as any)[f] === "string"
          ? (data as any)[f]
          : JSON.stringify((data as any)[f])
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

async function resolveSchedulerPrompt(
  entry: AgentSchedulerRow
): Promise<Pick<DueSchedulerEntry, "base_prompt_body" | "task_prompt_body" | "assembled_prompt">> {
  // Default system prompt for the role: latest `opencode-persona` template.
  const persona = await getPromptByRoleSlug(entry.role, "opencode-persona");
  const base = persona?.body_md ?? null;

  // Attached task (if any): resolve its bound template (latest version of
  // that (role, slug)) and append its body to the base persona.
  let taskBody: string | null = null;
  if (entry.task_slug) {
    const task = await getTackleTask(entry.task_slug);
    if (task?.prompt_role && task?.prompt_slug) {
      const p = await getPromptByRoleSlug(task.prompt_role, task.prompt_slug);
      taskBody = p?.body_md ?? null;
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
  // NOTE: the canonical evaluator is the Python runner
  // (python/tackle/agent_scheduler_runner.py evaluate_tick — T15). This
  // endpoint is a UI convenience mirror for the interval-based legacy
  // evaluation; cron/event entries are matched + stamped by the runner only.
  const rows = await qAll(`
    SELECT * FROM agent_scheduler
    WHERE enabled = 1
      AND schedule_type <> 'manual'
      AND (
        last_run_at IS NULL
        OR (
          schedule_type = 'interval'
          AND EXTRACT(EPOCH FROM NOW() - last_run_at) >= schedule_value
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

// ── System Logs ──────────────────────────────────────────────────

export interface SystemLogRow {
  id: string;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  source?: string;
  details?: any;
}

export async function insertLog(params: {
  level: string;
  category: string;
  message: string;
  source?: string;
  details?: any;
}): Promise<void> {
  await qRun(
    `INSERT INTO system_logs (level, category, message, source, details)
     VALUES (@level, @category, @message, @source, @details)`,
    params
  );
}

export async function queryLogs(params: {
  level?: string;
  category?: string;
  search?: string;
  since?: string;
  limit?: number;
}): Promise<{ total: number; filtered_count: number; logs: SystemLogRow[] }> {
  const conditions: string[] = [];
  const vals: Record<string, any> = {};

  if (params.level && params.level !== 'ALL') {
    const levels = params.level.toUpperCase().split(',');
    conditions.push(`level = ANY(ARRAY[${levels.map((_, i) => `@level${i}`).join(', ')}])`);
    levels.forEach((l, i) => { vals[`level${i}`] = l; });
  }
  if (params.category && params.category !== 'ALL') {
    const cats = params.category.toUpperCase().split(',');
    conditions.push(`category = ANY(ARRAY[${cats.map((_, i) => `@cat${i}`).join(', ')}])`);
    cats.forEach((c, i) => { vals[`cat${i}`] = c; });
  }
  if (params.search) {
    vals.search = `%${params.search.toLowerCase()}%`;
    conditions.push(`(LOWER(message) LIKE @search OR LOWER(category) LIKE @search OR LOWER(COALESCE(source,'')) LIKE @search)`);
  }
  if (params.since) {
    vals.since = params.since;
    conditions.push(`timestamp > @since`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitNum = Math.min(Math.max(1, params.limit || 100), 500);

  const total = await qOne(`SELECT COUNT(*)::int AS count FROM system_logs`);
  const filtered = await qOne(
    `SELECT COUNT(*)::int AS count FROM system_logs ${where}`,
    vals
  );
  const logs = await qAll(
    `SELECT * FROM system_logs ${where} ORDER BY timestamp DESC LIMIT @limit`,
    { ...vals, limit: limitNum }
  );

  return {
    total: total?.count || 0,
    filtered_count: filtered?.count || 0,
    logs,
  };
}

export async function clearLogs(): Promise<void> {
  await qRun(`DELETE FROM system_logs`);
}

// ── Projection Configs (ACP v1, plan 1280) ────────────────────────

export interface ProjectionConfig {
  id: string;
  name: string;
  description: string;
  type: string;
  source_query: string;
  template: string;
  parameter_schema: any;
  target_path: string;
  schedule: string;
  enabled: number;
  last_rendered_at: string | null;
  last_sha256: string | null;
  created_at: string;
  updated_at: string;
}

export async function listProjections(): Promise<ProjectionConfig[]> {
  return qAll(`SELECT * FROM tackle.projection_configs ORDER BY name`);
}

export async function getProjection(id: string): Promise<ProjectionConfig | undefined> {
  return qOne(`SELECT * FROM tackle.projection_configs WHERE id = @id`, { id });
}

export async function createProjection(params: {
  name: string;
  description: string;
  type: string;
  source_query: string;
  template: string;
  parameter_schema: any;
  target_path: string;
  schedule: string;
  enabled: number;
}): Promise<ProjectionConfig> {
  const row = await qOne(
    `INSERT INTO tackle.projection_configs (name, description, type, source_query, template, parameter_schema, target_path, schedule, enabled)
     VALUES (@name, @description, @type, @source_query, @template, @parameter_schema, @target_path, @schedule, @enabled)
     RETURNING *`,
    params
  );
  return row;
}

export async function updateProjection(id: string, updates: Record<string, any>): Promise<ProjectionConfig | undefined> {
  const setters: string[] = [];
  const vals: Record<string, any> = { id };
  for (const [k, v] of Object.entries(updates)) {
    setters.push(`${k} = @${k}`);
    vals[k] = v;
  }
  setters.push("updated_at = NOW()");
  return qOne(
    `UPDATE tackle.projection_configs SET ${setters.join(", ")} WHERE id = @id RETURNING *`,
    vals
  );
}

/** Get the latest opencode-persona body for a role from tackle.prompts. */
export async function getPersonaForRole(role: string): Promise<string | null> {
  const row = await qOne(
    `SELECT body_md FROM tackle.prompts
     WHERE role = @role AND slug = 'opencode-persona'
     ORDER BY version DESC LIMIT 1`,
    { role }
  );
  return row?.body_md || null;
}

/** Get procedure card summaries for a role from tackle.role_memory → tackle.memory. */
export async function getProceduresForRole(role: string): Promise<string | null> {
  const rows = await qAll(
    `SELECT m.title, m.summary, m.slug
     FROM tackle.role_memory rm
     JOIN tackle.memory m ON m.id = rm.memory_id
     WHERE rm.role = @role
       AND (rm.expiration_dt IS NULL OR rm.expiration_dt > NOW())
     ORDER BY m.slug`,
    { role }
  );
  if (!rows.length) return null;
  return rows.map((r: any) => `- **${r.title}** (\`${r.slug}\`): ${r.summary}`).join("\n");
}
