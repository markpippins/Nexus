-- V121 — Add candidate_id and requirement_id FK columns to nebula.agent_records
--
-- The linkage audit found 0 complete candidate→requirement→agent_record
-- chains. Adding proper FK columns allows structural joins instead of the
-- keyword-matching fallback in _query_audit_records().
--
-- nebula.agent_records is a bitemporal VIEW over agent_records_history.
-- Columns are added to the history table; the view is then re-created.
--
-- Idempotent: IF NOT EXISTS guards on columns; DROP VIEW IF EXISTS
-- before CREATE VIEW to handle positional column changes safely.

BEGIN;

-- 1. Add columns to the underlying history table
ALTER TABLE nebula.agent_records_history
  ADD COLUMN IF NOT EXISTS candidate_id    uuid,
  ADD COLUMN IF NOT EXISTS requirement_id  uuid;

-- 2. Indexes on the history table (where data actually lives)
CREATE INDEX IF NOT EXISTS idx_agent_records_history_candidate_id
  ON nebula.agent_records_history (candidate_id)
  WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_records_history_requirement_id
  ON nebula.agent_records_history (requirement_id)
  WHERE requirement_id IS NOT NULL;

-- 3. Re-create the view — DROP first because CREATE OR REPLACE cannot
--    change column positions (the view is auto-generated from the
--    history table and has no manual grants or dependencies).
DROP VIEW IF EXISTS nebula.agent_records;

CREATE VIEW nebula.agent_records AS
  SELECT id,
    record_type,
    role,
    title,
    content,
    source_path,
    metadata,
    tags,
    system_id,
    subsystem_id,
    feature_id,
    plan_ref,
    candidate_id,
    requirement_id,
    created_at,
    level,
    visibility_scope,
    recorded_on_dt,
    recorded_until_dt,
    valid_from,
    valid_until,
    model
  FROM nebula.agent_records_history
  WHERE now() >= recorded_on_dt
    AND now() < recorded_until_dt
    AND now() >= valid_from
    AND now() < valid_until;

-- 4. Column comments (on the history table since the view projects it)
COMMENT ON COLUMN nebula.agent_records_history.candidate_id IS
  'FK to nebula.harvest_candidates.id — populated during promotion-flow stage-3.';
COMMENT ON COLUMN nebula.agent_records_history.requirement_id IS
  'FK to nebula.requirements.id — populated when a requirement spawns from a candidate.';

COMMIT;