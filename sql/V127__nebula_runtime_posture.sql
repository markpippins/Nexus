-- V127: nebula.runtime_posture — startup health-check snapshot table
-- ====================================================================
-- Stores preflight-check.sh JSON posture snapshots so the ops pipeline
-- can query historical reachability, track service drift, and confirm
-- migration ordering parity between localhost and barium.
--
-- Designed to be lightweight: the full JSON blob carries the detailed
-- per-service probe data, while the indexed columns support fast
-- aggregate queries (pass/fail ratio, worst offender, trend lines).
--
-- Idempotent: safe to re-run (DROP IF EXISTS / CREATE).

BEGIN;

-- ── Runtime posture snapshot table ─────────────────────────────

CREATE TABLE IF NOT EXISTS nebula.runtime_posture (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    checked_at          timestamptz NOT NULL DEFAULT now(),
    host                text        NOT NULL DEFAULT 'localhost',

    -- Aggregate counts from the JSON payload (indexed for fast queries)
    services_total      integer     NOT NULL,
    services_healthy    integer     NOT NULL,
    services_unhealthy  integer     NOT NULL DEFAULT 0,
    all_healthy         boolean     NOT NULL DEFAULT false,

    -- Whether migration ordering was also checked in this snapshot
    migration_checked   boolean     NOT NULL DEFAULT false,
    migration_ok        boolean,

    -- Probe metadata
    duration_ms         integer,              -- how long the whole probe took
    probe_version       text        NOT NULL DEFAULT '1.0',

    -- The full preflight-check.sh --json output (per-service detail)
    posture_json        jsonb       NOT NULL,

    -- Standard record-keeping
    recorded_at         timestamptz NOT NULL DEFAULT now(),
    recorded_until      timestamptz NOT NULL DEFAULT 'infinity',
    expired_at          timestamptz
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX idx_runtime_posture_checked_at
    ON nebula.runtime_posture (checked_at DESC, host)
    WHERE expired_at IS NULL;

CREATE INDEX idx_runtime_posture_healthy
    ON nebula.runtime_posture (host, all_healthy, checked_at DESC)
    WHERE expired_at IS NULL;

-- Partial index for quick "what's currently broken" lookups
CREATE INDEX idx_runtime_posture_unhealthy
    ON nebula.runtime_posture (host, checked_at DESC)
    WHERE expired_at IS NULL AND all_healthy = false;

-- ── Helper: view for the most recent snapshot per host ────────

CREATE OR REPLACE VIEW nebula.latest_runtime_posture AS
SELECT DISTINCT ON (host) *
FROM nebula.runtime_posture
WHERE expired_at IS NULL
ORDER BY host, checked_at DESC;

COMMIT;