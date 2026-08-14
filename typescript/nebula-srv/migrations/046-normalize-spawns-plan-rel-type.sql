-- Migration 046: T22 Step 5.4 follow-up — canonicalize the legacy unprefixed
-- 'spawns_plan' rel_type to 'ag:spawns_plan' (the formal taxonomy value for
-- the harvest_candidate → plan curated overlay edge).
--
-- This is a 1:1 label canonicalization (migration-006 precedent: 'depends_on'
-- → 'wrp:depends_on'), NOT a backfill of the causation chain. Column-based
-- linkage remains canonical for requirement→plan (conduit_plan_id) and
-- plan→WR (plan_id). Only the four legacy 'spawns_plan' rows are affected, so
-- the reverse-lookup reads (now querying 'ag:spawns_plan') keep resolving them.
--
-- Rollback:
--   UPDATE nebula.cross_references_history
--      SET rel_type = 'spawns_plan'
--    WHERE rel_type = 'ag:spawns_plan'
--      AND target_id IN ('9999', 'FINAL-TEST-PLAN', '1058', 'TEST-PLAN-XREF');

BEGIN;

UPDATE nebula.cross_references_history
   SET rel_type = 'ag:spawns_plan'
 WHERE rel_type = 'spawns_plan';

INSERT INTO nebula.schema_version (version, description)
VALUES (46, 'T22 Step 5.4: canonicalize legacy spawns_plan rel_type to ag:spawns_plan')
ON CONFLICT (version) DO NOTHING;

COMMIT;
