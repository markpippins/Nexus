import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export function initDb(baseDir: string): Database.Database {
  const dbPath = path.join(baseDir, 'pipeline.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');      // concurrent reads
  db.pragma('foreign_keys = ON');
  createSchema();
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');
  return db;
}

function createSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id            TEXT PRIMARY KEY,
      file_name     TEXT NOT NULL,
      title         TEXT NOT NULL DEFAULT '',
      project       TEXT NOT NULL DEFAULT '',
      goal          TEXT NOT NULL DEFAULT '',
      content       TEXT NOT NULL DEFAULT '',
      files_affected    TEXT NOT NULL DEFAULT '[]',  -- JSON array
      acceptance_criteria TEXT NOT NULL DEFAULT '[]', -- JSON array
      dependencies  TEXT NOT NULL DEFAULT '[]',       -- JSON array
      prompt_ref    TEXT NOT NULL DEFAULT '',  -- prompt number this plan was spawned from
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    -- Migration: add prompt_ref if missing (v068)
    -- SQLite doesn't support ADD COLUMN IF NOT EXISTS, so use a try/catch
    -- The application layer handles this gracefully via the default ''
    `);
  
  // Migration: add prompt_ref column if the existing DB doesn't have it
  try {
    db.exec(`ALTER TABLE plans ADD COLUMN prompt_ref TEXT NOT NULL DEFAULT ''`);
  } catch (e: any) {
    // Column already exists — ignore. Log unexpected errors.
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration prompt_ref failed:', e.message);
    }
  }

  // Migration: add deleted column for soft-delete (v069)
  try {
    db.exec(`ALTER TABLE plans ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration deleted failed:', e.message);
    }
  }

  // Migration: add cost_usd column for session cost tracking (v072)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN cost_usd REAL`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration cost_usd failed:', e.message);
    }
  }

  // Migration: add total_work_seconds for cumulative work-time tracking (v090)
  // Used by the watchdog to determine staleness based on actual execution time,
  // not wall-clock time (so rate-limit retry waits don't count against the session).
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN total_work_seconds REAL NOT NULL DEFAULT 0`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration total_work_seconds failed:', e.message);
    }
  }

  // Migration: add paused column for workflow pause/resume (v073)
  try {
    db.exec(`ALTER TABLE circuit_breaker ADD COLUMN paused INTEGER DEFAULT 0`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration paused failed:', e.message);
    }
  }

  // Migration: expand receipts CHECK constraint to include all receipt types (v070)
  // Older DBs have a narrower CHECK that rejects CRITIQUE, REVIEW, PLAN_BLOCK, etc.
  // Guard: check sqlite_master to avoid re-running on every restart.
  try {
    const existing = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='receipts'"
    ).get() as { sql: string } | undefined;
    if (existing && !existing.sql.includes("'CRITIQUE'")) {
      const fullTypes = "'PLAN_CREATE','IMPLEMENTATION','REVIEW_PASS','REVIEW_REJECT','BLOCK','PROPOSED','PLANNING','REVIEW','CRITIQUE','CRITIQUE_PASS','CRITIQUE_REJECT','PLAN_BLOCK','API_LIMIT'";
      db.exec(`
        DROP TABLE IF EXISTS receipts_new;
        CREATE TABLE receipts_new (
          id            TEXT PRIMARY KEY,
          plan_id       TEXT NOT NULL REFERENCES plans(id),
          type          TEXT NOT NULL CHECK(type IN (${fullTypes})),
          agent_role    TEXT NOT NULL,
          session_id    TEXT,
          artifact_path TEXT,
          summary       TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at    TEXT NOT NULL,
          UNIQUE(plan_id, type, session_id)
        );
        BEGIN;
        INSERT OR IGNORE INTO receipts_new SELECT * FROM receipts;
        DROP TABLE receipts;
        ALTER TABLE receipts_new RENAME TO receipts;
        CREATE INDEX IF NOT EXISTS idx_receipts_plan ON receipts(plan_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(type);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique
          ON receipts(plan_id, type, COALESCE(session_id, ''));
        COMMIT;
      `);
      console.log('Migration v070: receipts CHECK constraint expanded.');
    }
  } catch (e: any) {
    console.error('Migration v070 failed:', e.message);
  }
  
  db.exec(`

    CREATE TABLE IF NOT EXISTS receipts (
      id            TEXT PRIMARY KEY,    -- UUID
      plan_id       TEXT NOT NULL REFERENCES plans(id),
      type          TEXT NOT NULL CHECK(type IN (          'PLAN_CREATE','IMPLEMENTATION','REVIEW_PASS','REVIEW_REJECT','BLOCK',
          'PROPOSED','PLANNING',
          'REVIEW','CRITIQUE','CRITIQUE_PASS','CRITIQUE_REJECT','PLAN_BLOCK','API_LIMIT'
      )),
      agent_role    TEXT NOT NULL,       -- planner|builder|reviewer|watchdog
      session_id    TEXT,                -- builder-20260605-HHMMSS
      artifact_path TEXT,                -- relative path to proof file
      summary       TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',  -- JSON blob
      created_at    TEXT NOT NULL,
      UNIQUE(plan_id, type, session_id)  -- no duplicate receipts per session
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_plan ON receipts(plan_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(type);
    -- Partial unique index: treats NULL session_id as '' so UNIQUE properly blocks dupes
    CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique
      ON receipts(plan_id, type, COALESCE(session_id, ''));
    CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(updated_at);

    -- ── Sessions table (replaces builder-log/*.meta.txt + SESSION.md) ──

    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,     -- builder-20260606-063001
      agent_role      TEXT NOT NULL,        -- planner|builder|reviewer|watchdog
      start_iso       TEXT NOT NULL,
      end_iso         TEXT,
      exit_code       INTEGER,
      retries_used    INTEGER DEFAULT 0,
      plans_processed TEXT NOT NULL DEFAULT '[]',  -- JSON array of plan IDs
      plan_count      INTEGER DEFAULT 0,
      pid             INTEGER,              -- process ID (null when ended)
      is_running      INTEGER DEFAULT 1,    -- 0 = ended, 1 = running, 2 = paused
      last_activity   TEXT,                 -- ISO timestamp of last heartbeat
      model           TEXT,                 -- which model/agent was used
      fallback_used   INTEGER DEFAULT 0,    -- 0 = primary model, 1 = fallback
      created_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_running ON sessions(is_running);
    CREATE INDEX IF NOT EXISTS idx_sessions_role ON sessions(agent_role);

    -- ── Circuit breaker table (replaces .api-blocked flag file) ──

    CREATE TABLE IF NOT EXISTS circuit_breaker (
      id              INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),  -- single row
      tripped         INTEGER DEFAULT 0,
      tripped_at      TEXT,
      retry_after     INTEGER DEFAULT 1800,  -- seconds
      error           TEXT,
      detail          TEXT,
      source          TEXT,
      fallback_model  TEXT,
      updated_at      TEXT
    );

    -- Seed the single circuit_breaker row if it doesn't exist
    INSERT OR IGNORE INTO circuit_breaker (id, tripped, updated_at)
      VALUES (1, 0, datetime('now'));

    -- v078: ticket_id + tokens_used on receipts
    -- ALTER TABLE is safe to run multiple times; only affects if missing
    `);

  // v078: add ticket_id to receipts
  try {
    db.exec(`ALTER TABLE receipts ADD COLUMN ticket_id TEXT REFERENCES tickets(id)`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration receipts.ticket_id failed:', e.message);
    }
  }

  // v078: add tokens_used to receipts
  try {
    db.exec(`ALTER TABLE receipts ADD COLUMN tokens_used INTEGER DEFAULT 0`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration receipts.tokens_used failed:', e.message);
    }
  }

  // v079: add constraint columns to tickets
  const ticketColumns = [
    ['objective', 'TEXT'],
    ['completion_criteria', 'TEXT'],
    ['owner', "TEXT NOT NULL DEFAULT ''"],
    ['parent_ticket_id', 'TEXT REFERENCES tickets(id)'],
    ['spawn_reason', 'TEXT'],
    ['last_activity', 'TEXT'],
    ['expires_at', 'TEXT'],
    ['confidence', 'REAL'],
  ];
  for (const [col, colType] of ticketColumns) {
    try {
      db.exec(`ALTER TABLE tickets ADD COLUMN ${col} ${colType}`);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.error(`Migration tickets.${col} failed:`, e.message);
      }
    }
  }

  // v080: add closure_reason to tickets
  try {
    db.exec(`ALTER TABLE tickets ADD COLUMN closure_reason TEXT`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration tickets.closure_reason failed:', e.message);
    }
  }

  // v081: add replacement_of to tickets
  try {
    db.exec(`ALTER TABLE tickets ADD COLUMN replacement_of TEXT REFERENCES tickets(id)`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column name')) {
      console.error('Migration tickets.replacement_of failed:', e.message);
    }
  }

  // ── v083: AI configuration registry ─────────────────────────────
  // Provider → Harness → Model hierarchy, plus per-role assignment.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_providers (
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

    CREATE TABLE IF NOT EXISTS ai_harnesses (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      invocation_semantics TEXT NOT NULL DEFAULT '{}',
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_models (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      harness_id       TEXT NOT NULL REFERENCES ai_harnesses(id) ON DELETE CASCADE,
      provider_id      TEXT REFERENCES ai_providers(id),
      model_identifier TEXT NOT NULL,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_role_config (
      id            TEXT PRIMARY KEY,
      role          TEXT NOT NULL UNIQUE CHECK(role IN (
                       'planner','builder','reviewer','critic'
                     )),
      provider_id   TEXT NOT NULL REFERENCES ai_providers(id),
      harness_id    TEXT NOT NULL REFERENCES ai_harnesses(id),
      model_id      TEXT NOT NULL REFERENCES ai_models(id),
      extra_params  TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
  `);
  console.log('Migration v083: AI config tables created.');

  // ── v085: Move provider_id from ai_harnesses to ai_models ─────
  // Harnesses are execution tools (opencode CLI, codex CLI, ollama SDK)
  // — they are provider-agnostic. Models belong to specific providers.
  // Before: ai_harnesses had provider_id, models had no provider link.
  // After:  ai_models has provider_id, harnesses have no provider link.
  try {
    const harnessHasProvider = db.prepare(
      "SELECT COUNT(*) as c FROM pragma_table_info('ai_harnesses') WHERE name = 'provider_id'"
    ).get() as { c: number };
    if (harnessHasProvider?.c > 0) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN;

        -- 1. Add provider_id to ai_models
        ALTER TABLE ai_models ADD COLUMN provider_id TEXT REFERENCES ai_providers(id);

        -- 2. Backfill: inherit provider from the model's harness
        UPDATE ai_models
        SET provider_id = (
          SELECT ah.provider_id FROM ai_harnesses ah
          WHERE ah.id = ai_models.harness_id
        );

        -- 3. Recreate ai_harnesses without provider_id
        CREATE TABLE ai_harnesses_new (
          id                   TEXT PRIMARY KEY,
          name                 TEXT NOT NULL,
          invocation_semantics TEXT NOT NULL DEFAULT '{}',
          created_at           TEXT NOT NULL,
          updated_at           TEXT NOT NULL
        );
        INSERT INTO ai_harnesses_new
          (id, name, invocation_semantics, created_at, updated_at)
        SELECT id, name, invocation_semantics, created_at, updated_at
        FROM ai_harnesses;
        DROP TABLE ai_harnesses;
        ALTER TABLE ai_harnesses_new RENAME TO ai_harnesses;

        -- Create the consolidated harn-opencode (provider-agnostic)
        INSERT OR IGNORE INTO ai_harnesses (id, name, invocation_semantics, created_at, updated_at)
        SELECT 'harn-opencode', 'Opencode CLI', invocation_semantics, created_at, updated_at
        FROM ai_harnesses WHERE id = 'harn-opencode-openai' LIMIT 1;

        -- Redirect child FKs from old per-provider copies to consolidated harness
        UPDATE ai_models SET harness_id = 'harn-opencode'
        WHERE harness_id IN ('harn-opencode-openai', 'harn-opencode-anthropic');
        UPDATE ai_role_config SET harness_id = 'harn-opencode'
        WHERE harness_id IN ('harn-opencode-openai', 'harn-opencode-anthropic');

        -- Drop the old per-provider copies
        DELETE FROM ai_harnesses
        WHERE id IN ('harn-opencode-openai', 'harn-opencode-anthropic');

        COMMIT;
        PRAGMA foreign_keys = ON;
      `);

      // Verify FK integrity after the table recreation
      const violations = db.prepare('PRAGMA foreign_key_check').all();
      if (violations.length > 0) {
        console.error('Migration v085: FK violations detected:', violations);
      }

      console.log('Migration v085: provider_id moved from ai_harnesses → ai_models.');
    }
  } catch (e: any) {
    console.error('Migration v085 (ai provider restructure) failed:', e.message);
    try { db.pragma('foreign_keys = ON'); } catch {}
  }

  // ── v079: Check if CHECK constraint includes stale/expired ──────
  // CREATE TABLE IF NOT EXISTS won't update existing tables, so
  // check sqlite_master and recreate if missing the new statuses.
  try {
    const existingTicket = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'"
    ).get() as { sql: string } | undefined;
    if (existingTicket && !existingTicket.sql.includes("'stale'")) {
      db.exec(`
        BEGIN;
        ALTER TABLE tickets RENAME TO tickets_old;
        CREATE TABLE tickets (
          id                  TEXT PRIMARY KEY,
          plan_id             TEXT NOT NULL REFERENCES plans(id),
          role                TEXT NOT NULL,
          status              TEXT NOT NULL DEFAULT 'open'
                              CHECK(status IN (
                                'open','claimed','completed','failed',
                                'abandoned','superseded','cancelled',
                                'stale','expired'
                              )),
          session_id          TEXT,
          created_by_receipt  TEXT NOT NULL DEFAULT '',
          created_at          TEXT NOT NULL,
          claimed_at          TEXT,
          closed_at           TEXT,
          token_budget        INTEGER,
          tokens_used         INTEGER,
          objective           TEXT,
          completion_criteria TEXT,
          owner               TEXT NOT NULL DEFAULT '',
          parent_ticket_id    TEXT REFERENCES tickets(id),
          spawn_reason        TEXT,
          last_activity       TEXT,
          expires_at          TEXT,
          confidence          REAL,
          closure_reason      TEXT,
          replacement_of      TEXT REFERENCES tickets(id)
        );
        INSERT INTO tickets SELECT * FROM tickets_old;
        DROP TABLE tickets_old;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_open
          ON tickets(plan_id, role) WHERE status = 'open';
        COMMIT;
      `);
      console.log('Migration v079: tickets CHECK constraint expanded.');
    }
  } catch (e: any) {
    console.error('Migration v079 tickets CHECK failed:', e.message);
  }

  // ── v084: Fix receipts.ticket_id FK pointing to tickets_old instead of tickets ──
  // tickets_old is a leftover from the v079 CHECK expansion migration.
  // When v079 renamed tickets→tickets_old, the receipts FK auto-followed the
  // RENAME. The subsequent DROP TABLE tickets_old failed (FK reference), so
  // both tables coexist and the FK points to the wrong one.
  // Fix: merge orphaned rows, recreate receipts with correct FK, drop tickets_old.
  try {
    const ticketOldExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tickets_old'"
    ).get();
    if (ticketOldExists) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN;

        -- Merge any tickets_old rows not already in tickets (by PK)
        INSERT OR IGNORE INTO tickets
          (id, plan_id, role, status, session_id, created_by_receipt, created_at,
           claimed_at, closed_at)
        SELECT id, plan_id, role, status, session_id, created_by_receipt, created_at,
               claimed_at, closed_at
        FROM tickets_old;

        -- Drop views that depend on receipts (recreated by final schema block)
        DROP VIEW IF EXISTS plans_by_status;
        DROP VIEW IF EXISTS plan_status;

        -- Recreate receipts with FK pointing to tickets (not tickets_old)
        DROP TABLE IF EXISTS receipts_new;
        CREATE TABLE receipts_new (
          id            TEXT PRIMARY KEY,
          plan_id       TEXT NOT NULL REFERENCES plans(id),
          type          TEXT NOT NULL CHECK(type IN (
                          'PLAN_CREATE','IMPLEMENTATION','REVIEW_PASS','REVIEW_REJECT','BLOCK',
                          'PROPOSED','PLANNING',
                          'REVIEW','CRITIQUE','CRITIQUE_PASS','CRITIQUE_REJECT','PLAN_BLOCK','API_LIMIT'
                        )),
          agent_role    TEXT NOT NULL,
          session_id    TEXT,
          artifact_path TEXT,
          summary       TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at    TEXT NOT NULL,
          ticket_id     TEXT REFERENCES tickets(id),
          tokens_used   INTEGER DEFAULT 0,
          UNIQUE(plan_id, type, session_id)
        );

        INSERT INTO receipts_new SELECT * FROM receipts;
        DROP TABLE receipts;
        ALTER TABLE receipts_new RENAME TO receipts;

        CREATE INDEX IF NOT EXISTS idx_receipts_plan ON receipts(plan_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(type);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique
          ON receipts(plan_id, type, COALESCE(session_id, ''));

        DROP TABLE tickets_old;

        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
      console.log('Migration v084: receipts.ticket_id FK fixed from tickets_old → tickets.');
    }
  } catch (e: any) {
    console.error('Migration v084 (tickets_old FK fix) failed:', e.message);
    // Ensure foreign_keys is re-enabled even on failure
    try { db.pragma('foreign_keys = ON'); } catch {}
  }

  db.exec(`
    -- ── v078/v079: Tickets table — includes terminal + constraint columns ──
    CREATE TABLE IF NOT EXISTS tickets (
      id                  TEXT PRIMARY KEY,
      plan_id             TEXT NOT NULL REFERENCES plans(id),
      role                TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'open'
                          CHECK(status IN (
                            'open','claimed','completed','failed',
                            'abandoned','superseded','cancelled',
                            'stale','expired'
                          )),
      session_id          TEXT,
      created_by_receipt  TEXT NOT NULL DEFAULT '',
      created_at          TEXT NOT NULL,
      claimed_at          TEXT,
      closed_at           TEXT,
      token_budget        INTEGER,
      tokens_used         INTEGER,
      objective           TEXT,
      completion_criteria TEXT,
      owner               TEXT NOT NULL DEFAULT '',
      parent_ticket_id    TEXT REFERENCES tickets(id),
      spawn_reason        TEXT,
      last_activity       TEXT,
      expires_at          TEXT,
      confidence          REAL,
      closure_reason      TEXT,
      replacement_of      TEXT REFERENCES tickets(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_open
      ON tickets(plan_id, role) WHERE status = 'open';

    -- Derived status view (priority-based: REVIEW_PASS/REVIEW_REJECT resist BLOCK override)
    -- Excludes soft-deleted plans (deleted = 1)
    DROP VIEW IF EXISTS plan_status;
    CREATE VIEW plan_status AS
    SELECT 
      p.*,
      CASE
        -- REVIEW_PASS is terminal — once a plan passes review, it stays completed
        WHEN EXISTS (
          SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
        ) THEN 'REVIEW_PASS'
        -- REVIEW_REJECT can be overridden by IMPLEMENTATION (re-work) but NOT by BLOCK
        WHEN EXISTS (
          SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
        ) THEN COALESCE(
          (SELECT r.type FROM receipts r 
           WHERE r.plan_id = p.id 
           AND r.type != 'BLOCK'
           ORDER BY r.created_at DESC LIMIT 1),
          'PLAN_CREATE'
        )
        -- For all other plans, the most recent receipt wins (chronological),
        -- but skip PROPOSED/PLANNING if a later PLAN_CREATE or IMPLEMENTATION exists
        ELSE COALESCE(
          (SELECT r.type FROM receipts r 
           WHERE r.plan_id = p.id 
           AND r.type NOT IN ('PROPOSED', 'PLANNING')
           ORDER BY r.created_at DESC LIMIT 1),
          (SELECT r.type FROM receipts r 
           WHERE r.plan_id = p.id 
           ORDER BY r.created_at DESC LIMIT 1),
          NULL  -- no receipts at all → plan has no conduit state
        )
      END AS derived_status
    FROM plans p
    WHERE p.deleted = 0;

    -- Convenience view: plans grouped by derived status
    DROP VIEW IF EXISTS plans_by_status;
    CREATE VIEW plans_by_status AS
    SELECT 
      ps.derived_status AS status,
      ps.*
    FROM plan_status ps;
  `);
}

// ── Plan CRUD ──────────────────────────────────────────────────────

export interface PlanRow {
  id: string;
  file_name: string;
  title: string;
  project: string;
  goal: string;
  content: string;
  files_affected: string;
  acceptance_criteria: string;
  dependencies: string;
  prompt_ref: string;
  created_at: string;
  updated_at: string;
  derived_status: string;
  deleted: number;
}

export type UpsertPlanInput = Omit<PlanRow, 'derived_status' | 'deleted'> & { deleted?: number };

export function upsertPlan(plan: UpsertPlanInput): void {
  const stmt = db.prepare(`
    INSERT INTO plans (id, file_name, title, project, goal, content,
      files_affected, acceptance_criteria, dependencies, prompt_ref, deleted, created_at, updated_at)
    VALUES (@id, @file_name, @title, @project, @goal, @content,
      @files_affected, @acceptance_criteria, @dependencies, @prompt_ref, @deleted, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      goal = excluded.goal,
      files_affected = excluded.files_affected,
      acceptance_criteria = excluded.acceptance_criteria,
      dependencies = excluded.dependencies,
      prompt_ref = excluded.prompt_ref,
      updated_at = excluded.updated_at
      -- deleted is intentionally NOT updated here — only softDeletePlan() can flip this flag
  `);
  stmt.run({ ...plan, deleted: plan.deleted ?? 0 });
}

/** Force WAL data into the main database file. Call after writes that must survive abrupt restarts. */
export function checkpointWal(): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
}

export function getPlan(id: string): PlanRow | undefined {
  return db.prepare('SELECT * FROM plan_status WHERE id = ?').get(id) as PlanRow | undefined;
}

export function getPlansByStatus(status: string): PlanRow[] {
  return db.prepare(
    'SELECT * FROM plan_status WHERE derived_status = ?'
  ).all(status) as PlanRow[];
}

export function getAllPlans(): PlanRow[] {
  return db.prepare('SELECT * FROM plan_status').all() as PlanRow[];
}

/** Get a plan by ID from the raw plans table (bypasses plan_status view, includes deleted). */
export function getPlanById(id: string): PlanRow | undefined {
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanRow | undefined;
}

/** Soft-delete a plan: mark deleted=1 in the plans table. Plan disappears from all views. */
export function softDeletePlan(planId: string): boolean {
  const result = db.prepare('UPDATE plans SET deleted = 1, updated_at = ? WHERE id = ? AND deleted = 0')
    .run(new Date().toISOString(), planId);
  return result.changes > 0;
}

// ── Receipt CRUD ───────────────────────────────────────────────────

export interface ReceiptRow {
  id: string;
  plan_id: string;
  type: string;
  agent_role: string;
  session_id: string;
  ticket_id: string | null;
  artifact_path: string | null;
  summary: string;
  metadata_json: string;
  tokens_used: number;
  created_at: string;
}

export function insertReceipt(r: ReceiptRow): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO receipts 
      (id, plan_id, type, agent_role, session_id, ticket_id, artifact_path, summary, metadata_json, tokens_used, created_at)
    VALUES (@id, @plan_id, @type, @agent_role, @session_id, @ticket_id, @artifact_path, @summary, @metadata_json, @tokens_used, @created_at)
  `);
  stmt.run({ ...r, tokens_used: r.tokens_used ?? 0 });
}

export function getReceiptsForPlan(planId: string): ReceiptRow[] {
  return db.prepare(
    'SELECT * FROM receipts WHERE plan_id = ? ORDER BY created_at ASC'
  ).all(planId) as ReceiptRow[];
}

/** Get receipt chain as structured objects for API responses. */
export function getPlanReceipts(planId: string): Array<{
  id: string; type: string; agent_role: string;
  session_id: string; artifact_path: string | null;
  summary: string; metadata: any; created_at: string;
}> {
  const rows = getReceiptsForPlan(planId);
  return rows.map(r => ({
    id: r.id,
    type: r.type,
    agent_role: r.agent_role,
    session_id: r.session_id,
    artifact_path: r.artifact_path,
    summary: r.summary,
    metadata: (() => { try { return JSON.parse(r.metadata_json); } catch { return {}; } })(),
    created_at: r.created_at,
  }));
}

export function getLatestReceiptType(planId: string): string | null {
  const row = db.prepare(
    'SELECT type FROM receipts WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(planId) as { type: string } | undefined;
  return row?.type ?? null;
}

export function getReceiptCount(): { type: string; count: number }[] {
  return db.prepare(
    'SELECT type, COUNT(*) as count FROM receipts GROUP BY type'
  ).all() as { type: string; count: number }[];
}

/** Delete all receipts for a plan matching one or more types. Used by unblock_plan. */
export function deleteReceiptsByPlanAndType(planId: string, types: string[]): number {
  if (types.length === 0) return 0;
  const placeholders = types.map(() => '?').join(',');
  const result = db.prepare(
    `DELETE FROM receipts WHERE plan_id = ? AND type IN (${placeholders})`
  ).run(planId, ...types);
  return result.changes;
}

// ── Grouped Plan Status (v057) ─────────────────────────────────────

import { PlanCard } from './types';

export interface PlansByStatus {
  pending: PlanRow[];
  active: PlanRow[];
  completed: PlanRow[];
  blocked: PlanRow[];
  archived: PlanRow[];
  proposed: PlanRow[];
  planning: PlanRow[];
}

export function getPlansGroupedByStatus(): PlansByStatus {
  const all = db.prepare('SELECT * FROM plan_status').all() as PlanRow[];
  
  const result: PlansByStatus = {
    pending: [],
    active: [],
    completed: [],
    blocked: [],
    archived: [],
    proposed: [],
    planning: [],
  };
  
  for (const plan of all) {
    switch (plan.derived_status) {
      case 'PLAN_CREATE':
        result.pending.push(plan);
        break;
      case 'IMPLEMENTATION':
        result.active.push(plan);
        break;
      case 'REVIEW_PASS':
        result.completed.push(plan);
        break;
      case 'BLOCK':
        result.blocked.push(plan);
        break;
      case 'REVIEW_REJECT':
        // Still "active" — builder needs to re-implement
        result.active.push(plan);
        break;
      case 'PROPOSED':
        result.proposed.push(plan);
        break;
      case 'PLANNING':
        result.planning.push(plan);
        break;
      case 'REVIEW':
        // Reviewer is actively working — treat as active
        result.active.push(plan);
        break;
      case 'CRITIQUE':
        // Critic is actively working
        result.active.push(plan);
        break;
      case 'CRITIQUE_PASS':
        // Critique passed — still pending implementation
        result.pending.push(plan);
        break;
      case 'CRITIQUE_REJECT':
        // Critique rejected — back to planning
        result.planning.push(plan);
        break;
      case 'PLAN_BLOCK':
        // Planner blocked the plan
        result.blocked.push(plan);
        break;
      default:
        // Plans with no receipts (NULL derived_status) don't belong in any column.
        // Receipts are the sole authority; no receipts = no conduit state.
        break;
    }
  }
  
  return result;
}

export function planRowToPlanCard(row: PlanRow): PlanCard {
  return {
    fileName: row.file_name,
    planNumber: row.id,
    baseName: row.file_name.replace('.md', ''),
    title: row.title,
    project: row.project,
    createdAt: row.created_at,
    movedAt: undefined,
    completedAt: row.derived_status === 'REVIEW_PASS' ? row.updated_at : undefined,
    blockReason: row.derived_status === 'BLOCK' ? undefined : undefined,
    goal: row.goal || undefined,
    filesAffected: safeParseJson(row.files_affected) || [],
    acceptanceCriteria: safeParseJson(row.acceptance_criteria) || [],
    dependencies: safeParseJson(row.dependencies) || [],
    promptRef: row.prompt_ref || undefined,
  };
}

function safeParseJson(s: string): any {
  try { return JSON.parse(s); } catch { return undefined; }
}

// ── Session CRUD ────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  agent_role: string;
  start_iso: string;
  end_iso: string | null;
  exit_code: number | null;
  retries_used: number;
  plans_processed: string;
  plan_count: number;
  pid: number | null;
  is_running: number;
  last_activity: string | null;
  model: string | null;
  fallback_used: number;
  cost_usd: number | null;
  created_at: string;
}

export interface SessionStartInput {
  id: string;
  agent_role: string;
  start_iso: string;
  pid?: number;
  plans_processed?: string[];
  plan_count?: number;
  model?: string;
  fallback_used?: number;
}

export function startSession(s: SessionStartInput): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions
      (id, agent_role, start_iso, pid, plans_processed, plan_count,
       model, fallback_used, is_running, last_activity, created_at)
    VALUES (@id, @agent_role, @start_iso, @pid, @plans_processed, @plan_count,
            @model, @fallback_used, 1, @start_iso, @start_iso)
  `);
  stmt.run({
    id: s.id,
    agent_role: s.agent_role,
    start_iso: s.start_iso,
    pid: s.pid ?? null,
    plans_processed: JSON.stringify(s.plans_processed ?? []),
    plan_count: s.plan_count ?? 0,
    model: s.model ?? null,
    fallback_used: s.fallback_used ?? 0,
  });
}

export function endSession(
  id: string,
  exitCode: number,
  endIso: string,
  plansProcessed?: string[],
): void {
  const stmt = db.prepare(`
    UPDATE sessions SET
      end_iso = @end_iso,
      exit_code = @exit_code,
      is_running = 0,
      last_activity = @end_iso,
      plans_processed = COALESCE(@plans_processed, plans_processed),
      plan_count = CASE WHEN @plans_processed IS NOT NULL
                    THEN json_array_length(@plans_processed) ELSE plan_count END
    WHERE id = @id
  `);
  stmt.run({
    id,
    end_iso: endIso,
    exit_code: exitCode,
    plans_processed: plansProcessed ? JSON.stringify(plansProcessed) : null,
  });
}

export function updateSessionPid(id: string, pid: number): void {
  db.prepare('UPDATE sessions SET pid = @pid WHERE id = @id').run({ id, pid });
}

export function updateSessionActivity(id: string, activityIso: string): void {
  db.prepare(
    'UPDATE sessions SET last_activity = @activity WHERE id = @id',
  ).run({ id, activity: activityIso });
}

export function getRunningSessions(): SessionRow[] {
  return db.prepare(
    'SELECT * FROM sessions WHERE is_running != 0 ORDER BY start_iso DESC',
  ).all() as SessionRow[];
}

export function getSession(id: string): SessionRow | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    SessionRow | undefined;
}

