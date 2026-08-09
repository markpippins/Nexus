-- ═══════════════════════════════════════════════════════════════════════
--  V089 — T01 Phase C follow-up: asset_id on vision.work_requests
--  (renumbered from V086 on 2026-08-09 — V086 was already taken by
--   V086__tackle_roles_updated_at_trigger.sql, commit 7f3b2ed)
--
--  Decision ref: 898a203b (architect, 2026-08-09)
--  Finding:      dccc6478-0a71-4ac4-93db-9698cb335071 (architect analysis)
--  Thread:       to-do/8ab34be0 (reply 893655aa)
--
--  V082 added asset_id to nebula.work_requests_history + conduit.work_requests,
--  but the conduit-mcp runtime store is vision.work_requests (migration v13
--  replaced the legacy conduit.work_requests view with a vision base table;
--  runtime-kernel.ts reads ${VISION_SCHEMA}.work_requests). conduit.work_requests
--  has 0 rows; vision.work_requests has the 22 live runtime WorkRequests
--  (12 settled, 6 deferred, 1 noop, 1 draft, 1 failed, 1 rejected) which
--  never received canonical assets.
--
--  Prerequisite: V079–V083.
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Add asset_id FK column
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE vision.work_requests
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- ═══════════════════════════════════════════════════════════════════════
--  2. Create canonical_assets for the 22 runtime work_requests
--     (keyed on work_request_uuid, which is NOT NULL + UNIQUE)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:vision_work_requests:' || work_request_uuid, 'work_request'
FROM vision.work_requests
WHERE asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  3. Set asset_id on vision.work_requests rows
-- ═══════════════════════════════════════════════════════════════════════

UPDATE vision.work_requests vwr
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:vision_work_requests:' || vwr.work_request_uuid
  AND ca.expired_at IS NULL
  AND vwr.asset_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  4. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_total integer;
    v_null  integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_total, v_null FROM vision.work_requests;

    IF v_null > 0 THEN
        RAISE EXCEPTION 'V089 verify: % of % vision.work_requests rows still NULL', v_null, v_total;
    END IF;

    RAISE NOTICE '✅ V089 applied — asset_id on % vision.work_requests (0 NULL).', v_total;
END $$;

COMMIT;
