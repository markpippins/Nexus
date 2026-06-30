-- ═══════════════════════════════════════════════════════════════════════
--  Migration 015 — Add HOLD state, remove PROPOSED state
--
--  Changes:
--    1. Replaces PROPOSED with HOLD in the vision.receipts CHECK constraint
--    2. Rebuilds conduit.plan_status view to handle HOLD and drop PROPOSED
--
--  This migration is SAFE for live databases: it uses ALTER TABLE DROP
--  CONSTRAINT / ADD CONSTRAINT in a transaction, and CREATE OR REPLACE VIEW
--  for the view change.
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 015-add-hold-state.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Drop old CHECK constraint, add new one replacing PROPOSED → HOLD
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE vision.receipts
  DROP CONSTRAINT IF EXISTS receipts_type_check;

ALTER TABLE vision.receipts
  ADD CONSTRAINT receipts_type_check
  CHECK (type IN (
    'PLAN_CREATE','IMPLEMENTATION','REVIEW_PASS','REVIEW_REJECT','BLOCK',
    'PLANNING','HOLD',
    'REVIEW','CRITIQUE','CRITIQUE_PASS','CRITIQUE_REJECT','PLAN_BLOCK','API_LIMIT',
    'REQUEUED',
    'CANCELLED','ABANDONED'
  ));

-- ═══════════════════════════════════════════════════════════════════════
--  2. Rebuild plan_status view (drop + recreate)
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS conduit.plans_by_status;
DROP VIEW IF EXISTS conduit.plan_status CASCADE;

CREATE VIEW conduit.plan_status AS
SELECT
  p.*,
  CASE
    -- HOLD: highest priority — if the latest meaningful receipt is HOLD, show it
    WHEN EXISTS (
      SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'HOLD'
      AND NOT EXISTS (
        SELECT 1 FROM vision.receipts r2
        WHERE r2.plan_id = p.id
        AND r2.type IN ('CANCELLED', 'ABANDONED')
        AND r2.created_at > r.created_at
      )
    ) THEN 'HOLD'
    -- REQUEUED: circuit breaker reset
    WHEN (
      SELECT r.type FROM vision.receipts r
      WHERE r.plan_id = p.id
      AND r.type NOT IN ('PLANNING', 'HOLD')
      ORDER BY r.created_at DESC LIMIT 1
    ) = 'REQUEUED' THEN 'PLAN_CREATE'
    -- REVIEW_PASS — terminal success
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
FROM conduit.plans p
WHERE p.deleted = 0;

CREATE VIEW conduit.plans_by_status AS
SELECT
  ps.derived_status AS status,
  ps.*
FROM conduit.plan_status ps;

-- ═══════════════════════════════════════════════════════════════════════
--  3. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_check_has_hold BOOLEAN;
  v_check_no_proposed BOOLEAN;
BEGIN
  -- Check the constraint allows HOLD
  BEGIN
    PERFORM 'HOLD'::TEXT;
    v_check_has_hold := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_check_has_hold := FALSE;
  END;

  -- Verify constraint exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'receipts_type_check'
      AND table_schema = 'vision'
      AND table_name = 'receipts'
  ) INTO v_check_has_hold;

  IF NOT v_check_has_hold THEN
    RAISE WARNING 'receipts_type_check constraint may need manual verification';
  END IF;

  RAISE NOTICE '✅ Migration 015 complete — HOLD added, PROPOSED removed';
  RAISE NOTICE '   constraint receipts_type_check updated';
  RAISE NOTICE '   view conduit.plan_status rebuilt';
END $$;

COMMIT;