export function getAllSessions(): SessionRow[] {
  return db.prepare(
    'SELECT * FROM sessions ORDER BY start_iso DESC',
  ).all() as SessionRow[];
}

/** Update the cost for a session (v072 — captured after session ends). */
export function updateSessionCost(id: string, costUsd: number): void {
  db.prepare('UPDATE sessions SET cost_usd = @cost WHERE id = @id').run({ id, cost: costUsd });
}

// ── Circuit breaker CRUD ────────────────────────────────────────────

export interface BreakerRow {
  id: number;
  tripped: number;
  tripped_at: string | null;
  retry_after: number;
  error: string | null;
  detail: string | null;
  source: string | null;
  fallback_model: string | null;
  paused: number;
  updated_at: string | null;
}

export function tripBreaker(input: {
  error: string;
  detail?: string;
  source?: string;
  retryAfter?: number;
  fallbackModel?: string;
}): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE circuit_breaker SET
      tripped = 1,
      tripped_at = @tripped_at,
      retry_after = @retry_after,
      error = @error,
      detail = @detail,
      source = @source,
      fallback_model = @fallback_model,
      updated_at = @updated_at
    WHERE id = 1
  `).run({
    tripped_at: now,
    retry_after: input.retryAfter ?? 1800,
    error: input.error,
    detail: input.detail ?? null,
    source: input.source ?? null,
    fallback_model: input.fallbackModel ?? null,
    updated_at: now,
  });
}

export function clearBreaker(): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE circuit_breaker SET
      tripped = 0,
      tripped_at = NULL,
      error = NULL,
      detail = NULL,
      source = NULL,
      updated_at = @updated_at
    WHERE id = 1
  `).run({ updated_at: now });
}

