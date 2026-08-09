-- V085: Drop deprecated intent_records.candidate_id
-- After V084 backfilled harvest_candidates.intent_record_id, the old
-- 1:1 candidate_id FK on intent_records is superseded by the N:1
-- intent_record_id FK on harvest_candidates.
--
-- Routes in nebula-srv already re-pointed from hc.id = ir.candidate_id
-- to hc.intent_record_id = ir.id.

BEGIN;

-- 1. Drop the view first (CASCADE not needed — we own it)
DROP VIEW nebula.intent_records;

-- 2. Drop column from history table
ALTER TABLE nebula.intent_records_history DROP COLUMN candidate_id;

-- 3. Recreate view without candidate_id
CREATE VIEW nebula.intent_records AS
SELECT id,
       parent_id,
       title,
       description,
       source_type,
       source_ref,
       tags,
       status,
       metadata,
       created_at,
       updated_at,
       valid_from,
       valid_until,
       recorded_on_dt,
       recorded_until_dt
FROM nebula.intent_records_history irh
WHERE (now() >= recorded_on_dt)
  AND (now() < recorded_until_dt)
  AND (now() >= valid_from)
  AND (now() < valid_until);

COMMIT;
