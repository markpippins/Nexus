import { Pool, PoolClient } from "pg";

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

// ── Schema (tackle tables only) ─────────────────────────────────────

async function createSchema(
  exec: (sql: string, params?: any[]) => Promise<any>
): Promise<void> {
  await exec(`CREATE SCHEMA IF NOT EXISTS ${TACKLE_SCHEMA}`);

  await exec(`
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
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.harnesses (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      invocation_semantics TEXT NOT NULL DEFAULT '{}',
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.models (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      harness_id       TEXT NOT NULL REFERENCES ${TACKLE_SCHEMA}.harnesses(id) ON DELETE CASCADE,
      provider_id      TEXT REFERENCES ${TACKLE_SCHEMA}.providers(id),
      model_identifier TEXT NOT NULL,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.role_config (
      id            TEXT PRIMARY KEY,
      role          TEXT NOT NULL UNIQUE CHECK(role IN (
                       'planner','builder','reviewer','critic',
                       'analyst','architect','inspector','engineer',
                       'rover'
                     )),
      provider_id   TEXT NOT NULL REFERENCES ${TACKLE_SCHEMA}.providers(id),
      harness_id    TEXT NOT NULL REFERENCES ${TACKLE_SCHEMA}.harnesses(id),
      model_id      TEXT NOT NULL REFERENCES ${TACKLE_SCHEMA}.models(id),
      extra_params  TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
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
                        CHECK(invocation_mode IN ('CLI', 'HTTP', 'SDK', 'MCP')),
      command         TEXT,
      endpoint_url    TEXT,
      timeout_ms      INTEGER,
      valid_from      TEXT,
      valid_to        TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      metadata        TEXT NOT NULL DEFAULT '{}',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      UNIQUE(role, model_id)
    );
  `);

  // ── Sessions (for test invoke flow) ──────────────────────────────
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.sessions (
      id          TEXT PRIMARY KEY,
      agent_role  TEXT NOT NULL DEFAULT 'test',
      start_iso   TEXT NOT NULL,
      end_iso     TEXT,
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
      created_at TEXT NOT NULL
    );
  `);

  // ── Circuit breaker (for failure recovery config) ───────────────
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TACKLE_SCHEMA}.circuit_breaker (
      id                       INTEGER PRIMARY KEY,
      tripped                  INTEGER NOT NULL DEFAULT 0,
      tripped_at               TEXT,
      error                    TEXT,
      detail                   TEXT,
      source                   TEXT,
      retry_after              INTEGER DEFAULT 1800,
      paused                   INTEGER NOT NULL DEFAULT 0,
      wake_requested_at        TEXT,
      max_retries_per_model    INTEGER NOT NULL DEFAULT 3,
      retry_delay_seconds      INTEGER NOT NULL DEFAULT 120,
      max_fallbacks            INTEGER NOT NULL DEFAULT 3,
      push_back_to_pending     INTEGER NOT NULL DEFAULT 1,
      updated_at               TEXT
    );
  `);

  // Seed default circuit breaker row
  await exec(`
    INSERT INTO ${TACKLE_SCHEMA}.circuit_breaker (id, tripped, updated_at)
    VALUES (1, 0, $1)
    ON CONFLICT (id) DO NOTHING
  `, [new Date().toISOString()]);

  console.log(`Tackle schema initialized in PG schema ${TACKLE_SCHEMA}.`);
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
  invocation_mode: "CLI" | "HTTP" | "SDK" | "MCP";
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

// ── Role Configs ─────────────────────────────────────────────────

export async function getAIRoleConfigs(): Promise<AIRoleConfigRow[]> {
  return qAll("SELECT * FROM role_config ORDER BY role");
}

export async function getAIRoleConfig(role: string): Promise<AIRoleConfigRow | undefined> {
  return qOne("SELECT * FROM role_config WHERE role = @role", { role });
}

export async function upsertAIRoleConfig(
  rc: Partial<AIRoleConfigRow> & { id: string; role: string; provider_id: string; harness_id: string; model_id: string },
): Promise<void> {
  const now = new Date().toISOString();
  await qRun(
    `INSERT INTO role_config (id, role, provider_id, harness_id, model_id, extra_params, created_at, updated_at)
     VALUES (@id, @role, @provider_id, @harness_id, @model_id, @extra_params, @created_at, @updated_at)
     ON CONFLICT(role) DO UPDATE SET
       id = EXCLUDED.id, provider_id = EXCLUDED.provider_id,
       harness_id = EXCLUDED.harness_id, model_id = EXCLUDED.model_id,
       extra_params = EXCLUDED.extra_params, updated_at = EXCLUDED.updated_at`,
    { ...rc, extra_params: rc.extra_params ?? "{}",
      created_at: rc.created_at ?? now, updated_at: now }
  );
}

