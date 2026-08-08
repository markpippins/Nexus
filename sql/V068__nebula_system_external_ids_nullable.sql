-- V068__nebula_system_external_ids_nullable.sql
-- Fixes for the V067 junction table discovered during initial population:
--   1. system_id must be nullable — rows are inserted first (NULL system_id),
--      then matched to nebula.systems later via UPDATE.
--   2. match_method check constraint extended to include 'direct_insert',
--      'identity_map_bridge', and 'path_match' — the methods used during
--      automated population from terrain, registry, semantics, and conduit.

BEGIN;

-- 1. Make system_id nullable (allows INSERT-before-UPDATE population pattern)
ALTER TABLE nebula.system_external_ids_history
    ALTER COLUMN system_id DROP NOT NULL;

-- 2. Extend match_method to include automated population methods
ALTER TABLE nebula.system_external_ids_history
    DROP CONSTRAINT IF EXISTS system_external_ids_history_match_method_check;

ALTER TABLE nebula.system_external_ids_history
    ADD CONSTRAINT system_external_ids_history_match_method_check
    CHECK (match_method IN (
        'exact_name',
        'fuzzy_name',
        'port_match',
        'workspace_path',
        'admission',
        'manual',
        'direct_insert',          -- initial population INSERT
        'identity_map_bridge',   -- bridged via registry.service_identity_map
        'path_match'             -- matched via terrain.workspace_path → nebula.systems.path
    ));

-- 3. Recreate the unique index to handle NULL system_id correctly.
--    PostgreSQL treats NULLs as distinct in UNIQUE indexes, so we need
--    a separate partial index for rows where system_id IS NULL to prevent
--    duplicate (source_schema, source_table, source_id) while unmatched.
DROP INDEX IF EXISTS nebula.uq_system_external_id_active;

-- For matched rows (system_id IS NOT NULL): full uniqueness
CREATE UNIQUE INDEX uq_system_external_id_active
    ON nebula.system_external_ids_history (system_id, source_schema, source_table, source_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
      AND system_id IS NOT NULL;

-- For unmatched rows (system_id IS NULL): prevent duplicate source IDs
CREATE UNIQUE INDEX uq_system_external_id_unmatched
    ON nebula.system_external_ids_history (source_schema, source_table, source_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
      AND system_id IS NULL;

COMMIT;
