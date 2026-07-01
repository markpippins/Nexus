-- Migration 012: Event Log Projection — the REDUCER output table
--
-- Establishes kernel.event_log, the canonical projection table that
-- reducers write to when they consume kernel events. This is the
-- "Views" stage of the compiler pipeline:
--
--   Kernel → Events → Reducers → Views
--                      ↑
--               projection_updater.py  (NATS subscriber)
--
-- The event_log is NOT the source of truth — it's a derived projection
-- maintained by the Cascade event subscriber. It enables fast queries
-- across event dimensions without scanning the append-only log.
--
-- Design:
--   1. Append-only: every reducer write is a new row (no UPDATE).
--   2. Denormalized: copies key fields from transition_event for fast
--      querying without JOINs.
--   3. Idempotent: event_id has a UNIQUE constraint so the subscriber
--      can safely retry.
--
-- Depends on: migration 008 (kernel schema, transition_event table)
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════════
--  Event Log Projection Table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kernel.event_log (
    id              BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Copied from transition_event (denormalized for fast querying)
    event_id        UUID        NOT NULL,
    event_type      TEXT        NOT NULL,
    aggregate_type  TEXT        NOT NULL,
    aggregate_id    TEXT        NOT NULL,
    actor           TEXT        NOT NULL,
    authority       TEXT,
    payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    receipt         TEXT,
    causation_id    UUID,
    correlation_id  UUID,
    event_timestamp TIMESTAMPTZ NOT NULL,

    -- Projection metadata (added by the reducer)
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reducer_version TEXT        NOT NULL DEFAULT 'kernel.event_log@0.1',

    -- Idempotency: each event appears at most once
    CONSTRAINT uq_event_log_event_id UNIQUE (event_id)
);

COMMENT ON TABLE kernel.event_log IS
    'Derived projection of kernel.transition_event. Maintained by the
     Cascade projection_updater subscriber. Append-only, idempotent,
     denormalized for fast querying.';

COMMENT ON COLUMN kernel.event_log.received_at IS
    'When the projection subscriber received and wrote this event.
     Distinct from event_timestamp (when the event was committed).';

COMMENT ON COLUMN kernel.event_log.reducer_version IS
    'Version of the reducer logic that produced this row. Enables
     schema migration of projections.';

-- Indexes for common query patterns
CREATE INDEX idx_event_log_type
    ON kernel.event_log (event_type, event_timestamp DESC);

CREATE INDEX idx_event_log_aggregate
    ON kernel.event_log (aggregate_type, aggregate_id, event_timestamp DESC);

CREATE INDEX idx_event_log_actor
    ON kernel.event_log (actor, event_timestamp DESC);

CREATE INDEX idx_event_log_received
    ON kernel.event_log (received_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
--  View: recent events (last 100)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW kernel.v_recent_events AS
SELECT
    id,
    event_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor,
    authority,
    event_timestamp,
    received_at,
    received_at - event_timestamp AS propagation_lag
FROM kernel.event_log
ORDER BY received_at DESC
LIMIT 100;

COMMENT ON VIEW kernel.v_recent_events IS
    'Last 100 projected events with propagation lag. Useful for
     monitoring the kernel → NATS → subscriber pipeline latency.';

-- ═══════════════════════════════════════════════════════════════════════
--  View: event analytics summary
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW kernel.v_event_analytics AS
SELECT
    event_type,
    aggregate_type,
    count(*)                                    AS event_count,
    min(event_timestamp)                        AS first_seen,
    max(event_timestamp)                        AS last_seen,
    count(DISTINCT actor)                       AS unique_actors,
    count(DISTINCT aggregate_id)                AS unique_aggregates
FROM kernel.event_log
GROUP BY event_type, aggregate_type
ORDER BY event_type, aggregate_type;

COMMENT ON VIEW kernel.v_event_analytics IS
    'Analytics summary: event counts grouped by type and aggregate.
     Updated in real-time as the projection subscriber writes rows.';

-- ═══════════════════════════════════════════════════════════════════════
--  Permissions
-- ═══════════════════════════════════════════════════════════════════════

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA kernel TO pguser;
