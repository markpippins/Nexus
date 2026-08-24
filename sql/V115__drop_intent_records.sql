-- V115: Drop intent_records (view + history) + intent_record_segment_sets + harvest_candidates.intent_record_id
--
-- Follow-up to engineer report 57dbe7a7 and commits 775ec1bb / eae39526:
-- runtime references to nebula.intent_records and harvest_candidates.intent_record_id
-- have been eliminated repo-wide (bin/, assembly-srv, assembly-mcp, assembly-ui,
-- angular/assembly, nebula-srv, nebula-ui). The data has been wiped.
--
-- This migration versions the DDL drop. Historical migrations (V043/V044/V059/V084/
-- V085, t25-chatgpt-corruption-expiration.sql, assembly-migration.sql) are left
-- immutable as the audit trail that created these objects.
--
-- IF EXISTS guards keep this safe to run on environments where the objects were
-- already dropped during the data wipe. harvest_candidates is a bitemporal VIEW
-- over harvest_candidates_history (V084 added intent_record_id to the history
-- table); the view is dropped and recreated without the column so environments
-- whose view still exposes it converge to the same state.

BEGIN;

-- 1. intent_records is a bitemporal view over intent_records_history (see V085) —
--    drop the view first, then the history table.
DROP VIEW IF EXISTS nebula.intent_records;
DROP TABLE IF EXISTS nebula.intent_records_history;

-- 2. Column on harvest_candidates_history (superseded by the N:1 work_request_id
--    linkage; no code references remain). The view is dropped/recreated so any
--    environment whose view still exposes intent_record_id converges too.
DROP VIEW IF EXISTS nebula.harvest_candidates;
ALTER TABLE nebula.harvest_candidates_history DROP COLUMN IF EXISTS intent_record_id;
CREATE VIEW nebula.harvest_candidates AS
SELECT id,
       harvest_id,
       title,
       intent_description,
       implementation_notes,
       code_snippets,
       open_questions,
       tags,
       status,
       system_id,
       subsystem_id,
       feature_id,
       valid_from,
       valid_until,
       created_at,
       updated_at,
       work_request_id,
       completed,
       compilation_readiness,
       type,
       design_rationale,
       provenance_block_indices,
       needs_new_node,
       proposed_parent,
       proposed_name,
       placement_reason,
       recorded_on_dt,
       recorded_until_dt,
       asset_id
FROM nebula.harvest_candidates_history
WHERE (now() >= recorded_on_dt)
  AND (now() < recorded_until_dt)
  AND (now() >= valid_from)
  AND (now() < valid_until);

-- 3. Segment-set bridge table (created by python/substance/001_segment_sets.sql;
--    no code references remain in scoped runtime paths).
DROP TABLE IF EXISTS nebula.intent_record_segment_sets;

COMMIT;