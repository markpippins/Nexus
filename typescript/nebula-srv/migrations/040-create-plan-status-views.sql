-- ═══════════════════════════════════════════════════════════════════════
--  Migration 040 — Canonical plan_status / plans_by_status views
--
--  These views derive plan state from nebula.plans + vision.receipts and
--  are the authoritative source of derived_status for the WRP pipeline.
--  Previously created by conduit-mcp's createSchema(); now owned here.
--
--  This migration:
--    1. Creates nebula.plan_status (full derived_status logic)
--    2. Creates nebula.plans_by_status (reads from nebula.plan_status)
--    3. Drops conduit.plan_status / conduit.plans_by_status if present
--       (they were created by migration 016 for backward compat; no longer
--       needed now that all runtime code uses nebula.plan_status)
--
--  All views use CREATE OR REPLACE VIEW for idempotency.
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 040-create-plan-status-views.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Create nebula.plan_status — canonical derived_status from receipts
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW nebula.plan_status AS
SELECT
  p.*,
  CASE
    -- HOLD: highest priority — if the latest receipt is HOLD, show it regardless
    WHEN EXISTS (
      SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'HOLD'
      AND NOT EXISTS (
        SELECT 1 FROM vision.receipts r2
        WHERE r2.plan_id = p.id
        AND r2.type IN ('CANCELLED', 'ABANDONED')
        AND r2.created_at > r.created_at
      )
    ) THEN 'HOLD'
    -- REQUEUED: circuit breaker reset — checked early so it can override even
    -- REVIEW_PASS (e.g. plan was completed, then manually requeued for retry).
    WHEN (
      SELECT r.type FROM vision.receipts r
      WHERE r.plan_id = p.id
      AND r.type NOT IN ('PLANNING', 'HOLD')
      ORDER BY r.created_at DESC LIMIT 1
    ) = 'REQUEUED' THEN 'PLAN_CREATE'
    -- REVIEW_PASS — terminal success, unless overridden by later BLOCK/PLAN_BLOCK
    WHEN EXISTS (
      SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
      AND NOT EXISTS (
        SELECT 1 FROM vision.receipts r2
        WHERE r2.plan_id = p.id
        AND r2.type IN ('BLOCK', 'PLAN_BLOCK', 'CANCELLED', 'ABANDONED')
        AND r2.created_at > r.created_at
      )
    ) THEN 'REVIEW_PASS'
    -- REVIEW_REJECT — show latest non-BLOCK receipt or fallback to PLAN_CREATE
    WHEN EXISTS (
      SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
    ) THEN COALESCE(
      (SELECT r.type FROM vision.receipts r
       WHERE r.plan_id = p.id
       AND r.type != 'BLOCK'
       ORDER BY r.created_at DESC LIMIT 1),
      'PLAN_CREATE'
    )
    ELSE COALESCE(
      (SELECT r.type FROM vision.receipts r
       WHERE r.plan_id = p.id
       AND r.type NOT IN ('PLANNING', 'HOLD')
       ORDER BY r.created_at DESC LIMIT 1),
      (SELECT r.type FROM vision.receipts r
       WHERE r.plan_id = p.id
       ORDER BY r.created_at DESC LIMIT 1),
      NULL
    )
  END AS derived_status
FROM nebula.plans p
WHERE p.deleted = 0;

-- ═══════════════════════════════════════════════════════════════════════
--  2. Create nebula.plans_by_status — derived_status aliased as status
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW nebula.plans_by_status AS
SELECT
  ps.id,
  ps.file_name,
  ps.title,
  ps.project,
  ps.goal,
  ps.content,
  ps.files_affected,
  ps.acceptance_criteria,
  ps.dependencies,
  ps.prompt_ref,
  ps.notes,
  ps.priority,
  ps.deleted,
  ps.created_at,
  ps.updated_at,
  ps.derived_status AS status
FROM nebula.plan_status ps;

-- ═══════════════════════════════════════════════════════════════════════
--  3. Drop legacy conduit views (created by migration 016 for backward
--     compat; no longer needed)
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS conduit.plans_by_status CASCADE;
DROP VIEW IF EXISTS conduit.plan_status CASCADE;

-- Also drop temporal.plan_status if it exists (was a mirror of conduit)
DROP VIEW IF EXISTS temporal.plan_status CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
--  4. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM nebula.plan_status;
  RAISE NOTICE '✅ Migration 040: nebula.plan_status has % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM nebula.plans_by_status;
  RAISE NOTICE '✅ Migration 040: nebula.plans_by_status has % rows', v_count;

  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'conduit' AND table_name = 'plan_status'
  ) THEN
    RAISE WARNING '⚠ conduit.plan_status still exists (should have been dropped)';
  ELSE
    RAISE NOTICE '✅ Migration 040: conduit views dropped';
  END IF;
END $$;

COMMIT;