/** Check if the conduit orchestration is paused (v073 — workflow control, not failure mode). */
export function isConduitPaused(): boolean {
  const row = db.prepare(
    'SELECT paused FROM circuit_breaker WHERE id = 1',
  ).get() as { paused: number } | undefined;
  return row?.paused === 1;
}

/** Set conduit paused/unpaused state (v073). */
export function setConduitPaused(paused: boolean): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE circuit_breaker SET paused = @paused, updated_at = @updated_at WHERE id = 1
  `).run({ paused: paused ? 1 : 0, updated_at: now });
}

export function getBreaker(): BreakerRow {
  const row = db.prepare('SELECT * FROM circuit_breaker WHERE id = 1').get() as
    BreakerRow | undefined;
  if (!row) {
    // Should never happen — seeded in createSchema
    return {
      id: 1, tripped: 0, tripped_at: null, retry_after: 1800,
      error: null, detail: null, source: null,
      fallback_model: null, paused: 0, updated_at: null,
    };
  }
  return row;
}

export function isBreakerTripped(): boolean {
  const row = db.prepare(
    'SELECT tripped FROM circuit_breaker WHERE id = 1',
  ).get() as { tripped: number } | undefined;
  return row?.tripped === 1;
}

// ── Tickets (v078) ──────────────────────────────────────────────────

export interface TicketRow {
  id: string;
  plan_id: string;
  role: string;
  status: 'open' | 'claimed' | 'completed' | 'failed' | 'abandoned' | 'superseded' | 'cancelled' | 'stale' | 'expired';
  session_id: string | null;
  created_by_receipt: string;
  created_at: string;
  claimed_at: string | null;
  closed_at: string | null;
  token_budget: number | null;
  tokens_used: number | null;
  // v079: constraint columns
  objective: string | null;
  completion_criteria: string | null;
  owner: string;
  parent_ticket_id: string | null;
  spawn_reason: string | null;
  last_activity: string | null;
  expires_at: string | null;
  confidence: number | null;
  // v080: closure reason (supersede / cancel)
  closure_reason: string | null;
  // v081: which ticket this replaces
  replacement_of: string | null;
}

/** Invariant 5: After a Ticket reaches a terminal state, spawn the next Ticket(s).
 *  Deterministic mapping (no LLM).
 *  v079: Populates constraint columns (parent_ticket_id, spawn_reason, etc.). */
/** Guard: check if a plan is terminal and should not spawn new tickets.
 *  Checks the LATEST receipt (by created_at), not any receipt in history.
 *  A subsequent IMPLEMENTATION overrides a previous BLOCK, so the plan
 *  is only terminal if the latest receipt is terminal. */
function _isPlanTerminal(planId: string): boolean {
  const row = db.prepare(
    `SELECT type FROM receipts
     WHERE plan_id = ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(planId) as { type: string } | undefined;
  if (!row) return false;
  return ['REVIEW_PASS', 'BLOCK', 'PLAN_BLOCK'].includes(row.type);
}

