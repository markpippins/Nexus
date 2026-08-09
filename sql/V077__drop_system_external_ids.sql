-- ═══════════════════════════════════════════════════════════════════════
--  V077 — A4 teardown: drop nebula.system_external_ids view + table
--
--  Decision ref: 5d66278d (architect, 2026-08-08)
--  Depends on: V075 (asset_id backfill), V076 (view rewrite)
--  Prerequisite: all consumers re-pointed to asset_relation
--    (nebula-srv, semantics-srv, mesh-reconcile.py)
--
--  Drops the VIEW first (depends on the table), then the history table.
--  The bitemporal history rows are preserved: this only drops the live
--  table. History is append-only by doctrine; existing rows in
--  system_external_ids_history remain as audit artifacts.
--  (In practice we DROP CASCADE to clean up dependencies.)
--
--  SAFETY: run only after verifying consumers are re-pointed.
--    grep -r 'system_external_ids' typescript/ bin/ --include='*.ts' --include='*.py'
--    should return zero hits outside sql/ and docs/.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the live VIEW first (depends on the history table)
DROP VIEW IF EXISTS nebula.system_external_ids CASCADE;

-- Drop the history table
-- CASCADE cleans up any lingering indexes/constraints
DROP TABLE IF EXISTS nebula.system_external_ids_history CASCADE;

-- Verification
DO $$
BEGIN
    IF to_regclass('nebula.system_external_ids') IS NOT NULL THEN
        RAISE EXCEPTION 'V077 aborted: nebula.system_external_ids view still exists';
    END IF;
    IF to_regclass('nebula.system_external_ids_history') IS NOT NULL THEN
        RAISE EXCEPTION 'V077 aborted: nebula.system_external_ids_history table still exists';
    END IF;
    RAISE NOTICE '✅ V077 applied — system_external_ids junction dropped.';
END $$;

COMMIT;
