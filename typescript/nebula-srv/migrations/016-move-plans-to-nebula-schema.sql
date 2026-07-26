-- ═══════════════════════════════════════════════════════════════════════
--  Migration 016 — Move conduit.plans to nebula schema
--
--  Physically moves the conduit.plans table to the nebula schema so that
--  implementation plans live alongside Requirements as first-class nebula
--  entities. This enables direct JOINs across plans, requirements, systems,
--  and harvests without cross-schema references.
--
--  Changes:
--    1. ALTER TABLE conduit.plans SET SCHEMA nebula  (physical move)
--    2. Rebuild conduit.plan_status to reference nebula.plans
--    3. Rebuild conduit.plans_by_status on top of plan_status
--    4. Update temporal views if they exist
--
--  Backward compatibility: conduit.plan_status and conduit.plans_by_status
--  views remain in the conduit schema so existing queries continue to work.
--  The only change is that their FROM clause now points to nebula.plans.
--
--  After this migration:
--    - Raw data lives in:  nebula.plans
--    - Derived views at:   conduit.plan_status (references nebula.plans)
--                          conduit.plans_by_status
--    - Conduit still owns the schema for: sessions, circuit_breaker,
--      model_pricing, agent_budgets, cost_logs, schema_version
--
--  Run AFTER: 015-add-hold-state.sql (or equivalent view in conduit schema)
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 016-move-plans-to-nebula-schema.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Move the plans table to nebula schema
-- ═══════════════════════════════════════════════════════════════════════

-- Check that the conduit schema and table exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'conduit' AND table_name = 'plans'
  ) THEN
    RAISE EXCEPTION 'conduit.plans does not exist — is the conduit schema initialized?';
  END IF;
END $$;

ALTER TABLE IF EXISTS conduit.plans SET SCHEMA nebula;

-- ═══════════════════════════════════════════════════════════════════════
--  2. Rebuild conduit.plan_status view to reference nebula.plans
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS conduit.plans_by_status CASCADE;
DROP VIEW IF EXISTS conduit.plan_status CASCADE;

CREATE VIEW conduit.plan_status AS
SELECT
  p.*,
  CASE
    -- HOLD: highest priority
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
FROM nebula.plans p
WHERE p.deleted = 0;

CREATE VIEW conduit.plans_by_status AS
SELECT
  ps.derived_status AS status,
  ps.*
FROM conduit.plan_status ps;

-- ═══════════════════════════════════════════════════════════════════════
--  3. Update legacy temporal views if they exist
-- ═══════════════════════════════════════════════════════════════════════

-- temporal.plans used to point to conduit.plans — redirect to nebula.plans
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'temporal' AND table_name = 'plans'
  ) THEN
    CREATE OR REPLACE VIEW temporal.plans AS SELECT * FROM nebula.plans;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'temporal' AND table_name = 'plan_status'
  ) THEN
    CREATE OR REPLACE VIEW temporal.plan_status AS SELECT * FROM conduit.plan_status;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  4. Create nebula.plan_status as canonical view (full definition,
--     not a mirror of conduit)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW nebula.plan_status AS
SELECT
  p.*,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'HOLD'
      AND NOT EXISTS (
        SELECT 1 FROM vision.receipts r2
        WHERE r2.plan_id = p.id
        AND r2.type IN ('CANCELLED', 'ABANDONED')
        AND r2.created_at > r.created_at
      )
    ) THEN 'HOLD'
    WHEN (
      SELECT r.type FROM vision.receipts r
      WHERE r.plan_id = p.id
      AND r.type NOT IN ('PLANNING', 'HOLD')
      ORDER BY r.created_at DESC LIMIT 1
    ) = 'REQUEUED' THEN 'PLAN_CREATE'
    WHEN EXISTS (
      SELECT 1 FROM vision.receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
      AND NOT EXISTS (
        SELECT 1 FROM vision.receipts r2
        WHERE r2.plan_id = p.id
        AND r2.type IN ('BLOCK', 'PLAN_BLOCK', 'CANCELLED', 'ABANDONED')
        AND r2.created_at > r.created_at
      )
    ) THEN 'REVIEW_PASS'
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
--  5. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_table_schema TEXT;
  v_view_works BOOLEAN;
BEGIN
  -- Check plans table is now in nebula schema
  SELECT table_schema INTO v_table_schema
  FROM information_schema.tables
  WHERE table_name = 'plans' AND table_schema = 'nebula';

  IF v_table_schema IS NULL THEN
    RAISE EXCEPTION '❌ nebula.plans does not exist after migration';
  END IF;

  -- Check conduit.plan_status view exists and is valid
  BEGIN
    PERFORM * FROM conduit.plan_status LIMIT 0;
    v_view_works := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_view_works := FALSE;
  END;

  IF NOT v_view_works THEN
    RAISE EXCEPTION '❌ conduit.plan_status view is invalid after migration';
  END IF;

  -- Check no plans table remains in conduit schema
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'conduit' AND table_name = 'plans'
  ) THEN
    RAISE WARNING 'conduit.plans still exists (should have been moved)';
  END IF;

  RAISE NOTICE '✅ Migration 016 complete: conduit.plans → nebula.plans';
  RAISE NOTICE '   Table now lives in: nebula.plans';
  RAISE NOTICE '   conduit.plan_status → references nebula.plans';
  RAISE NOTICE '   conduit.plans_by_status → references conduit.plan_status';
  RAISE NOTICE '   nebula.plan_status → canonical view (full derived_status logic)';
END $$;

COMMIT;