export function createNextTickets(
  planId: string,
  ticketRole: string,
  terminalStatus: string,
  parentTicketId: string = '',
  objective: string = '',
  completionCriteria: string = '',
  owner: string = '',
): number {
  // ── Guard: skip if plan is already terminal ─────────────────
  if (_isPlanTerminal(planId)) {
    console.log(`Guard: plan ${planId} has terminal receipt(s) — skipping ticket creation for ${ticketRole} ${terminalStatus}.`);
    return 0;
  }

  const nextRoles: string[] = [];

  if (terminalStatus === 'completed') {
    if (ticketRole === 'builder') nextRoles.push('reviewer');
    else if (ticketRole === 'planner') nextRoles.push('builder', 'critic');
    else if (ticketRole === 'critic') nextRoles.push('builder');
  } else if (terminalStatus === 'failed') {
    if (ticketRole === 'reviewer') nextRoles.push('builder');
    else if (ticketRole === 'planner') nextRoles.push('planner');
  }

  if (nextRoles.length === 0) return 0;

  const now = new Date().toISOString();
  // 24h TTL from now
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tickets
      (id, plan_id, role, status, created_at,
       objective, completion_criteria, owner,
       parent_ticket_id, spawn_reason,
       last_activity, expires_at)
    VALUES (@id, @plan_id, @role, 'open', @created_at,
            @objective, @completion_criteria, @owner,
            @parent_ticket_id, @spawn_reason,
            @last_activity, @expires_at)
  `);
  let count = 0;
  for (const role of nextRoles) {
    const spawnReason = `${ticketRole} ${terminalStatus} → ${role}`;
    const result = stmt.run({
      id: `ticket-${planId}-${role}-${Date.now()}`,
      plan_id: planId,
      role,
      created_at: now,
      objective: objective || '',
      completion_criteria: completionCriteria || '',
      owner: owner || role,
      parent_ticket_id: parentTicketId || null,
      spawn_reason: spawnReason,
      last_activity: now,
      expires_at: expiresAt,
    });
    if (result.changes > 0) count++;
  }
  return count;
}

/** Create an open ticket for a plan+role if one doesn't already exist.
 *  Idempotent — the UNIQUE index on (plan_id, role) WHERE status='open'
 *  prevents duplicates. Returns the ticket ID or null if already exists. */
export function createTicketIfMissing(
  planId: string,
  role: string,
  createdByReceipt: string,
  createdAt: string,
  objective: string = '',
  completionCriteria: string = '',
  owner: string = '',
  parentTicketId: string | null = null,
  spawnReason: string = '',
  replacementOf: string | null = null,
): string | null {
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const ticketId = `ticket-${planId}-${role}-${createdByReceipt}`;
  const result = db.prepare(`
      INSERT OR IGNORE INTO tickets
        (id, plan_id, role, status, created_by_receipt, created_at,
         objective, completion_criteria, owner,
         parent_ticket_id, spawn_reason,
         last_activity, expires_at, replacement_of)
      VALUES (@id, @plan_id, @role, 'open', @created_by_receipt, @created_at,
              @objective, @completion_criteria, @owner,
              @parent_ticket_id, @spawn_reason,
              @last_activity, @expires_at, @replacement_of)
    `).run({
      id: ticketId,
      plan_id: planId,
      role,
      created_by_receipt: createdByReceipt,
      created_at: createdAt,
      objective: objective || '',
      completion_criteria: completionCriteria || '',
      owner: owner || role,
      parent_ticket_id: parentTicketId,
      spawn_reason: spawnReason || '',
      last_activity: createdAt,
      expires_at: expiresAt,
      replacement_of: replacementOf,
    });
    if (result.changes > 0) return ticketId;
    // Fallback: return the existing open ticket if insert was ignored (duplicate)
    const existing = db.prepare(
      'SELECT id FROM tickets WHERE plan_id = ? AND role = ? AND status = \'open\''
    ).get(planId, role) as { id: string } | undefined;
    return existing?.id ?? null;
}

/** Release all Tickets claimed by a session (v078 — called on session kill).
 *  v079: sets last_activity on release. */
export function releaseSessionTickets(sessionId: string): number {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE tickets SET
      status = 'open',
      session_id = NULL,
      claimed_at = NULL,
      last_activity = @now
    WHERE session_id = @sessionId AND status = 'claimed'
  `).run({ sessionId, now });
  return result.changes;
}

