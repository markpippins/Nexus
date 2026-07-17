-- Migration 025 — Execution Authority Schema (ADR-006)
--
-- Creates the execution schema and four durable nouns:
--   1. execution.requests     — immutable intent (WorkRequest)
--   2. execution.leases       — temporal permission to execute
--   3. execution.attempts     — one run of the work
--   4. execution.receipts     — immutable evidence, consumed by Kernel
--
-- This migration is schema-creating (CREATE SCHEMA IF NOT EXISTS).
-- It does NOT migrate data — see 026-migrate-receipts.sql for that.
--
-- Usage:
--   psql -h localhost -U pguser -d nexus -f 025-execution-schema.sql

BEGIN;

-- ============================================================
-- 1. Create the execution schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS execution;

-- ============================================================
-- 2. execution.requests — WorkRequest (immutable intent)
--
-- Represents desired work. Lifecycle:
--   DRAFT → COMPILED → VALIDATED → ADMITTED → READY → COMPLETED
--   (or FAILED / CANCELLED at any point after DRAFT)
--
-- This is the execution-layer representation. The business-layer
-- intent lives in nebula.work_requests; this table is the
-- compiled, validated form that enters the execution pipeline.
-- ============================================================

CREATE TABLE IF NOT EXISTS execution.requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_key    TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL DEFAULT '',

    -- Intent layer (what is desired)
    intent_type     TEXT NOT NULL DEFAULT 'task',
    objective       TEXT NOT NULL DEFAULT '',
    inputs          JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Constraint layer (what is allowed)
    deterministic   BOOLEAN NOT NULL DEFAULT TRUE,
    max_retries     INTEGER,
    timeout_policy  TEXT,
    resource_hints  TEXT[] DEFAULT '{}',

    -- Op resolution trace (how intent was compiled)
    op_trace        JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN (
                        'DRAFT','COMPILED','VALIDATED',
                        'ADMITTED','READY',
                        'COMPLETED','FAILED','CANCELLED'
                    )),

    -- Lineage
    source_plan_id  TEXT,                        -- conduit.plans.id
    source_wr_id    TEXT,                        -- vision.work_requests.wr_id (legacy)

    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_requests_status
    ON execution.requests (status);

CREATE INDEX IF NOT EXISTS idx_execution_requests_source_plan
    ON execution.requests (source_plan_id)
    WHERE source_plan_id IS NOT NULL;

-- ============================================================
-- 3. execution.leases — temporal permission to execute
--
-- Lifecycle: ACTIVE → EXPIRED | RELEASED
-- Lease expiry does NOT mutate WorkRequest status.
-- Only one active lease per request at a time (enforced by partial unique index).
-- ============================================================

CREATE TABLE IF NOT EXISTS execution.leases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES execution.requests(id),
    executor_id     TEXT NOT NULL,               -- 'conduit', 'cli', 'jenkins', etc.

    -- Lifecycle
    status          TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','EXPIRED','RELEASED')),
    ttl_seconds     INTEGER NOT NULL DEFAULT 300,
    acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    released_at     TIMESTAMPTZ,

    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active lease per request at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_leases_active_per_request
    ON execution.leases (request_id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_execution_leases_request
    ON execution.leases (request_id);

CREATE INDEX IF NOT EXISTS idx_execution_leases_executor
    ON execution.leases (executor_id);

-- ============================================================
-- 4. execution.attempts — one run of the work
--
-- Lifecycle: CREATED → RUNNING → SUCCEEDED | FAILED | TIMED_OUT
-- Each attempt is tied to a lease and a request.
-- ============================================================

CREATE TABLE IF NOT EXISTS execution.attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id        UUID NOT NULL REFERENCES execution.leases(id),
    request_id      UUID NOT NULL REFERENCES execution.requests(id),
    executor_id     TEXT NOT NULL,               -- denormalized from lease for query speed

    -- Lifecycle
    status          TEXT NOT NULL DEFAULT 'CREATED'
                    CHECK (status IN ('CREATED','RUNNING','SUCCEEDED','FAILED','TIMED_OUT')),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,

    -- Outcome
    result          JSONB NOT NULL DEFAULT '{}'::jsonb,
    error           TEXT,
    exit_code       INTEGER,

    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_attempts_request
    ON execution.attempts (request_id);

CREATE INDEX IF NOT EXISTS idx_execution_attempts_lease
    ON execution.attempts (lease_id);

CREATE INDEX IF NOT EXISTS idx_execution_attempts_status
    ON execution.attempts (status);

-- ============================================================
-- 5. execution.receipts — immutable evidence (ADR-006 noun #4)
--
-- Produced by Execution Authority, consumed by Kernel.
-- Immutable once issued. The Kernel reduces receipts into
-- deterministic KernelState.
--
-- lineage_source + lineage_original_id preserve the connection
-- to vision.receipts for historical records migrated in 026.
-- ============================================================

CREATE TABLE IF NOT EXISTS execution.receipts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id          UUID NOT NULL REFERENCES execution.attempts(id),
    request_id          UUID NOT NULL REFERENCES execution.requests(id),

    -- Receipt content
    type                TEXT NOT NULL,           -- 'EXECUTION_COMPLETE', 'EXECUTION_FAILED', etc.
    agent_role          TEXT NOT NULL DEFAULT '',
    summary             TEXT NOT NULL DEFAULT '',
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Lineage (for migrated records from vision.receipts)
    lineage_source      TEXT,                    -- 'vision.receipts' for migrated records
    lineage_original_id TEXT,                    -- original vision.receipts.id

    -- Timestamps
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_receipts_request
    ON execution.receipts (request_id);

CREATE INDEX IF NOT EXISTS idx_execution_receipts_attempt
    ON execution.receipts (attempt_id);

CREATE INDEX IF NOT EXISTS idx_execution_receipts_type
    ON execution.receipts (type);

-- ============================================================
-- 6. Updated-at trigger for execution.requests
-- ============================================================

CREATE OR REPLACE FUNCTION execution.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_execution_requests_updated_at ON execution.requests;
CREATE TRIGGER trg_execution_requests_updated_at
    BEFORE UPDATE ON execution.requests
    FOR EACH ROW
    EXECUTE FUNCTION execution.set_updated_at();

-- ============================================================
-- 7. Verification
-- ============================================================

DO $$ DECLARE
    t RECORD;
    expected TEXT[] := ARRAY['requests','leases','attempts','receipts'];
    e TEXT;
    missing TEXT := '';
BEGIN
    FOREACH e IN ARRAY expected LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'execution' AND table_name = e
        ) THEN
            missing := missing || ' ' || e;
        END IF;
    END LOOP;

    IF missing != '' THEN
        RAISE EXCEPTION 'execution schema incomplete — missing tables:%', missing;
    END IF;

    SELECT count(*) INTO t FROM information_schema.tables
    WHERE table_schema = 'execution';
    RAISE NOTICE 'execution schema: % tables created', t.count;
END $$;

COMMIT;
