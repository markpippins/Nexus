-- conduit schema — extracted from nexus/typescript/conduit-mcp/src/db.ts createSchema()
-- Applied by setup_test_db.py.  The MCP server runs "SET search_path TO conduit"
-- before createSchema(), so we replicate that preamble here.

CREATE SCHEMA IF NOT EXISTS conduit;
SET search_path TO conduit;

-- AI config tables are now in the vector schema with renamed tables
CREATE SCHEMA IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS plans (
    id            TEXT PRIMARY KEY,
    file_name     TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    project       TEXT NOT NULL DEFAULT '',
    goal          TEXT NOT NULL DEFAULT '',
    content       TEXT NOT NULL DEFAULT '',
    files_affected    TEXT NOT NULL DEFAULT '[]',
    acceptance_criteria TEXT NOT NULL DEFAULT '[]',
    dependencies  TEXT NOT NULL DEFAULT '[]',
    prompt_ref    TEXT NOT NULL DEFAULT '',
    deleted       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(updated_at);

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
    cost_budget_usd     REAL,
    cost_used_usd       REAL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS receipts (
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
    tokens_used   INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique
    ON receipts(plan_id, type, COALESCE(session_id, ''));

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    agent_role      TEXT NOT NULL,
    start_iso       TEXT NOT NULL,
    end_iso         TEXT,
    exit_code       INTEGER,
    retries_used    INTEGER DEFAULT 0,
    plans_processed TEXT NOT NULL DEFAULT '[]',
    plan_count      INTEGER DEFAULT 0,
    pid             INTEGER,
    is_running      INTEGER DEFAULT 1,
    last_activity   TEXT,
    last_heartbeat_at TEXT,
    model           TEXT,
    fallback_used   INTEGER DEFAULT 0,
    cost_usd        REAL,
    total_work_seconds REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS circuit_breaker (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
    tripped         INTEGER DEFAULT 0,
    tripped_at      TEXT,
    retry_after     INTEGER DEFAULT 1800,
    error           TEXT,
    detail          TEXT,
    source          TEXT,
    fallback_model  TEXT,
    paused          INTEGER DEFAULT 0,
    updated_at      TEXT
);
INSERT INTO circuit_breaker (id, tripped) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Token cost tracking tables (plan 1018)

CREATE TABLE IF NOT EXISTS model_pricing (
    model_name              TEXT PRIMARY KEY,
    provider                TEXT NOT NULL,
    input_price_per_token   DOUBLE PRECISION NOT NULL,
    output_price_per_token  DOUBLE PRECISION NOT NULL,
    cache_hit_price         DOUBLE PRECISION,
    updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_budgets (
    agent_role      TEXT PRIMARY KEY,
    ceiling_usd     DOUBLE PRECISION,
    ceiling_tokens  INTEGER,
    current_usd     DOUBLE PRECISION NOT NULL DEFAULT 0,
    current_tokens  INTEGER NOT NULL DEFAULT 0,
    reset_period    TEXT NOT NULL DEFAULT 'monthly'
                    CHECK(reset_period IN ('daily','weekly','monthly')),
    reset_at        TEXT,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_logs (
    id                BIGSERIAL PRIMARY KEY,
    session_id        TEXT NOT NULL,
    ticket_id         TEXT,
    model             TEXT NOT NULL,
    input_tokens      INTEGER NOT NULL DEFAULT 0,
    output_tokens     INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd DOUBLE PRECISION,
    actual_cost_usd   DOUBLE PRECISION,
    recorded_at       TEXT NOT NULL,
    tags              TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_cost_logs_session ON cost_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_logs_ticket  ON cost_logs(ticket_id);

-- AI config tables (moved to vector schema, renamed without ai_ prefix)
SET search_path TO vector;

CREATE TABLE IF NOT EXISTS providers (
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

CREATE TABLE IF NOT EXISTS harnesses (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    invocation_semantics TEXT NOT NULL DEFAULT '{}',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    harness_id       TEXT NOT NULL REFERENCES vector.harnesses(id) ON DELETE CASCADE,
    provider_id      TEXT REFERENCES providers(id),
    model_identifier TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_config (
    id            TEXT PRIMARY KEY,
    role          TEXT NOT NULL UNIQUE CHECK(role IN (
                     'planner','builder','reviewer','critic'
                   )),
    provider_id   TEXT NOT NULL REFERENCES providers(id),
    harness_id    TEXT NOT NULL REFERENCES harnesses(id),
    model_id      TEXT NOT NULL REFERENCES models(id),
    extra_params  TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_models (
    id          TEXT PRIMARY KEY,
    role        TEXT NOT NULL REFERENCES role_config(role) ON DELETE CASCADE,
    model_id    TEXT NOT NULL REFERENCES models(id),
    priority    INTEGER NOT NULL DEFAULT 0,
    provider_id TEXT REFERENCES providers(id),
    harness_id  TEXT REFERENCES harnesses(id),
    UNIQUE(role, model_id)
);

SET search_path TO conduit;

-- plan_status view (derived status from receipt chain)
CREATE OR REPLACE VIEW plan_status AS
SELECT 
    p.*,
    CASE
        -- REVIEW_PASS — terminal success, unless overridden by later BLOCK/PLAN_BLOCK/CANCELLED/ABANDONED
        WHEN EXISTS (
            SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
            AND NOT EXISTS (
                SELECT 1 FROM receipts r2
                WHERE r2.plan_id = p.id
                AND r2.type IN ('BLOCK', 'PLAN_BLOCK', 'CANCELLED', 'ABANDONED')
            )
        ) THEN 'REVIEW_PASS'
        WHEN EXISTS (
            SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
        ) THEN COALESCE(
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id 
             AND r.type != 'BLOCK'
             ORDER BY r.created_at DESC LIMIT 1),
            'PLAN_CREATE'
        )
        ELSE COALESCE(
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id 
             AND r.type NOT IN ('PROPOSED', 'PLANNING')
             ORDER BY r.created_at DESC LIMIT 1),
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id 
             ORDER BY r.created_at DESC LIMIT 1),
            NULL
        )
    END AS derived_status
FROM plans p
WHERE p.deleted = 0;

-- ===================================================================
-- WRP Kernel persistence tables (plan 1023)
-- Design: kernel-projection-answers.md
-- Schema: immutable event + snapshot + lineage store
-- ===================================================================

-- KernelDelta log: source of truth for all state changes
CREATE TABLE IF NOT EXISTS kernel_delta_log (
    delta_id    TEXT PRIMARY KEY,
    batch_id    TEXT NOT NULL,
    payload     JSONB NOT NULL,
    version     INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(version >= 0)
);
CREATE INDEX IF NOT EXISTS idx_kernel_delta_version 
    ON kernel_delta_log(version);
CREATE INDEX IF NOT EXISTS idx_kernel_delta_batch 
    ON kernel_delta_log(batch_id);

-- KernelSnapshot: check-pointed state for fast reconstruction
CREATE TABLE IF NOT EXISTS kernel_snapshot (
    version             INTEGER PRIMARY KEY,
    state               JSONB NOT NULL,
    identity_hash       TEXT,
    graph_hash          TEXT,
    lineage_cursor      INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(version >= 0)
);

-- Lineage log: causal event trace
CREATE TABLE IF NOT EXISTS lineage_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version     INTEGER NOT NULL,
    delta_id    TEXT NOT NULL REFERENCES kernel_delta_log(delta_id),
    step        TEXT NOT NULL,
    event_type  TEXT NOT NULL DEFAULT 'apply',
    affected_plans TEXT NOT NULL DEFAULT '[]',
    detail      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lineage_version 
    ON lineage_log(version);
CREATE INDEX IF NOT EXISTS idx_lineage_delta 
    ON lineage_log(delta_id);
