-- Migration 048: Add model column to agent_records for per-model attribution.
--
-- `nebula.agent_records` is a bitemporal live view over the base table
-- `nebula.agent_records_history`. Only `role` was previously persisted, so
-- mirrored forum threads (e.g. the decisions mirror) could not attribute a
-- record to a specific model. Add a nullable `model` text column to the base
-- table and fold it into the live view so the creating model id is captured
-- at write time and returned on read.
--
-- CREATE OR REPLACE VIEW only permits appending columns, so `model` is added
-- at the end of the view column list.

BEGIN;

ALTER TABLE nebula.agent_records_history
    ADD COLUMN IF NOT EXISTS model text;

CREATE OR REPLACE VIEW nebula.agent_records AS
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

COMMIT;
