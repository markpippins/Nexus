-- V5: Remove duplicate old-format category entries
--
-- The V3 and V4 migrations renamed the type lookup tables (framework_type,
-- service_type, server_type, environment_type, operating_systems) from
-- UPPERCASE_UNDERSCORE to Proper Case. The registry.categories table,
-- however, is a separate denormalized table with its own rows keyed by
-- a `type` discriminator. It accumulated duplicate entries — the old
-- UPPERCASE names (e.g. "JAVA_SPRING") alongside the new Proper Case
-- names (e.g. "Java Spring") — from a seed process that pulled from the
-- type tables.
--
-- This migration removes the old duplicates where a Proper Case
-- equivalent already exists for the same type discriminator, then
-- rewrites the id sequence to avoid gaps.

BEGIN;

-- ------------------------------------------------------------------
-- Step 1: Delete old uppercase entries that have a Proper Case
--         equivalent in the same type discriminator.
--
-- The WHERE condition matches rows whose name is all-uppercase (old
-- seed format) and for which a non-uppercase row with the same
-- normalized name exists in the same type bucket.
-- ------------------------------------------------------------------
DELETE FROM registry.categories c1
WHERE c1.name = UPPER(c1.name)                    -- old all-uppercase format
  AND c1.name != 'NONE'                            -- preserve NONE (already clean)
  AND c1.type != 'library_type'                    -- library_type was never affected
  AND EXISTS (
    SELECT 1 FROM registry.categories c2
    WHERE c2.type = c1.type
      AND c2.name != UPPER(c2.name)                -- c2 is a Proper Case row
      AND REPLACE(LOWER(c2.name), ' ', '_')        -- normalize: spaces→underscores
          = REPLACE(LOWER(c1.name), ' ', '_')      -- then compare case-insensitively
  );

-- ------------------------------------------------------------------
-- Step 2: Reset the id sequence to avoid gaps from deleted rows.
-- ------------------------------------------------------------------
SELECT setval(
    pg_get_serial_sequence('registry.categories', 'id'),
    COALESCE((SELECT MAX(id) FROM registry.categories), 0) + 1,
    false
);

COMMIT;