/** Reset all abandoned Tickets back to 'open' (v078 — called when breaker resets).
 *  v079: sets last_activity so reset tickets have fresh activity timestamps. */
export function resetAbandonedTickets(): number {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE tickets SET status = 'open', closed_at = NULL, last_activity = @now
    WHERE status = 'abandoned'
  `).run({ now });
  return result.changes;
}

// ── v079: Stale / expired detection (TypeScript mirror) ────────────

const DEFAULT_STALE_SECONDS = 6 * 3600;  // 6 hours
const DEFAULT_TICKET_TTL_HOURS = 24;

/** Mark claimed Tickets with no recent activity as 'stale'.
 *  Constraint 3+7: Tickets sitting idle in 'claimed' become stale,
 *  forcing reauthorization.  Returns count of tickets marked stale. */
export function detectStaleTickets(): number {
  const threshold = new Date(Date.now() - DEFAULT_STALE_SECONDS * 1000).toISOString();
  const result = db.prepare(`
    UPDATE tickets SET status = 'stale'
    WHERE status = 'claimed'
    AND last_activity IS NOT NULL
    AND last_activity < @threshold
  `).run({ threshold });
  return result.changes;
}

/** Mark open/claimed/stale Tickets past their expiration as 'expired'.
 *  Constraint 3: Expired Tickets require explicit reauthorization.
 *  Only open/claimed/stale tickets can expire — terminal states are already closed.
 *  Returns count of tickets marked expired. */
export function detectExpiredTickets(): number {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE tickets SET status = 'expired'
    WHERE status IN ('open', 'claimed', 'stale')
    AND expires_at IS NOT NULL
    AND expires_at < @now
  `).run({ now });
  return result.changes;
}

