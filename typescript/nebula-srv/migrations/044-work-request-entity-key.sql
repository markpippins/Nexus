-- Migration 044: T22 entity_key persistence staging (per T08 DECIDED)
--
-- NOTE (engineer finding, T22 Step 3): `nebula.work_requests` is an
-- active-row VIEW over the bitemporal base table `nebula.work_requests_history`
-- (SCD-type-4: `now() >= recorded_on_dt AND now() < recorded_until_dt AND
-- now() >= valid_from AND now() < valid_until`). The entity_key column must
-- therefore land on the HISTORY table and be projected through the view.
--
-- Uniqueness: the breakdown calls for a "partial UNIQUE index". A UNIQUE
-- index on the history table is intentionally NOT applied here — when a
-- work_request gains a second temporal version (new valid_from/recorded_on_dt
-- row), that row carries the SAME entity_key (same entity identity), which
-- would violate a plain UNIQUE(entity_key). Lookup index only; uniqueness
-- enforcement is flagged to the architect for a current-valid-scoped design
-- (see engineer escalation record).
--
-- Historical rows keep entity_key = NULL ("identity-unknown"); no retroactive
-- computation. Emission is blocked on T07. Reference key computation: V093 /
-- nexus_core/wrp/identity.py (SHA256 over sorted {domain,intent,actor,scope}).
-- Rollback: DROP INDEX + DROP COLUMN + recreate view without entity_key.

BEGIN;

ALTER TABLE nebula.work_requests_history
  ADD COLUMN IF NOT EXISTS entity_key text;

COMMENT ON COLUMN nebula.work_requests_history.entity_key IS
  'T22 (T08): deterministic entity identity key emitted at the WRP boundary. NULL = identity-unknown (historical rows, not retroactively computed).';

CREATE INDEX IF NOT EXISTS idx_work_requests_history_entity_key
  ON nebula.work_requests_history (entity_key)
  WHERE entity_key IS NOT NULL;

-- Recreate the active-row view to project entity_key (appended last).
CREATE OR REPLACE VIEW nebula.work_requests AS
  SELECT id,
         title,
         description,
         source_specification_id,
         source_requirement_id,
         business_status,
         intent,
         context,
         constraints,
         created_by,
         created_at,
         updated_at,
         dco_json,
         legacy_id,
         plan_id,
         step_outputs,
         consumed_at,
         valid_from,
         valid_until,
         recorded_on_dt,
         recorded_until_dt,
         asset_id,
         entity_key
    FROM nebula.work_requests_history
   WHERE now() >= recorded_on_dt
     AND now() < recorded_until_dt
     AND now() >= valid_from
     AND now() < valid_until;

INSERT INTO nebula.schema_version (version, description)
VALUES (44, 'T22 entity_key staging: nullable entity_key on nebula.work_requests_history + view projection (uniqueness deferred to architect)')
ON CONFLICT (version) DO NOTHING;

COMMIT;
