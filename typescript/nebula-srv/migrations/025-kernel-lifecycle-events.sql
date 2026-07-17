-- Migration 025: Kernel Lifecycle Events — event vocabulary + projection triggers
--
-- Purpose:
--   Extends the kernel event vocabulary with lifecycle events for the
--   deliberation, assessment, specification, and execution domains.
--   Adds projection triggers that materialize nebula domain rows from
--   kernel transitions.
--
-- Design:
--   The kernel records transitions; nebula gets domain projections.
--   This keeps the kernel as the governance boundary while making
--   domain tables available for direct query and UI rendering.
--
--   Event → trigger → domain row:
--     kernel.sys_transition()
--       │
--       ├──→ kernel.transition_event  (append-only event log)
--       │
--       └──→ trigger → nebula.observations / nebula.assessments / etc.
--
-- Depends on: 024-observations-assessments.sql (creates nebula tables)
--             + 008-semantic-kernel.sql (kernel schema + sys_transition)
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════════
--  1. Extend event vocabulary
-- ═══════════════════════════════════════════════════════════════════════
-- PostgreSQL ALTER TYPE ... ADD VALUE cannot be wrapped in a DO block
-- because it cannot execute inside a transaction block. Each ADD VALUE
-- is idempotent: if the value already exists, the ALTER is a no-op.
-- We use DO blocks with exception catching for idempotency.

DO $$
BEGIN
    -- Assessment lifecycle
    ALTER TYPE kernel.event_type ADD VALUE 'assessment.started';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'assessment.completed';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'assessment.accepted';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'assessment.rejected';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- Deliberation lifecycle
DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'agenda.created';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'agenda.activated';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'agenda.decision_recorded';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'agenda.closed';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- Specification lifecycle
DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'specification.created';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'specification.revised';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'specification.superseded';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- Execution lifecycle
DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'work_request.created';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'work_request.dispatched';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'work_request.completed';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
    ALTER TYPE kernel.event_type ADD VALUE 'work_request.failed';
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- ═══════════════════════════════════════════════════════════════════════
--  2. Projection: observation.captured → nebula.observations
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.project_observation_captured()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.event_type = 'observation.captured' THEN
        INSERT INTO nebula.observations (
            id,
            trigger_type,
            source_artifact_type,
            source_artifact_id,
            payload,
            assessed,
            created_at
        ) VALUES (
            NEW.aggregate_id::uuid,
            NEW.payload->>'trigger_type',
            NEW.payload->>'source_artifact_type',
            (NEW.payload->>'source_artifact_id')::uuid,
            COALESCE(NEW.payload->'details', '{}'::jsonb),
            false,
            NEW.timestamp
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION kernel.project_observation_captured IS
    'Projects observation.captured kernel events into nebula.observations.
     The aggregate_id IS the observation UUID. Payload format:
       {"trigger_type": "...", "source_artifact_type": "...",
        "source_artifact_id": "...", "details": {...}}';

-- ═══════════════════════════════════════════════════════════════════════
--  3. Projection: assessment.completed → nebula.assessments
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.project_assessment_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.event_type = 'assessment.completed' THEN
        -- Insert the assessment row
        INSERT INTO nebula.assessments (
            id,
            observation_id,
            outcome,
            confidence,
            impact_scope,
            open_questions,
            analysis_detail,
            created_at
        ) VALUES (
            NEW.aggregate_id::uuid,
            (NEW.payload->>'observation_id')::uuid,
            NEW.payload->>'outcome',
            (NEW.payload->>'confidence')::numeric,
            COALESCE(NEW.payload->'impact_scope', '{}'::jsonb),
            COALESCE(NEW.payload->'open_questions', '[]'::jsonb),
            NEW.payload->>'analysis_detail',
            NEW.timestamp
        )
        ON CONFLICT (id) DO NOTHING;

        -- Mark the observation as assessed
        UPDATE nebula.observations
        SET assessed = true
        WHERE id = (NEW.payload->>'observation_id')::uuid;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION kernel.project_assessment_completed IS
    'Projects assessment.completed kernel events into nebula.assessments
     and marks the source observation as assessed. aggregate_id IS the
     assessment UUID. Payload format:
       {"observation_id": "...", "outcome": "...", "confidence": 0.85,
        "impact_scope": {...}, "open_questions": [...],
        "analysis_detail": "..."}';

-- ═══════════════════════════════════════════════════════════════════════
--  4. Attach projection triggers to transition_event
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_transition_event_project_observations
    ON kernel.transition_event;

CREATE OR REPLACE TRIGGER trg_transition_event_project_observations
    AFTER INSERT ON kernel.transition_event
    FOR EACH ROW
    WHEN (NEW.event_type = 'observation.captured')
    EXECUTE FUNCTION kernel.project_observation_captured();

COMMENT ON TRIGGER trg_transition_event_project_observations
    ON kernel.transition_event IS
    'Projects observation.captured events into nebula.observations.';

DROP TRIGGER IF EXISTS trg_transition_event_project_assessments
    ON kernel.transition_event;

CREATE OR REPLACE TRIGGER trg_transition_event_project_assessments
    AFTER INSERT ON kernel.transition_event
    FOR EACH ROW
    WHEN (NEW.event_type = 'assessment.completed')
    EXECUTE FUNCTION kernel.project_assessment_completed();

COMMENT ON TRIGGER trg_transition_event_project_assessments
    ON kernel.transition_event IS
    'Projects assessment.completed events into nebula.assessments.';

-- ═══════════════════════════════════════════════════════════════════════
--  5. Add bridge column for conduit work request handshake
-- ═══════════════════════════════════════════════════════════════════════
-- Links conduit.runtime execution to nebula business intent.
-- This completes the "business decision → execution" traceability chain.

ALTER TABLE conduit.work_requests
    ADD COLUMN IF NOT EXISTS nexus_work_request_id uuid
    REFERENCES nebula.work_requests(id) ON DELETE SET NULL;

COMMENT ON COLUMN conduit.work_requests.nexus_work_request_id IS
    'Links this runtime execution record to the canonical business work
     request in nebula.work_requests. Enables traceability:
     which business decision → which execution → what did we learn?';