export async function deleteAIRoleConfig(role: string): Promise<boolean> {
  const changes = await qRun("DELETE FROM role_config WHERE role = @role", { role });
  return changes > 0;
}

// ── Config Bundles (replaces role_models) ────────────────────────

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
    name?: string; invocation_mode?: "CLI" | "HTTP" | "SDK" | "MCP";
    command?: string | null; endpoint_url?: string | null; timeout_ms?: number | null;
  }[],
): Promise<void> {
  if (bundles.length === 0) return;
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    await tRun(client, "DELETE FROM config_bundle WHERE role = @role", { role });
    for (const b of bundles) {
      await tRun(client,
        `INSERT INTO config_bundle
           (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode,
            command, endpoint_url, timeout_ms, is_active, metadata, created_at, updated_at)
         VALUES
           (@id, @name, @role, @model_id, @provider_id, @harness_id, @priority, @invocation_mode,
            @command, @endpoint_url, @timeout_ms, 1, '{}', @now, @now)`,
        {
          id: `cb-${role}-${b.model_id}`,
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
  data: AIConfigSnapshot,
): Promise<{ providers: number; harnesses: number; models: number; roles: number; bundles: number }> {
  let pCount = 0, hCount = 0, mCount = 0, rCount = 0, bCount = 0;
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    await tRun(client, "DELETE FROM config_bundle");
    await tRun(client, "DELETE FROM role_config");
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

    for (const r of data.roles || []) {
      await tRun(client,
        `INSERT INTO role_config (id, role, provider_id, harness_id, model_id, extra_params, created_at, updated_at)
         VALUES (@id, @role, @provider_id, @harness_id, @model_id, @extra_params, @created_at, @updated_at)`,
        { id: r.id, role: r.role, provider_id: r.provider_id, harness_id: r.harness_id,
          model_id: r.model_id, extra_params: r.extra_params ?? "{}",
          created_at: r.created_at || now, updated_at: now }
      );
      rCount++;
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

  console.log(`[import-ai-config] Imported ${pCount} providers, ${hCount} harnesses, ${mCount} models, ${rCount} roles, ${bCount} bundles.`);
  return { providers: pCount, harnesses: hCount, models: mCount, roles: rCount, bundles: bCount };
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
    `SELECT rc.role,
            m.model_identifier,
            p.type AS provider_type,
            p.api_key,
            p.endpoint_url,
            h.name AS harness_name,
            h.invocation_semantics
     FROM role_config rc
     JOIN models m     ON rc.model_id     = m.id
     JOIN providers p  ON rc.provider_id  = p.id
     JOIN harnesses h  ON rc.harness_id   = h.id
     WHERE rc.role = @role`,
    { role }
  );
  if (!row) return null;

  const fallbacks = await getResolvedFallbackModels(role);

  return {
    role: row.role,
    model_identifier: row.model_identifier,
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
        `INSERT INTO role_config (id, role, provider_id, harness_id, model_id, extra_params, created_at, updated_at)
         VALUES (@id, @role, @provider_id, @harness_id, @model_id, '{}', @now, @now)
         ON CONFLICT (role) DO NOTHING`,
        { id: `rc-${role}`, role, provider_id: "prov-openai", harness_id: "harn-opencode", model_id: "mod-gpt4o", now }
      );
      if (changes > 0) rCount++;

      await tRun(client,
        `INSERT INTO config_bundle
           (id, name, role, model_id, priority, provider_id, harness_id, invocation_mode, is_active, metadata, created_at, updated_at)
         VALUES
           (@id, @name, @role, @model_id, @priority, @provider_id, @harness_id, 'CLI', 1, '{}', @now, @now)
         ON CONFLICT (id) DO NOTHING`,
        { id: `cb-${role}-mod-gpt4o`, name: `Default: GPT-4o for ${role}`, role, model_id: "mod-gpt4o", priority: 0,
          provider_id: "prov-openai", harness_id: "harn-opencode", now }
      );
    }
  });

  return {
    seeded: true, providers: pCount, harnesses: hCount, models: mCount, roles: rCount,
    message: `${force ? "Force re-s" : "S"}eeded ${pCount} providers, ${hCount} harnesses, ${mCount} models, ${rCount} role configs.`,
  };
}
