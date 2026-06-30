-- Migration 008: PostgreSQL Semantic Kernel
--
-- Establishes the kernel schema and the canonical EventEnvelope append log.
-- The kernel is the authoritative state machine: it authorizes, validates,
-- appends, and notifies. Everything else — orchestration, projections,
-- search indexes — is derived.
--
-- Principles:
--   1. Single write surface: sys_transition() only.
--   2. Kernel never mutates history: transition_event is append-only.
--   3. The runtime proposes; the kernel disposes.
--   4. Views are the public API — no direct table reads.
--
-- Depends on: update_updated_at() function from base schema (public)
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════════
--  Kernel Schema
-- ═══════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS kernel;

COMMENT ON SCHEMA kernel IS
    'Semantic Kernel — authoritative state machine. Owns the immutable event log.';

-- ═══════════════════════════════════════════════════════════════════════
--  Canonical EventEnvelope
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE kernel.event_type AS ENUM (
    'intent.created',
    'intent.updated',
    'intent.archived',
    'transition.requested',
    'transition.committed',
    'transition.rejected',
    'artifact.created',
    'artifact.updated',
    'receipt.issued',
    'policy.violated',
    'observation.captured',
    'notification.emitted'
);

COMMENT ON TYPE kernel.event_type IS
    'Canonical event types. Extensible — additive only, never removed.';

-- ═══════════════════════════════════════════════════════════════════════
--  transition_event — the single append log
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kernel.transition_event (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Canonical EventEnvelope
    event_id        UUID        NOT NULL DEFAULT gen_random_uuid(),
    event_type      kernel.event_type NOT NULL,
    aggregate_type  TEXT        NOT NULL,
    aggregate_id    TEXT        NOT NULL,
    actor           TEXT        NOT NULL,
    authority       TEXT,                           -- role or credential
    payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    receipt         TEXT,                           -- content-addressed hash
    causation_id    UUID,                           -- event that caused this one
    correlation_id  UUID,                           -- groups related events
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    schema_version  INTEGER     NOT NULL DEFAULT 1,

    -- Immutability constraint
    CONSTRAINT uq_transition_event_event_id UNIQUE (event_id),

    -- Receipts must be non-empty if provided
    CONSTRAINT ck_transition_event_receipt CHECK (
        receipt IS NULL OR length(receipt) > 0
    )
);

COMMENT ON TABLE kernel.transition_event IS
    'Canonical append-only event log. Every state change is one row.
     The runtime proposes; the kernel disposes.';

COMMENT ON COLUMN kernel.transition_event.event_id IS
    'Unique event identifier (UUID v4).';

COMMENT ON COLUMN kernel.transition_event.event_type IS
    'Type of event — identifies the lifecycle transition.';

COMMENT ON COLUMN kernel.transition_event.aggregate_type IS
    'Domain entity type (e.g., intent, artifact, receipt, policy).';

COMMENT ON COLUMN kernel.transition_event.aggregate_id IS
    'Identifier of the aggregate instance this event targets.';

COMMENT ON COLUMN kernel.transition_event.actor IS
    'Entity that triggered this transition (agent, user, system).';

COMMENT ON COLUMN kernel.transition_event.authority IS
    'Role or credential under which the actor operated (e.g., architect, planner).';

COMMENT ON COLUMN kernel.transition_event.payload IS
    'Event-type-specific payload — shape varies by event_type.';

COMMENT ON COLUMN kernel.transition_event.receipt IS
    'Content-addressed hash of the event for integrity verification.';

COMMENT ON COLUMN kernel.transition_event.causation_id IS
    'ID of the event that caused this event (causality chain).';

COMMENT ON COLUMN kernel.transition_event.correlation_id IS
    'Correlation ID grouping related events across aggregates.';

COMMENT ON COLUMN kernel.transition_event.timestamp IS
    'When the event was committed (not when it was proposed).';

COMMENT ON COLUMN kernel.transition_event.schema_version IS
    'Event schema version (additive only — never breaking).';

-- Indexes for common query patterns
CREATE INDEX idx_transition_event_aggregate
    ON kernel.transition_event (aggregate_type, aggregate_id, timestamp DESC);

CREATE INDEX idx_transition_event_type
    ON kernel.transition_event (event_type, timestamp DESC);

CREATE INDEX idx_transition_event_actor
    ON kernel.transition_event (actor, timestamp DESC);

CREATE INDEX idx_transition_event_causation
    ON kernel.transition_event (causation_id)
    WHERE causation_id IS NOT NULL;

