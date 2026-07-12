-- Migration 024: Observations, Assessments, Spec Versioning & Work Requests
--
-- Purpose: Enable the recursive/observational pipeline loop:
--   1. Observations — records what happened (artifact changed, policy conflict, etc.)
--   2. Assessments — captures automated analysis outcome
--   3. Widen agenda_items.source_type to allow any trigger type
--   4. Versioned specifications table for revision tracking
--   5. Canonical business-layer work_requests (not the conduit runtime projection)
--
-- Design decisions:
--   - work_requests lives in nebula (business layer), not conduit (execution layer)
--   - conduit.work_requests becomes the runtime projection linked via nexus_wr_id
--   - Spec revision is NOT a DB trigger — the status transition is a business event
--     that should go through the kernel event machinery:
--       AgendaStatusChanged → Assessment → SpecificationRevisionCreated → Event
--
-- Depends on: 023-add-harvest-file-size.sql

SET search_path TO nebula;

-- ══════════════════════════════════════════════════════════════════
--  1. Observations — records trigger events
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.observations (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type      text NOT NULL,
    source_artifact_type text,
    source_artifact_id   uuid,
    payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
    assessed          boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observations_trigger_type
    ON nebula.observations (trigger_type);
CREATE INDEX IF NOT EXISTS idx_observations_source
    ON nebula.observations (source_artifact_type, source_artifact_id);
CREATE INDEX IF NOT EXISTS idx_observations_assessed
    ON nebula.observations (assessed);

COMMENT ON TABLE nebula.observations IS
    'Records trigger events that may need assessment. Separates "what happened" from "what we think about it".';
COMMENT ON COLUMN nebula.observations.trigger_type IS
    'Type of trigger: artifact_changed, policy_conflict, implementation_failure, drift_detected, review_request, missing_information, ai_uncertainty, dependency_change, etc.';
COMMENT ON COLUMN nebula.observations.payload IS
    'Change diff, error details, or context about the trigger event.';

-- ══════════════════════════════════════════════════════════════════
--  2. Assessments — automated analysis of observations
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.assessments (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id    uuid NOT NULL REFERENCES nebula.observations(id) ON DELETE CASCADE,
    outcome           text NOT NULL CHECK (outcome IN ('auto_resolved', 'needs_deliberation', 'informational', 'rejected')),
    confidence        numeric(4,3),
    impact_scope      jsonb NOT NULL DEFAULT '{}'::jsonb,
    open_questions    jsonb NOT NULL DEFAULT '[]'::jsonb,
    agenda_id         uuid REFERENCES nebula.agendas(id) ON DELETE SET NULL,
    forum_post_id     uuid REFERENCES assembly.posts(id) ON DELETE SET NULL,
    auto_resolve_plan_id uuid REFERENCES nebula.implementation_plans(id) ON DELETE SET NULL,
    analysis_detail   text,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessments_observation
    ON nebula.assessments (observation_id);
CREATE INDEX IF NOT EXISTS idx_assessments_outcome
    ON nebula.assessments (outcome);
CREATE INDEX IF NOT EXISTS idx_assessments_agenda
    ON nebula.assessments (agenda_id);
CREATE INDEX IF NOT EXISTS idx_assessments_forum_post
    ON nebula.assessments (forum_post_id);

COMMENT ON TABLE nebula.assessments IS
    'Captures automated analysis of an observation. Decides whether to auto-resolve, inform, or escalate for deliberation.';
COMMENT ON COLUMN nebula.assessments.outcome IS
    'auto_resolved: system handled it, auto_resolve_plan_id set. '
    'needs_deliberation: requires organizational decision, agenda_id set. '
    'informational: awareness only, forum_post_id set (no agenda created). '
    'rejected: the trigger was invalid or below threshold.';
COMMENT ON COLUMN nebula.assessments.impact_scope IS
    'JSON describing which artifacts are affected by the trigger, for KG-based impact analysis.';
COMMENT ON COLUMN nebula.assessments.agenda_id IS
    'Set when outcome=needs_deliberation: an agenda was created to resolve this.';
COMMENT ON COLUMN nebula.assessments.forum_post_id IS
    'Set when outcome=informational: an Assembly forum post was created for awareness (no agenda needed).';
COMMENT ON COLUMN nebula.assessments.auto_resolve_plan_id IS
    'Set when outcome=auto_resolved: an implementation plan handled this automatically.';

-- ══════════════════════════════════════════════════════════════════
--  3. Widen agenda_items.source_type — drop CHECK constraint
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agenda_items_source_type_check'
          AND conrelid = 'nebula.agenda_items'::regclass
    ) THEN
        ALTER TABLE nebula.agenda_items DROP CONSTRAINT agenda_items_source_type_check;
    END IF;
END $$;

COMMENT ON COLUMN nebula.agenda_items.source_type IS
    'Type of the source artifact. No longer constrained — any trigger type is valid (intent_record, requirement, agent_record, harvest_candidate, knowledge_graph_entry, policy_conflict, implementation_failure, architectural_drift, review_request, assessment_outcome, etc.).';

-- ══════════════════════════════════════════════════════════════════
--  4. Versioned specifications table
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.specifications (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agenda_id         uuid NOT NULL REFERENCES nebula.agendas(id) ON DELETE CASCADE,
    revision_number   integer NOT NULL,
    revision_type     text NOT NULL CHECK (revision_type IN ('created', 'revised', 'merged', 'split', 'retired')),
    superseded_by     uuid REFERENCES nebula.specifications(id) ON DELETE SET NULL,
    derived_from      uuid[] NOT NULL DEFAULT '{}',
    item_snapshot     jsonb NOT NULL DEFAULT '[]'::jsonb,
    change_summary    text,
    valid_from        timestamptz NOT NULL DEFAULT now(),
    valid_until       timestamptz NOT NULL DEFAULT '9999-12-31 23:59:59+00'::timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_specifications_agenda
    ON nebula.specifications (agenda_id);
CREATE INDEX IF NOT EXISTS idx_specifications_active
    ON nebula.specifications (valid_from, valid_until)
    WHERE valid_until = '9999-12-31 23:59:59+00'::timestamptz;

COMMENT ON TABLE nebula.specifications IS
    'Versioned specification revisions. A specification is a snapshot of which agenda_items are included at a given point in time. Supports create, revise, merge, split, and retire operations.';
COMMENT ON COLUMN nebula.specifications.revision_type IS
    'created: first version | revised: content changed | merged: combined from multiple specs | split: divided into multiple specs | retired: no longer active';
COMMENT ON COLUMN nebula.specifications.derived_from IS
    'UUIDs of parent specification revisions (multiple for merge, zero for create).';
COMMENT ON COLUMN nebula.specifications.item_snapshot IS
    'Snapshot of included agenda_items at this revision: [{id, source_type, source_id, title, included}]';

-- ══════════════════════════════════════════════════════════════════
--  5. Canonical business-layer work_requests
-- ══════════════════════════════════════════════════════════════════
--
-- This is the ORGANIZATIONAL record — what the business wants accomplished.
-- conduit.work_requests is the runtime execution projection, linked via
-- a future conduit.work_requests.nexus_work_request_id column.
--
-- The naming convention across the system:
--   nebula.implementation_plan → becomes → nebula.work_request (canonical business record)
--     → dispatched to → conduit.work_request (runtime execution object)
--     → tracked via → conduit.work_request_events (state transitions)
--
-- conduit-mcp tools:
--   create_plan()                  → conduit.plans (conduit's internal plan tracking)
--   create_implementation_plan()   → nebula.implementation_plans (pipeline-level plan)
--   runtime_submit_work_request()  → dispatches to conduit.work_requests

CREATE TABLE IF NOT EXISTS nebula.work_requests (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title                 text NOT NULL,
    description           text,
    source_specification_id uuid REFERENCES nebula.specifications(id) ON DELETE SET NULL,
    source_requirement_id   uuid,
    status                text NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT', 'APPROVED', 'DISPATCHED', 'COMPLETED', 'CANCELLED')),
    intent                text,
    context               jsonb NOT NULL DEFAULT '{}'::jsonb,
    constraints           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_requests_status
    ON nebula.work_requests (status);
CREATE INDEX IF NOT EXISTS idx_work_requests_spec
    ON nebula.work_requests (source_specification_id);
CREATE INDEX IF NOT EXISTS idx_work_requests_req
    ON nebula.work_requests (source_requirement_id);

COMMENT ON TABLE nebula.work_requests IS
    'Canonical business-layer work request. Represents organizational intent to execute work. Not the runtime execution object — that is conduit.work_requests.';
COMMENT ON COLUMN nebula.work_requests.source_specification_id IS
    'The specification revision that this work request fulfills.';
COMMENT ON COLUMN nebula.work_requests.source_requirement_id IS
    'The requirement UUID this work request addresses (loose reference, no FK — same pattern as implementation_plans.requirement_id).';
COMMENT ON COLUMN nebula.work_requests.status IS
    'DRAFT → APPROVED → DISPATCHED (sent to conduit) → COMPLETED → CANCELLED. DISPATCHED means a conduit.work_requests record exists with this id as nexus_work_request_id.';
COMMENT ON COLUMN nebula.work_requests.intent IS
    'What the organization intends to accomplish with this work.';
COMMENT ON COLUMN nebula.work_requests.context IS
    'Business context: linked artifacts, justification, priority signals.';
COMMENT ON COLUMN nebula.work_requests.constraints IS
    'Boundaries: resource limits, deadlines, dependency constraints, policy rules.';

-- ══════════════════════════════════════════════════════════════════
--  6. Create spec version views (keeps existing nebula.specs intact)
-- ══════════════════════════════════════════════════════════════════

-- The existing nebula.specs view (agenda_items WHERE included=true) continues
-- to show the current scope.  The new views below provide revision-aware access.

CREATE OR REPLACE VIEW nebula.active_specifications AS
SELECT
    s.id,
    s.agenda_id,
    s.revision_number,
    s.revision_type,
    s.superseded_by,
    s.derived_from,
    s.item_snapshot,
    s.change_summary,
    s.valid_from,
    s.valid_until,
    s.created_at,
    a.title AS agenda_title,
    a.status AS agenda_status
FROM nebula.specifications s
JOIN nebula.agendas a ON a.id = s.agenda_id
WHERE now() >= s.valid_from AND now() < s.valid_until;

COMMENT ON VIEW nebula.active_specifications IS
    'Current active specification revisions from the versioned specifications table. Shows only rows where valid_until = infinity.';
