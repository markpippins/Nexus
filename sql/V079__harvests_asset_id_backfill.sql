-- ═══════════════════════════════════════════════════════════════════════
--  V079 — T01 Phase A-1: asset_id on nebula.harvests + backfill
--
--  Decision ref: 898a203b (architect, 2026-08-09)
--  Handoff: T01 asset_id migration phases V079–V083
--
--  Adds asset_id uuid FK → semantics.canonical_asset(id) to
--  nebula.harvests_history, backfills canonical assets for all
--  current-valid harvest rows (asset_kind = 'document'), then
--  recreates the nebula.harvests view.
--
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add nullable asset_id FK to the base history table
ALTER TABLE nebula.harvests_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- 2. Create canonical_assets for current harvest rows (deterministic, idempotent)
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_harvests:' || id::text, 'document'
FROM nebula.harvests_history
WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- 3. Set asset_id on current harvest rows
UPDATE nebula.harvests_history hh
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_harvests:' || hh.id::text
  AND ca.expired_at IS NULL
  AND hh.asset_id IS NULL
  AND hh.recorded_until_dt = '9999-12-31 23:59:59+00';

-- 4. Recreate view to include asset_id
DROP VIEW IF EXISTS nebula.harvests CASCADE;
CREATE VIEW nebula.harvests AS
SELECT
    id, source_path, source_filename, model, total_candidates,
    candidates, source_text, tags, metadata, created_at,
    level, visibility_scope, docklang, source_hash, file_size,
    version, run_metadata, recorded_on_dt, recorded_until_dt,
    valid_from, valid_until, asset_id
FROM nebula.harvests_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

-- 5. Verify
DO $$
DECLARE
    v_null_count integer;
    v_total integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_total, v_null_count
    FROM nebula.harvests;

    IF v_null_count > 0 THEN
        RAISE EXCEPTION 'V079 verify: % of % harvest rows still have NULL asset_id', v_null_count, v_total;
    END IF;

    RAISE NOTICE '✅ V079 applied — asset_id added to % harvest rows, 0 NULL.', v_total;
END $$;

COMMIT;
