-- V6: Consolidate duplicate "Other" entry in framework_type
--
-- After the V3/V4 name changes and V5 duplicate cleanup, framework_type
-- still has two "Other" rows: id=2 (used by Spring Boot, Quarkus) and
-- id=49 (used by Alpine.js, HTMX, Meteor, etc.). The JSON seed source
-- only defines one "Other" entry, so the extra row is an orphan from
-- earlier seeding.
--
-- This migration re-points the 8 frameworks referencing id=49 to id=2,
-- then deletes the duplicate row.

BEGIN;

-- Step 1: Update FK references from the duplicate (id=49) to the canonical (id=2)
UPDATE registry.frameworks
SET category_id = 2
WHERE category_id = 49;

-- Step 2: Delete the duplicate "Other" row
DELETE FROM registry.framework_type WHERE id = 49;

COMMIT;