// ── v080: Supersede / cancel ticket actions ─────────────────────────

/** Supersede a ticket — mark it as superseded (terminal, closed).
 *  Only open/claimed/stale tickets can be superseded.
 *  v080: writes closure reason to dedicated closure_reason column.
 *  v081: returns old ticket data; optionally creates a replacement atomically. */
export function supersedeTicket(ticketId: string, reason: string, replace?: boolean): {
  superseded: boolean;
  oldTicket?: { plan_id: string; role: string; objective: string | null; owner: string };
  replacementId?: string;
} {
  const now = new Date().toISOString();
  // Read old ticket data before the update
  const old = db.prepare(
    'SELECT plan_id, role, objective, owner FROM tickets WHERE id = ? AND status IN (\'open\', \'claimed\', \'stale\')'
  ).get(ticketId) as { plan_id: string; role: string; objective: string | null; owner: string } | undefined;
  if (!old) return { superseded: false };

  db.prepare(`
    UPDATE tickets SET
      status = 'superseded',
      closed_at = @now,
      last_activity = @now,
      closure_reason = @reason
    WHERE id = @ticketId
    AND status IN ('open', 'claimed', 'stale')
  `).run({ ticketId, now, reason });

  // v081: Atomically create replacement if requested (same sync call, same connection)
  let replacementId: string | undefined;
  if (replace) {
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    replacementId = `ticket-${old.plan_id}-${old.role}-${Date.now()}`;
    db.prepare(`
      INSERT INTO tickets
        (id, plan_id, role, status, created_at,
         objective, owner,
         spawn_reason, last_activity, expires_at, replacement_of)
      VALUES (@id, @plan_id, @role, 'open', @created_at,
              @objective, @owner,
              @spawn_reason, @last_activity, @expires_at, @replacement_of)
    `).run({
      id: replacementId,
      plan_id: old.plan_id,
      role: old.role,
      created_at: now,
      objective: old.objective || '',
      owner: old.owner || old.role,
      spawn_reason: 'replacement after supersede',
      last_activity: now,
      expires_at: expiresAt,
      replacement_of: ticketId,
    });
  }

  return { superseded: true, oldTicket: old, replacementId };
}

/** Cancel a ticket — explicit denial of authorization (terminal).
 *  Only open/claimed/stale tickets can be cancelled.
 *  v080: writes closure reason to dedicated closure_reason column.
 *  Returns count of tickets cancelled. */
export function cancelTicket(ticketId: string, reason: string): number {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE tickets SET
      status = 'cancelled',
      closed_at = @now,
      last_activity = @now,
      closure_reason = @reason
    WHERE id = @ticketId
    AND status IN ('open', 'claimed', 'stale')
  `).run({ ticketId, now, reason });
  return result.changes;
}

/** Cancel all non-terminal tickets for a plan (open/claimed/stale).
 *  v082: Used by delete_plan to prevent orphaned open tickets on deleted plans.
 *  Returns count of tickets cancelled. */
export function cancelTicketsByPlan(planId: string, reason: string): number {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE tickets SET
      status = 'cancelled',
      closed_at = @now,
      last_activity = @now,
      closure_reason = @reason
    WHERE plan_id = @planId
    AND status IN ('open', 'claimed', 'stale')
  `).run({ planId, now, reason });
  return result.changes;
}

// ── v080: Token consumption reporting ───────────────────────────────

export function getTokenUsageByPlan(planId: string): { plan_id: string; total_tokens: number; receipts: number } {
  const row = db.prepare(`
    SELECT COALESCE(SUM(tokens_used), 0) as total_tokens, COUNT(*) as receipts
    FROM receipts WHERE plan_id = @planId
  `).get({ planId }) as { total_tokens: number; receipts: number };
  return { plan_id: planId, ...row };
}

export function getTokenUsageByRole(role: string): { role: string; total_tokens: number; receipts: number } {
  const row = db.prepare(`
    SELECT COALESCE(SUM(tokens_used), 0) as total_tokens, COUNT(*) as receipts
    FROM receipts WHERE agent_role = @role
  `).get({ role }) as { total_tokens: number; receipts: number };
  return { role, ...row };
}

/** Query token consumption from the tickets.tokens_used column (per-objective view). */
export function getTokenUsageByTicket(ticketId: string): { ticket_id: string; tokens_used: number } {
  const row = db.prepare(
    'SELECT COALESCE(tokens_used, 0) as tokens_used FROM tickets WHERE id = @ticketId'
  ).get({ ticketId }) as { tokens_used: number } | undefined;
  return { ticket_id: ticketId, tokens_used: row?.tokens_used ?? 0 };
}

// ── Orphan scan (v082) ───────────────────────────────────────────

/** Result of an orphaned-plan scan. */
export interface OrphanScanResult {
  /** Plans soft-deleted in DB (deleted=1) that still have .md files on disk. */
  deletedWithStaleFiles: Array<{ planId: string; title: string; filePath: string }>;
  /** .md files on disk that have no corresponding DB row at all. */
  filesWithNoDbRow: Array<{ planId: string; filePath: string }>;
  /** Summary counts. */
  summary: {
    deletedInDb: number;
    filesOnDisk: number;
    orphanedFiles: number;
    missingDbRows: number;
  };
}

/** Scan for orphaned plans: deleted=1 DB rows with stale files, or files with no DB row.
 *  baseDir is the nexus/.conduit-data directory containing IMPLEMENTATION_PLANS/. */
