-- Migration v30: Migrate TEXT timestamp columns to TIMESTAMPTZ
-- Scope: vision and peb tables
-- Applied: 2026-07-12 02:18:23
--
-- Tables covered:
--   vision.receipts              (created_at)
--   vision.tickets               (created_at, claimed_at, closed_at, expires_at)
--   peb.role_circuit_breaker     (tripped_at, updated_at)
--
-- IMPORTANT: conduit.plan_status VIEW depends on vision.receipts.created_at.
-- The view must be dropped before ALTER TYPE and recreated after.
-- plans_by_status view is also recreated.

-- ═══════════════════════════════════════════════════════════════════
-- Pre-step: drop dependent views
-- ═══════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS conduit.plan_status CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- vision tables
-- ═══════════════════════════════════════════════════════════════════

-- vision.receipts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='vision' AND table_name='receipts'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE vision.receipts ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

-- vision.tickets
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='vision' AND table_name='tickets'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE vision.tickets ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='vision' AND table_name='tickets'
    AND column_name='claimed_at' AND data_type='text') THEN
    ALTER TABLE vision.tickets ALTER COLUMN claimed_at TYPE TIMESTAMPTZ
      USING CASE WHEN claimed_at = '' THEN NULL
                 WHEN claimed_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(claimed_at, 'Z', '')::timestamptz
                 ELSE claimed_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='vision' AND table_name='tickets'
    AND column_name='closed_at' AND data_type='text') THEN
    ALTER TABLE vision.tickets ALTER COLUMN closed_at TYPE TIMESTAMPTZ
      USING CASE WHEN closed_at = '' THEN NULL
                 WHEN closed_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(closed_at, 'Z', '')::timestamptz
                 ELSE closed_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='vision' AND table_name='tickets'
    AND column_name='expires_at' AND data_type='text') THEN
    ALTER TABLE vision.tickets ALTER COLUMN expires_at TYPE TIMESTAMPTZ
      USING CASE WHEN expires_at = '' THEN NULL
                 WHEN expires_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(expires_at, 'Z', '')::timestamptz
                 ELSE expires_at::timestamptz END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- peb tables
-- ═══════════════════════════════════════════════════════════════════

-- peb.role_circuit_breaker
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='peb' AND table_name='role_circuit_breaker'
    AND column_name='tripped_at' AND data_type='text') THEN
    ALTER TABLE peb.role_circuit_breaker ALTER COLUMN tripped_at TYPE TIMESTAMPTZ
      USING CASE WHEN tripped_at = '' THEN NULL
                 WHEN tripped_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(tripped_at, 'Z', '')::timestamptz
                 ELSE tripped_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='peb' AND table_name='role_circuit_breaker'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE peb.role_circuit_breaker ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Post-step: recreate dependent views
-- ═══════════════════════════════════════════════════════════════════

CREATE VIEW conduit.plan_status AS
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

CREATE VIEW conduit.plans_by_status AS
SELECT
  ps.id, ps.file_name, ps.title, ps.project, ps.goal, ps.content,
  ps.files_affected, ps.acceptance_criteria, ps.dependencies,
  ps.prompt_ref, ps.notes, ps.priority, ps.deleted,
  ps.created_at, ps.updated_at, ps.derived_status AS status
FROM conduit.plan_status ps;
