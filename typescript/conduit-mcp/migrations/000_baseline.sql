-- ═══════════════════════════════════════════════════════════════════════
--  Migration 000 — Schema Baseline
--
--  Captures the full createSchema() DDL from db.ts at the time of formal
--  migration introduction. Every table, index, view, trigger, and function
--  that existed before migration 015 is defined here.
--
--  This migration is idempotent: every CREATE uses IF NOT EXISTS, and
--  every view/function uses CREATE OR REPLACE. Running this on an existing
--  database will be a no-op.
--
--  Schema references (resolved from db.ts constants):
--    PG_SCHEMA    = conduit
--    VISION_SCHEMA = vision
--    PEB_SCHEMA   = peb
--    TACKLE_SCHEMA = tackle
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 000_baseline.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. SCHEMAS
-- ═══════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS conduit;
CREATE SCHEMA IF NOT EXISTS vision;
CREATE SCHEMA IF NOT EXISTS peb;
CREATE SCHEMA IF NOT EXISTS tackle;

-- ═══════════════════════════════════════════════════════════════════════
--  2. conduit.plans
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.plans (
    id                 TEXT PRIMARY KEY,
    file_name          TEXT NOT NULL,
    title              TEXT NOT NULL DEFAULT '',
    project            TEXT NOT NULL DEFAULT '',
    goal               TEXT NOT NULL DEFAULT '',
    content            TEXT NOT NULL DEFAULT '',
    files_affected     TEXT NOT NULL DEFAULT '[]',
    acceptance_criteria TEXT NOT NULL DEFAULT '[]',
    dependencies       TEXT NOT NULL DEFAULT '[]',
    prompt_ref         TEXT NOT NULL DEFAULT '',
    notes              TEXT NOT NULL DEFAULT '',
    priority           INTEGER NOT NULL DEFAULT 0,
    deleted            INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_status ON conduit.plans(updated_at);

-- ═══════════════════════════════════════════════════════════════════════
--  3. conduit.schema_version
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.schema_version (
    version     INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at  TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════
--  4. vision.tickets
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vision.tickets (
    id                  TEXT PRIMARY KEY,
    plan_id             TEXT NOT NULL,
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
    parent_ticket_id    TEXT REFERENCES vision.tickets(id),
    spawn_reason        TEXT,
    last_activity       TEXT,
    expires_at          TEXT,
    deadline            TEXT,
    confidence          REAL,
    closure_reason      TEXT,
    replacement_of      TEXT REFERENCES vision.tickets(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vision_tickets_open
    ON vision.tickets(plan_id, role) WHERE status = 'open';

-- ═══════════════════════════════════════════════════════════════════════
--  5. vision.receipts
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vision.receipts (
    id            TEXT PRIMARY KEY,
    plan_id       TEXT NOT NULL,
    type          TEXT NOT NULL CHECK(type IN (
                    'PLAN_CREATE','IMPLEMENTATION','REVIEW_PASS','REVIEW_REJECT','BLOCK',
                    'PLANNING','HOLD',
                    'REVIEW','CRITIQUE','CRITIQUE_PASS','CRITIQUE_REJECT','PLAN_BLOCK','API_LIMIT',
                    'REQUEUED',
                    'CANCELLED','ABANDONED'
                  )),
    agent_role    TEXT NOT NULL,
    session_id    TEXT,
    artifact_path TEXT,
    summary       TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    ticket_id     TEXT REFERENCES vision.tickets(id),
    tokens_used   INTEGER DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════════════════
--  6. conduit.sessions
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.sessions (
    id                  TEXT PRIMARY KEY,
    agent_role          TEXT NOT NULL,
    start_iso           TEXT NOT NULL,
    end_iso             TEXT,
    exit_code           INTEGER,
    retries_used        INTEGER DEFAULT 0,
    plans_processed     TEXT NOT NULL DEFAULT '[]',
    plan_count          INTEGER DEFAULT 0,
    pid                 INTEGER,
    is_running          INTEGER DEFAULT 1,
    last_activity       TEXT,
    model               TEXT,
    fallback_used       INTEGER DEFAULT 0,
    cost_usd            REAL,
    total_work_seconds  REAL NOT NULL DEFAULT 0,
    workflow_id         TEXT,
    run_id              TEXT,
    workflow_start_time TEXT,
    workflow_close_time TEXT,
    workflow_run_time_ms REAL,
    workflow_result     TEXT,
    created_at          TEXT NOT NULL,
    tags                TEXT NOT NULL DEFAULT '[]'
);

-- ═══════════════════════════════════════════════════════════════════════
--  7. tackle.session_logs
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tackle.session_logs (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level       TEXT NOT NULL DEFAULT 'INFO',
    line        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tackle_session_logs_session_id
    ON tackle.session_logs(session_id);

-- ═══════════════════════════════════════════════════════════════════════
--  8. conduit.circuit_breaker
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.circuit_breaker (
    id                     INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
    tripped                INTEGER DEFAULT 0,
    tripped_at             TEXT,
    retry_after            INTEGER DEFAULT 1800,
    error                  TEXT,
    detail                 TEXT,
    source                 TEXT,
    fallback_model         TEXT,
    paused                 INTEGER DEFAULT 0,
    max_retries_per_model  INTEGER DEFAULT 3,
    retry_delay_seconds    INTEGER DEFAULT 120,
    max_fallbacks          INTEGER DEFAULT 3,
    push_back_to_pending   INTEGER DEFAULT 1,
    updated_at             TEXT
);

INSERT INTO conduit.circuit_breaker (id, tripped) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE conduit.circuit_breaker ADD COLUMN IF NOT EXISTS wake_requested_at TEXT;

-- ═══════════════════════════════════════════════════════════════════════
--  9. conduit.model_pricing
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.model_pricing (
    model_name             TEXT PRIMARY KEY,
    provider               TEXT NOT NULL,
    input_price_per_token  DOUBLE PRECISION NOT NULL,
    output_price_per_token DOUBLE PRECISION NOT NULL,
    cache_hit_price        DOUBLE PRECISION,
    updated_at             TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════
--  10. conduit.agent_budgets
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.agent_budgets (
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

-- ═══════════════════════════════════════════════════════════════════════
--  11. conduit.cost_logs
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.cost_logs (
    id                BIGSERIAL PRIMARY KEY,
    session_id        TEXT NOT NULL,
    ticket_id         TEXT,
    model             TEXT NOT NULL,
    input_tokens      INTEGER NOT NULL DEFAULT 0,
    output_tokens     INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL,
    actual_cost_usd   REAL,
    recorded_at       TEXT NOT NULL,
    tags              TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_cost_logs_session ON conduit.cost_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_logs_ticket  ON conduit.cost_logs(ticket_id);

-- ═══════════════════════════════════════════════════════════════════════
--  12. peb.role_circuit_breaker
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS peb.role_circuit_breaker (
    role            TEXT PRIMARY KEY,
    tripped         INTEGER DEFAULT 0,
    tripped_at      TEXT,
    retry_after     INTEGER DEFAULT 1800,
    error           TEXT,
    failure_count   INTEGER DEFAULT 0,
    updated_at      TEXT
);

-- ═══════════════════════════════════════════════════════════════════════
--  13. peb.governance_events
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS peb.governance_events (
    id              BIGSERIAL PRIMARY KEY,
    receipt_id      TEXT NOT NULL UNIQUE,
    event_type      TEXT NOT NULL,
    work_request_id TEXT,
    plan_id         TEXT NOT NULL,
    agent_role      TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replayed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_peb_governance_events_plan_id
    ON peb.governance_events(plan_id);
CREATE INDEX IF NOT EXISTS idx_peb_governance_events_event_type
    ON peb.governance_events(event_type);
CREATE INDEX IF NOT EXISTS idx_peb_governance_events_created_at
    ON peb.governance_events(created_at);

-- ═══════════════════════════════════════════════════════════════════════
--  14. Trigger: receipt → governance event propagation
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION vision.receipt_governance_trigger()
RETURNS TRIGGER AS $TRIG$
BEGIN
    INSERT INTO peb.governance_events (
        receipt_id, event_type, work_request_id, plan_id, agent_role, payload
    ) VALUES (
        NEW.id,
        'receipt:' || NEW.type,
        NULL,
        NEW.plan_id,
        NEW.agent_role,
        jsonb_build_object(
            'session_id', NEW.session_id,
            'artifact_path', NEW.artifact_path,
            'summary', NEW.summary,
            'ticket_id', NEW.ticket_id,
            'tokens_used', NEW.tokens_used
        )
    )
    ON CONFLICT (receipt_id) DO NOTHING;
    RETURN NEW;
END;
$TRIG$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipt_governance ON vision.receipts;
CREATE TRIGGER trg_receipt_governance
    AFTER INSERT ON vision.receipts
    FOR EACH ROW
    EXECUTE FUNCTION vision.receipt_governance_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  15. vision.work_requests
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vision.work_requests (
    id              BIGSERIAL PRIMARY KEY,
    wr_id           TEXT UNIQUE,
    dco_json        TEXT NOT NULL DEFAULT '{}',
    context         JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending',
    step_outputs    TEXT NOT NULL DEFAULT '{}',
    recorded_on_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt   TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════
--  16. tackle.providers
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tackle.providers (
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

-- ═══════════════════════════════════════════════════════════════════════
--  17. tackle.harnesses
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tackle.harnesses (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    invocation_semantics TEXT NOT NULL DEFAULT '{}',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════
--  18. tackle.models
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tackle.models (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    harness_id       TEXT NOT NULL REFERENCES tackle.harnesses(id) ON DELETE CASCADE,
    provider_id      TEXT REFERENCES tackle.providers(id),
    model_identifier TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════
--  19. tackle.config_bundle
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tackle.config_bundle (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL,
    model_id        TEXT NOT NULL REFERENCES tackle.models(id),
    provider_id     TEXT REFERENCES tackle.providers(id),
    harness_id      TEXT REFERENCES tackle.harnesses(id),
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

-- ═══════════════════════════════════════════════════════════════════════
--  20. conduit.plan_status view
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS conduit.plans_by_status CASCADE;
DROP VIEW IF EXISTS conduit.plan_status CASCADE;

CREATE VIEW conduit.plan_status AS
SELECT
    p.*,
    CASE
        -- HOLD: highest priority — if the latest meaningful receipt is HOLD, show it
        WHEN EXISTS (
            SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'HOLD'
            AND NOT EXISTS (
                SELECT 1 FROM vision.receipts r2
                WHERE r2.plan_id = p.id
                AND r2.type IN ('CANCELLED', 'ABANDONED')
                AND r2.created_at > r.created_at
            )
        ) THEN 'HOLD'
        -- REQUEUED: circuit breaker reset
        WHEN (
            SELECT r.type FROM vision.receipts r
            WHERE r.plan_id = p.id
            AND r.type NOT IN ('PLANNING', 'HOLD')
            ORDER BY r.created_at DESC LIMIT 1
        ) = 'REQUEUED' THEN 'PLAN_CREATE'
        -- REVIEW_PASS — terminal success
        WHEN EXISTS (
            SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
            AND NOT EXISTS (
                SELECT 1 FROM vision.receipts r2
                WHERE r2.plan_id = p.id
                AND r2.type IN ('BLOCK', 'PLAN_BLOCK', 'CANCELLED', 'ABANDONED')
                AND r2.created_at > r.created_at
            )
        ) THEN 'REVIEW_PASS'
        -- REVIEW_REJECT — show latest non-BLOCK receipt or fallback to PLAN_CREATE
        WHEN EXISTS (
            SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
        ) THEN COALESCE(
            (SELECT r.type FROM vision.receipts r
             WHERE r.plan_id = p.id
             AND r.type != 'BLOCK'
             ORDER BY r.created_at DESC LIMIT 1),
            'PLAN_CREATE'
        )
        ELSE COALESCE(
            (SELECT r.type FROM vision.receipts r
             WHERE r.plan_id = p.id
             AND r.type NOT IN ('PLANNING', 'HOLD')
             ORDER BY r.created_at DESC LIMIT 1),
            (SELECT r.type FROM vision.receipts r
             WHERE r.plan_id = p.id
             ORDER BY r.created_at DESC LIMIT 1),
            NULL
        )
    END AS derived_status
FROM conduit.plans p
WHERE p.deleted = 0;

CREATE VIEW conduit.plans_by_status AS
SELECT
    ps.derived_status AS status,
    ps.*
FROM conduit.plan_status ps;

-- ═══════════════════════════════════════════════════════════════════════
--  Record baseline version
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO conduit.schema_version (version, description, applied_at)
VALUES (0, 'Baseline — full createSchema() DDL from db.ts', datetime('now'))
ON CONFLICT (version) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  Verification
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_table_count INTEGER;
BEGIN
    SELECT count(*) INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema IN ('conduit', 'vision', 'peb', 'tackle');

    RAISE NOTICE 'Baseline complete — % tables across 4 schemas', v_table_count;
    RAISE NOTICE '   conduit: plans, schema_version, sessions, circuit_breaker,';
    RAISE NOTICE '            model_pricing, agent_budgets, cost_logs';
    RAISE NOTICE '   vision:  tickets, receipts, work_requests';
    RAISE NOTICE '   peb:     role_circuit_breaker, governance_events';
    RAISE NOTICE '   tackle:  session_logs, providers, harnesses, models, config_bundle';
    RAISE NOTICE '   views:   conduit.plan_status, conduit.plans_by_status';
    RAISE NOTICE '   trigger: vision.receipt_governance_trigger';
END $$;

COMMIT;