export function scanOrphanedPlans(baseDir: string): OrphanScanResult {
  const result: OrphanScanResult = {
    deletedWithStaleFiles: [],
    filesWithNoDbRow: [],
    summary: { deletedInDb: 0, filesOnDisk: 0, orphanedFiles: 0, missingDbRows: 0 },
  };

  // 1. All deleted plans from DB
  const deletedPlans = db.prepare(
    'SELECT id, title FROM plans WHERE deleted = 1'
  ).all() as { id: string; title: string }[];
  result.summary.deletedInDb = deletedPlans.length;

  // 2. All active plan IDs from DB
  const activeIds = new Set(
    (db.prepare('SELECT id FROM plans').all() as { id: string }[]).map(r => r.id)
  );

  // 3. Scan filesystem
  const deletedSet = new Map(deletedPlans.map(p => [p.id, p.title]));
  const IMPL_DIR = path.join(baseDir, 'IMPLEMENTATION_PLANS');

  for (const subdir of ['pending', 'planning', 'proposed', 'active', 'completed', 'blocked']) {
    const dirPath = path.join(IMPL_DIR, subdir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.md') || file === '.gitkeep') continue;
      const filePath = path.join(dirPath, file);

      // Extract plan number from filename (e.g., "some-plan-v0070.md" or "0070-title.md")
      const match = file.match(/v(\d+)/) || file.match(/^(\d{4})-/);
      if (!match) continue;
      const planId = match[1].padStart(4, '0');

      // Check if deleted in DB but file still exists
      if (deletedSet.has(planId)) {
        result.deletedWithStaleFiles.push({
          planId,
          title: deletedSet.get(planId)!,
          filePath,
        });
        result.summary.orphanedFiles++;
      }

      // Check if file exists but no DB row at all
      // Note: activeIds includes ALL plans (deleted=0 and deleted=1),
      // so a deleted plan's file won't trigger this branch.
      if (!activeIds.has(planId)) {
        result.filesWithNoDbRow.push({ planId, filePath });
        result.summary.missingDbRows++;
      }

      result.summary.filesOnDisk++;
    }
  }

  return result;
}

/** Return the full ticket lineage chain for a plan.
 *  Each row includes parent_ticket_id, spawn_reason, replacement_of,
 *  and closure_reason for reconstructing the audit trail. */
export function getTicketLineage(planId: string): Array<{
  id: string; role: string; status: string; tokens_used: number | null;
  parent_ticket_id: string | null; spawn_reason: string | null;
  replacement_of: string | null; closure_reason: string | null;
  created_at: string; closed_at: string | null;
}> {
  return db.prepare(`
    SELECT id, role, status, tokens_used,
           parent_ticket_id, spawn_reason,
           replacement_of, closure_reason,
           created_at, closed_at
    FROM tickets WHERE plan_id = @planId
    ORDER BY created_at ASC
  `).all({ planId }) as any[];
}

// ── v083: AI Configuration Registry ────────────────────────────────

export interface AIProviderRow {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'opencode' | 'codex' | 'spring_ai' | 'lm_server' | 'custom';
  endpoint_url: string | null;
  api_key: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface AIHarnessRow {
  id: string;
  name: string;
  invocation_semantics: string;
  created_at: string;
  updated_at: string;
}

export interface AIModelRow {
  id: string;
  name: string;
  harness_id: string;
  provider_id: string | null;
  model_identifier: string;
  created_at: string;
  updated_at: string;
}

export interface AIRoleConfigRow {
  id: string;
  role: 'planner' | 'builder' | 'reviewer' | 'critic';
  provider_id: string;
  harness_id: string;
  model_id: string;
  extra_params: string;
  created_at: string;
  updated_at: string;
}

/** Complete AI config snapshot for the API response. */
export interface AIConfigSnapshot {
  providers: AIProviderRow[];
  harnesses: AIHarnessRow[];
  models: AIModelRow[];
  roles: AIRoleConfigRow[];
}

// ── Providers ───────────────────────────────────────────────────────

export function getAIProviders(): AIProviderRow[] {
  return db.prepare('SELECT * FROM ai_providers ORDER BY name').all() as AIProviderRow[];
}

export function getAIProvider(id: string): AIProviderRow | undefined {
  return db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(id) as AIProviderRow | undefined;
}

export function upsertAIProvider(p: Omit<AIProviderRow, 'created_at' | 'updated_at'> & { created_at?: string }): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
    VALUES (@id, @name, @type, @endpoint_url, @api_key, @config_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      endpoint_url = excluded.endpoint_url,
      api_key = excluded.api_key,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `).run({
    ...p,
    endpoint_url: p.endpoint_url ?? null,
    api_key: p.api_key ?? null,
    config_json: p.config_json ?? '{}',
    created_at: p.created_at ?? now,
    updated_at: now,
  });
}

export function deleteAIProvider(id: string): boolean {
  const result = db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── Harnesses ───────────────────────────────────────────────────────

export function getAIHarnesses(): AIHarnessRow[] {
  return db.prepare('SELECT * FROM ai_harnesses ORDER BY name').all() as AIHarnessRow[];
}

export function getAIHarness(id: string): AIHarnessRow | undefined {
  return db.prepare('SELECT * FROM ai_harnesses WHERE id = ?').get(id) as AIHarnessRow | undefined;
}

export function upsertAIHarness(h: Omit<AIHarnessRow, 'created_at' | 'updated_at'> & { created_at?: string }): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_harnesses (id, name, invocation_semantics, created_at, updated_at)
    VALUES (@id, @name, @invocation_semantics, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      invocation_semantics = excluded.invocation_semantics,
      updated_at = excluded.updated_at
  `).run({
    ...h,
    invocation_semantics: h.invocation_semantics ?? '{}',
    created_at: h.created_at ?? now,
    updated_at: now,
  });
}

