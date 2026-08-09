-- ═══════════════════════════════════════════════════════════════════════
--  V078 — A4 teardown: drop registry.service_identity_map
--
--  Decision ref: 5d66278d (architect, 2026-08-08)
--  Depends on: V075 (asset_id backfill), V076 (view rewrite),
--              V077 (system_external_ids dropped)
--  Prerequisite: all consumers re-pointed to asset_relation
--    (mesh-reconcile.py uses asset_relation fallback-first;
--     v_system_inventory rewritten in V076)
--
--  Drops the convenience VIEW first, then the table.
--  Identity information is now captured in:
--    - semantics.canonical_asset (shared asset for safe pairs)
--    - semantics.asset_identity_claim (weak pairs, open for resolution)
--    - semantics.asset_relation (equivalent edges)
--
--  SAFETY: run only after V077 is applied and all consumers verify green.
--    grep -r 'service_identity_map' typescript/ bin/ --include='*.ts' --include='*.py'
--    should show only the fallback in mesh-reconcile.py (still safe to run V078).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the convenience VIEW first
DROP VIEW IF EXISTS registry.v_service_identity_map CASCADE;

-- Drop the table
DROP TABLE IF EXISTS registry.service_identity_map CASCADE;

-- Verification
DO $$
BEGIN
    IF to_regclass('registry.service_identity_map') IS NOT NULL THEN
        RAISE EXCEPTION 'V078 aborted: registry.service_identity_map table still exists';
    END IF;
    IF to_regclass('registry.v_service_identity_map') IS NOT NULL THEN
        RAISE EXCEPTION 'V078 aborted: registry.v_service_identity_map view still exists';
    END IF;
    RAISE NOTICE '✅ V078 applied — service_identity_map dropped.';
END $$;

COMMIT;
