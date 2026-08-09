-- ═══════════════════════════════════════════════════════════════════════
--  V082 — T01 Phase C: asset_id on nebula.work_requests
--                       + conduit.work_requests + backfill
--
--  Decision ref: 898a203b (architect, 2026-08-09)
--  Handoff: T01 asset_id migration phases V079–V083
--
--  nebula.work_requests is a VIEW on work_requests_history.
--  conduit.work_requests is a BASE TABLE (currently 0 rows).
--
--  Prerequisite: V079–V081.
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Add asset_id FK columns
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE nebula.work_requests_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

ALTER TABLE conduit.work_requests
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- ═══════════════════════════════════════════════════════════════════════
--  2. Create canonical_assets: nebula work_requests (kind = work_request)
--     sentinel: 9999-12-31 00:00:00+00
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_work_requests:' || id::text, 'work_request'
FROM nebula.work_requests_history
WHERE recorded_until_dt = '9999-12-31 00:00:00+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- conduit.work_requests has 0 rows — no backfill needed, but canonical
-- asset prefix is registered for future rows

-- ═══════════════════════════════════════════════════════════════════════
--  3. Set asset_id on current nebula work_request rows
-- ═══════════════════════════════════════════════════════════════════════

UPDATE nebula.work_requests_history wrh
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_work_requests:' || wrh.id::text
  AND ca.expired_at IS NULL
  AND wrh.asset_id IS NULL
  AND wrh.recorded_until_dt = '9999-12-31 00:00:00+00';

-- ═══════════════════════════════════════════════════════════════════════
--  4. Recreate view
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS nebula.work_requests CASCADE;
CREATE VIEW nebula.work_requests AS
SELECT
    id, title, description, source_specification_id, source_requirement_id,
    business_status, intent, context, constraints, created_by, created_at,
    updated_at, dco_json, legacy_id, plan_id, step_outputs, consumed_at,
    valid_from, valid_until, recorded_on_dt, recorded_until_dt, asset_id
FROM nebula.work_requests_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

-- ═══════════════════════════════════════════════════════════════════════
--  5. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_total integer;
    v_null  integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_total, v_null FROM nebula.work_requests;

    IF v_null > 0 THEN
        RAISE EXCEPTION 'V082 verify: % of % work_request rows still NULL', v_null, v_total;
    END IF;

    RAISE NOTICE '✅ V082 applied — asset_id on % nebula work_requests (0 NULL).', v_total;
END $$;

COMMIT;