export function deleteAIHarness(id: string): boolean {
  const result = db.prepare('DELETE FROM ai_harnesses WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── Models ──────────────────────────────────────────────────────────

export function getAIModels(): AIModelRow[] {
  return db.prepare('SELECT * FROM ai_models ORDER BY name').all() as AIModelRow[];
}

export function getAIModel(id: string): AIModelRow | undefined {
  return db.prepare('SELECT * FROM ai_models WHERE id = ?').get(id) as AIModelRow | undefined;
}

export function upsertAIModel(m: Omit<AIModelRow, 'created_at' | 'updated_at'> & { created_at?: string }): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
    VALUES (@id, @name, @harness_id, @provider_id, @model_identifier, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      harness_id = excluded.harness_id,
      provider_id = excluded.provider_id,
      model_identifier = excluded.model_identifier,
      updated_at = excluded.updated_at
  `).run({
    ...m,
    provider_id: m.provider_id ?? null,
    created_at: m.created_at ?? now,
    updated_at: now,
  });
}

export function deleteAIModel(id: string): boolean {
  const result = db.prepare('DELETE FROM ai_models WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── Role Config ─────────────────────────────────────────────────────

export function getAIRoleConfigs(): AIRoleConfigRow[] {
  return db.prepare('SELECT * FROM ai_role_config ORDER BY role').all() as AIRoleConfigRow[];
}

export function getAIRoleConfig(role: string): AIRoleConfigRow | undefined {
  return db.prepare('SELECT * FROM ai_role_config WHERE role = ?').get(role) as AIRoleConfigRow | undefined;
}

export function upsertAIRoleConfig(rc: Omit<AIRoleConfigRow, 'created_at' | 'updated_at'> & { created_at?: string }): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_role_config (id, role, provider_id, harness_id, model_id, extra_params, created_at, updated_at)
    VALUES (@id, @role, @provider_id, @harness_id, @model_id, @extra_params, @created_at, @updated_at)
    ON CONFLICT(role) DO UPDATE SET
      id = excluded.id,
      provider_id = excluded.provider_id,
      harness_id = excluded.harness_id,
      model_id = excluded.model_id,
      extra_params = excluded.extra_params,
      updated_at = excluded.updated_at
  `).run({
    ...rc,
    extra_params: rc.extra_params ?? '{}',
    created_at: rc.created_at ?? now,
    updated_at: now,
  });
}

/** Full snapshot: all providers, harnesses, models, and role configs in one call. */
export function getAIConfigSnapshot(): AIConfigSnapshot {
  return {
    providers: getAIProviders(),
    harnesses: getAIHarnesses(),
    models: getAIModels(),
    roles: getAIRoleConfigs(),
  };
}

// ── v083: Seed default AI config ───────────────────────────────────

const DEFAULT_PROVIDERS = [
  { name: 'OpenAI', type: 'openai', endpoint_url: 'https://api.openai.com/v1' },
  { name: 'Anthropic', type: 'anthropic', endpoint_url: 'https://api.anthropic.com/v1' },
  { name: 'Ollama', type: 'ollama', endpoint_url: 'http://localhost:11434' },
  { name: 'OpenCode', type: 'opencode', endpoint_url: 'http://localhost:3100' },
  { name: 'Codex', type: 'codex', endpoint_url: '' },
];

const DEFAULT_MODELS: Array<{
  id: string; name: string; harnessId: string; providerId: string; modelId: string;
}> = [
  { id: 'mod-gpt4o', name: 'GPT-4o', harnessId: 'harn-opencode', providerId: 'prov-openai', modelId: 'gpt-4o' },
  { id: 'mod-claude-sonnet', name: 'Claude Sonnet 4', harnessId: 'harn-opencode', providerId: 'prov-anthropic', modelId: 'claude-sonnet-4-20250514' },
  { id: 'mod-llama3', name: 'Llama 3 (local)', harnessId: 'harn-ollama-sdk', providerId: 'prov-ollama', modelId: 'llama3' },
  { id: 'mod-big-pickle', name: 'Big Pickle', harnessId: 'harn-opencode', providerId: 'prov-opencode', modelId: 'big-pickle' },
  { id: 'mod-codex-gpt4o', name: 'GPT-4o (via Codex)', harnessId: 'harn-codex-cli', providerId: 'prov-codex', modelId: 'gpt-4o' },
];

const ALL_ROLES = ['planner', 'builder', 'reviewer', 'critic'] as const;

/**
 * Seed the AI config tables with reasonable defaults.
 * Only inserts rows IF the tables are currently empty (first-time setup).
 * Returns a summary of what was seeded.
 */
/** Seed the AI config tables with reasonable defaults.
 *  Only inserts rows IF the tables are currently empty (first-time setup).
 *  force=true overwrites existing rows with defaults (INSERT OR REPLACE). */
export function seedDefaultAIConfig(force?: boolean): {
  seeded: boolean;
  providers: number;
  harnesses: number;
  models: number;
  roles: number;
  message: string;
} {
  // Check if already seeded (skip when force=true)
  if (!force) {
    const existingProviders = db.prepare('SELECT COUNT(*) as c FROM ai_providers').get() as { c: number };
    if (existingProviders.c > 0) {
      return { seeded: false, providers: 0, harnesses: 0, models: 0, roles: 0, message: 'Config already exists — not overwriting.' };
    }
  }

  // Force re-seed uses INSERT OR REPLACE which triggers FK cascades
  // (ai_models.harness_id has ON DELETE CASCADE). Disable FK checks
  // during the seed to avoid destructive cascades. Re-enable in finally.
  if (force) {
    db.pragma('foreign_keys = OFF');
  }

  let pCount = 0, hCount = 0, mCount = 0, rCount = 0;
  const now = new Date().toISOString();
  try {

  // 1. Seed providers
  const provSql = force
    ? `INSERT OR REPLACE INTO ai_providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
       VALUES (@id, @name, @type, @endpoint_url, '', '{}', @now, @now)`
    : `INSERT OR IGNORE INTO ai_providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
       VALUES (@id, @name, @type, @endpoint_url, '', '{}', @now, @now)`;
  const provStmt = db.prepare(provSql);
  for (const p of DEFAULT_PROVIDERS) {
    const id = `prov-${p.type}`;
    const result = provStmt.run({ id, name: p.name, type: p.type, endpoint_url: p.endpoint_url, now });
    if (result.changes > 0) pCount++;
  }

  // 2. Seed harnesses (provider-agnostic execution tools)
  const harnSql = force
    ? `INSERT OR REPLACE INTO ai_harnesses (id, name, invocation_semantics, created_at, updated_at)
       VALUES (@id, @name, @invocation_semantics, @now, @now)`
    : `INSERT OR IGNORE INTO ai_harnesses (id, name, invocation_semantics, created_at, updated_at)
       VALUES (@id, @name, @invocation_semantics, @now, @now)`;
  const harnStmt = db.prepare(harnSql);
  const opencodeSemantics = JSON.stringify({
    binary: 'opencode',
    capabilities: {
      model: true,
      agent: true,
      working_directory: true,
      system_prompt: false,
    },
    execution: { mode: 'interactive', subcommand: 'run' },
    semantics: {
      model: { type: 'flag', flag: '--model' },
      agent: { type: 'flag', flag: '--agent' },
      working_directory: { type: 'flag', flag: '--dir' },
    },
    role_mapping: { strategy: 'agent' },
  });
  let result = harnStmt.run({ id: 'harn-opencode', name: 'Opencode CLI', invocation_semantics: opencodeSemantics, now });
  if (result.changes > 0) hCount++;

  // Ollama harness
  const ollamaSemantics = JSON.stringify({
    binary: 'ollama',
    capabilities: {
      model: true,
      agent: false,
      working_directory: false,
      system_prompt: true,
    },
    execution: { mode: 'daemon' },
    semantics: {
      model: { type: 'positional_after_subcommand', subcommand: 'run' },
      system_prompt: { type: 'flag', flag: '--system' },
    },
    role_mapping: { strategy: 'none' },
  });
  result = harnStmt.run({ id: 'harn-ollama-sdk', name: 'Ollama SDK', invocation_semantics: ollamaSemantics, now });
  if (result.changes > 0) hCount++;

  // Codex harness
  const codexSemantics = JSON.stringify({
    binary: 'codex',
    capabilities: {
      model: false,
      agent: false,
      working_directory: true,
      system_prompt: true,
    },
    execution: { mode: 'oneshot', subcommand: 'exec' },
    semantics: {
      working_directory: { type: 'flag', flag: '--cd' },
    },
    role_mapping: { strategy: 'prompt_file' },
  });
  result = harnStmt.run({ id: 'harn-codex-cli', name: 'Codex CLI', invocation_semantics: codexSemantics, now });
  if (result.changes > 0) hCount++;

  // 3. Seed models (with provider_id linking to their provider)
  const modSql = force
    ? `INSERT OR REPLACE INTO ai_models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
       VALUES (@id, @name, @harness_id, @provider_id, @model_identifier, @now, @now)`
    : `INSERT OR IGNORE INTO ai_models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
       VALUES (@id, @name, @harness_id, @provider_id, @model_identifier, @now, @now)`;
  const modStmt = db.prepare(modSql);
  for (const md of DEFAULT_MODELS) {
    const result = modStmt.run({
      id: md.id, name: md.name,
      harness_id: md.harnessId, provider_id: md.providerId,
      model_identifier: md.modelId, now,
    });
    if (result.changes > 0) mCount++;
  }

  // 4. Seed role configs (default: GPT-4o via OpenCode harness → OpenAI)
  const roleSql = force
    ? `INSERT OR REPLACE INTO ai_role_config (id, role, provider_id, harness_id, model_id, extra_params, created_at, updated_at)
       VALUES (@id, @role, @provider_id, @harness_id, @model_id, '{}', @now, @now)`
    : `INSERT OR IGNORE INTO ai_role_config (id, role, provider_id, harness_id, model_id, extra_params, created_at, updated_at)
       VALUES (@id, @role, @provider_id, @harness_id, @model_id, '{}', @now, @now)`;
  const roleStmt = db.prepare(roleSql);
  for (const role of ALL_ROLES) {
    const result = roleStmt.run({
      id: `rc-${role}`,
      role,
      provider_id: 'prov-openai',
      harness_id: 'harn-opencode',
      model_id: 'mod-gpt4o',
      now,
    });
    if (result.changes > 0) rCount++;
  }

  console.log(`[seed-defaults] ${force ? 'Force re-' : 'S'}eeded ${pCount} providers, ${hCount} harnesses, ${mCount} models, ${rCount} role configs.`);
  return {
    seeded: true,
    providers: pCount,
    harnesses: hCount,
    models: mCount,
    roles: rCount,
    message: `${force ? 'Force re-s' : 'S'}eeded ${pCount} providers, ${hCount} harnesses, ${mCount} models, ${rCount} role configs.`,
  };
  } finally {
    // Ensure FK checks are re-enabled even if seeding fails mid-way
    if (force) {
      db.pragma('foreign_keys = ON');
    }
  }
}
