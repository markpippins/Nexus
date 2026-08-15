-- ═══════════════════════════════════════════════════════════════════════
--  V092 — vision.work_requests asset guard (T01 regression fix, ratified)
--
--  Decision ref: dccc6478 (architect analysis, reopened 2026-08-11)
--  Thread:       8ab34be0 (to-do) — Engineer assignment 8210ea10
--  Q4 ruling:    04aaa78b (state-machine unification, C1/P1 context)
--
--  Problem: V089 was a one-shot backfill. Two settled WorkRequests created
--  after it (maint-2026-08-09-1733, wr-conf-001) missed canonical assets —
--  the "every live WR has a canonical asset" invariant is NOT enforced.
--
--  What this does:
--    1. `semantics.ensure_registered_work_request_asset(wr_uuid)` — idempotent
--       helper that creates the canonical_asset
--       (key `asset:nexus:vision_work_requests:<work_request_uuid>`,
--       kind `work_request`) and returns its id. No owns edge: vision
--       WorkRequests have no single owning system asset (mirrors V089, which
--       only registered assets; the conduit-plan→WR mapping is a separate
--       concern handled by the Q4 ledger work).
--    2. `BEFORE INSERT` trigger on vision.work_requests — every future WR
--       insert (runtime-kernel `db.ts` insertWorkRequest, conduit-srv
--       `routes/vision.ts` bridge) is auto asset-linked. BEFORE (not AFTER)
--       so NEW.asset_id is set before the row is written and
--       INSERT ... RETURNING carries the real asset_id. Unlike V090's
--       unconditional set, we guard on `NEW.asset_id IS NULL` so any future
--       caller that supplies an explicit asset_id wins.
--
--  NOT in scope (deliberately):
--    • `entity_key` — CCNF content identity (SHA256 over sorted
--      {domain,intent,actor,scope}, migration v37). It is supplied by
--      callers at WR creation, not derivable from work_request_uuid in SQL.
--      Wiring it at the application layer is part of Q4 ruling P1.
--
--  Idempotent: canonical_asset insert guarded by the partial unique index
--  (canonical_asset_id WHERE expired_at IS NULL); function/trigger use
--  CREATE OR REPLACE / DROP IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Helper function (idempotent)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION semantics.ensure_registered_work_request_asset(
    p_wr_uuid text
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_id      uuid;
    v_canonical_key text;
BEGIN
    v_canonical_key := 'asset:nexus:vision_work_requests:' || p_wr_uuid;

    -- (a) ensure the canonical asset for this work request exists
    INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
    VALUES (v_canonical_key, 'work_request')
    ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

    SELECT id INTO v_asset_id
    FROM semantics.canonical_asset
    WHERE canonical_asset_id = v_canonical_key
      AND expired_at IS NULL;

    IF v_asset_id IS NULL THEN
        RAISE EXCEPTION 'failed to create canonical asset for work request %', p_wr_uuid;
    END IF;

    RETURN v_asset_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  2. BEFORE INSERT trigger — auto asset-link every future WR insert.
--     Guarded on NEW.asset_id IS NULL so explicit callers win.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION semantics.vision_work_request_asset_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.asset_id IS NULL THEN
        NEW.asset_id := semantics.ensure_registered_work_request_asset(NEW.work_request_uuid);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vision_work_requests_asset ON vision.work_requests;
CREATE TRIGGER trg_vision_work_requests_asset
    BEFORE INSERT ON vision.work_requests
    FOR EACH ROW
    EXECUTE FUNCTION semantics.vision_work_request_asset_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  3. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_null  integer;
    v_total integer;
    v_tg    integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_total, v_null FROM vision.work_requests;

    SELECT count(*) INTO v_tg
    FROM pg_trigger
    WHERE tgname = 'trg_vision_work_requests_asset'
      AND tgrelid = 'vision.work_requests'::regclass
      AND NOT tgisinternal;

    IF v_null > 0 THEN
        RAISE EXCEPTION 'V092 verify: % of % vision.work_requests rows still NULL', v_null, v_total;
    END IF;
    IF v_tg = 0 THEN
        RAISE EXCEPTION 'V092 verify: trg_vision_work_requests_asset not found';
    END IF;

    RAISE NOTICE '✅ V092 applied — % vision.work_requests rows, 0 NULL, trigger live (id %).',
        v_total, v_tg;
END $$;

COMMIT;