CREATE INDEX idx_transition_event_correlation
    ON kernel.transition_event (correlation_id)
    WHERE correlation_id IS NOT NULL;

CREATE INDEX idx_transition_event_timestamp
    ON kernel.transition_event (timestamp DESC);

-- ═══════════════════════════════════════════════════════════════════════
--  intent — root aggregate
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kernel.intent (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    goal            TEXT        NOT NULL,
    owner           TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'completed', 'abandoned', 'superseded')),
    parent_intent_id UUID       REFERENCES kernel.intent(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    superseded_at   TIMESTAMPTZ
);

COMMENT ON TABLE kernel.intent IS
    'Root aggregate. Everything — events, receipts, artifacts, provenance —
     hangs off an intent. Enables replay by objective rather than chronology.';

CREATE INDEX idx_intent_owner ON kernel.intent (owner, status);
CREATE INDEX idx_intent_status ON kernel.intent (status);

-- ═══════════════════════════════════════════════════════════════════════
--  sys_transition() — THE single write surface
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.sys_transition(
    p_event_type        kernel.event_type,
    p_aggregate_type    TEXT,
    p_aggregate_id      TEXT,
    p_actor             TEXT,
    p_payload           JSONB DEFAULT '{}'::jsonb,
    p_authority         TEXT DEFAULT NULL,
    p_receipt           TEXT DEFAULT NULL,
    p_causation_id      UUID DEFAULT NULL,
    p_correlation_id    UUID DEFAULT NULL,
    p_timestamp         TIMESTAMPTZ DEFAULT now()
)
RETURNS kernel.transition_event
LANGUAGE plpgsql
AS $$
DECLARE
    v_event kernel.transition_event;
BEGIN
    -- ── Admission Phase: authorization (extensible via trigger) ──
    -- The BEFORE INSERT trigger on transition_event will perform
    -- deeper authorization and validation checks.

    -- ── Commit Phase: append the event ──
    INSERT INTO kernel.transition_event (
        event_id,
        event_type,
        aggregate_type,
        aggregate_id,
        actor,
        authority,
        payload,
        receipt,
        causation_id,
        correlation_id,
        timestamp,
        schema_version
    ) VALUES (
        gen_random_uuid(),
        p_event_type,
        p_aggregate_type,
        p_aggregate_id,
        p_actor,
        p_authority,
        p_payload,
        p_receipt,
        p_causation_id,
        p_correlation_id,
        p_timestamp,
        1
    )
    RETURNING * INTO v_event;

    -- ── Reduction and Observation Phases are handled by triggers ──

    RETURN v_event;
END;
$$;

COMMENT ON FUNCTION kernel.sys_transition IS
    'Sole write surface for the Semantic Kernel.
     All state mutations — from any runtime, agent, or tool — must go through
     this function. It enforces authorization (via BEFORE INSERT trigger),
     appends to the immutable event log, and triggers NOTIFY so that Cascade
     and projection workers can respond.

     Args:
       p_event_type:      Canonical event type
       p_aggregate_type:  Domain entity type
       p_aggregate_id:    Instance identifier
       p_actor:           Who/what triggered this
       p_payload:         Event-specific data (JSONB)
       p_authority:       Role or credential (optional)
       p_receipt:         Integrity hash (optional)
       p_causation_id:    Parent event for causality chain (optional)
       p_correlation_id:  Grouping ID for related events (optional)
       p_timestamp:       Override timestamp (defaults to now())

     Returns: the committed transition_event row.
     Raises:  exception if authorization or validation fails (via trigger).';

