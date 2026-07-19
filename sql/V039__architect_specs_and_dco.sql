-- V039: Architect specs table + work_request_dco column
--
-- architect_specs: lightweight audit-trail specifications written by the
-- Architect cron. No code — just title, requirement linkage, and optional
-- work_request linkage (for DAG parents).
--
-- work_request_dco: compiled WorkRequest DCO JSON attached to the
-- requirement after the semantic compiler runs.

CREATE TABLE nebula.architect_specs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title           text NOT NULL,
    requirement_id  uuid NOT NULL,  -- parent requirement (or the requirement itself if simple)
    work_request_id uuid,           -- parent WR if this is part of a DAG
    content         jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_architect_specs_requirement
    ON nebula.architect_specs (requirement_id);

CREATE INDEX idx_architect_specs_work_request
    ON nebula.architect_specs (work_request_id)
    WHERE work_request_id IS NOT NULL;

COMMENT ON TABLE nebula.architect_specs
    IS 'Architect specifications — audit trail for requirement analysis. Written by architect_process_todo cron.';

-- Add work_request_dco to requirements_history
ALTER TABLE nebula.requirements_history
    ADD COLUMN work_request_dco jsonb;