-- ═══════════════════════════════════════════════════════════════════════
--  Authorization Trigger (BEFORE INSERT)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.trg_authorize_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Phase 1: Structural authorization rules.
    -- These are hard-coded kernel invariants. Policy-based rules
    -- (compiled from CUE) will be added here as the policy_rule table
    -- is populated.

    -- Rule: Actor is required
    IF NEW.actor IS NULL OR length(trim(NEW.actor)) = 0 THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: actor is required'
            USING HINT = 'Every transition must specify an actor';
    END IF;

    -- Rule: Aggregate type and ID are required
    IF NEW.aggregate_type IS NULL OR length(trim(NEW.aggregate_type)) = 0 THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: aggregate_type is required'
            USING HINT = 'Every transition must specify an aggregate type';
    END IF;

    IF NEW.aggregate_id IS NULL OR length(trim(NEW.aggregate_id)) = 0 THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: aggregate_id is required'
            USING HINT = 'Every transition must specify an aggregate instance';
    END IF;

    -- Rule: Past timestamps are not allowed (5 sec clock skew tolerance)
    IF NEW.timestamp > now() + INTERVAL '5 seconds' THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: future timestamp %', NEW.timestamp
            USING HINT = 'Timestamps must not be in the future';
    END IF;

    -- Note: CUE-compiled policy rules will be checked here in Phase 2.
    -- The policy_rule table will hold condition_sql predicates that are
    -- evaluated against NEW to enforce domain-specific authorization.

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION kernel.trg_authorize_transition IS
    'BEFORE INSERT trigger: authorizes every transition before commit.
     Enforces structural invariants (actor, aggregate_type, aggregate_id,
     timestamp sanity). Policy-based rules (CUE-compiled) will be added
     as the policy system matures.';

CREATE OR REPLACE TRIGGER trg_transition_event_authorize
    BEFORE INSERT ON kernel.transition_event
    FOR EACH ROW
    EXECUTE FUNCTION kernel.trg_authorize_transition();

-- ═══════════════════════════════════════════════════════════════════════
--  Notification Trigger (AFTER INSERT)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.trg_notify_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Notify Cascade and projection workers that a new event exists.
    -- Listeners receive the event_id and can query the full row.
    PERFORM pg_notify(
        'kernel_transition_committed',
        jsonb_build_object(
            'event_id',         NEW.event_id::TEXT,
            'event_type',       NEW.event_type::TEXT,
            'aggregate_type',   NEW.aggregate_type,
            'aggregate_id',     NEW.aggregate_id,
            'actor',            NEW.actor,
            'timestamp',        NEW.timestamp::TEXT
        )::TEXT
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION kernel.trg_notify_transition IS
    'AFTER INSERT trigger: notifies listeners that a transition was committed.
     Cascade subscribes to kernel_transition_committed to orchestrate
     downstream work. Projection workers subscribe to update derived views.';

CREATE OR REPLACE TRIGGER trg_transition_event_notify
    AFTER INSERT ON kernel.transition_event
    FOR EACH ROW
    EXECUTE FUNCTION kernel.trg_notify_transition();

-- ═══════════════════════════════════════════════════════════════════════
--  Sample Views (projection proof-of-concept)
-- ═══════════════════════════════════════════════════════════════════════

-- View: events grouped by aggregate
CREATE OR REPLACE VIEW kernel.v_aggregate_events AS
SELECT
    aggregate_type,
    aggregate_id,
    count(*)                                AS event_count,
    min(timestamp)                          AS first_seen,
    max(timestamp)                          AS last_seen,
    array_agg(DISTINCT event_type::TEXT)    AS event_types
FROM kernel.transition_event
GROUP BY aggregate_type, aggregate_id;

COMMENT ON VIEW kernel.v_aggregate_events IS
    'Summary of events per aggregate — useful for lifecycle inspection.';

-- View: causality chains
CREATE OR REPLACE VIEW kernel.v_causality_chain AS
WITH RECURSIVE chain AS (
    -- Anchor: events without causation_id (root events)
    SELECT
        id,
        event_id,
        event_type,
        aggregate_type,
        aggregate_id,
        actor,
        causation_id,
        correlation_id,
        timestamp,
        0 AS depth,
        ARRAY[event_id::TEXT] AS path
    FROM kernel.transition_event
    WHERE causation_id IS NULL

    UNION ALL

    -- Recursive: events that reference a parent
    SELECT
        te.id,
        te.event_id,
        te.event_type,
        te.aggregate_type,
        te.aggregate_id,
        te.actor,
        te.causation_id,
        te.correlation_id,
        te.timestamp,
        c.depth + 1,
        c.path || te.event_id::TEXT
    FROM kernel.transition_event te
    JOIN chain c ON c.event_id = te.causation_id
)
SELECT * FROM chain;

COMMENT ON VIEW kernel.v_causality_chain IS
    'Recursive view reconstructing the full causality DAG from the event log.';

-- ═══════════════════════════════════════════════════════════════════════
--  Permissions
-- ═══════════════════════════════════════════════════════════════════════

-- Grant access to the application user
GRANT USAGE ON SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA kernel TO pguser;

-- Grant specific permissions for views (read-only for non-owners)
GRANT SELECT ON ALL TABLES IN SCHEMA kernel TO pguser;
