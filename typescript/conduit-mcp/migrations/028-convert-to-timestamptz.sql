-- Migration v28: Migrate TEXT timestamp columns to TIMESTAMPTZ
-- Scope: conduit utility tables
-- Applied: 2026-07-12 01:54:33
--
-- Tables covered:
--   conduit.cost_logs           (recorded_at)
--   conduit.model_pricing       (updated_at)
--   conduit.agent_budgets       (reset_at, updated_at)
--   conduit.pipeline_cursor     (updated_at)
--   conduit.role_circuit_breaker (created_at, tripped_at, updated_at)
--
-- Special handling: role_circuit_breaker.created_at had DEFAULT ''::text,
-- which must be dropped before ALTER TYPE. Restored to DEFAULT NOW() after.

-- ═══════════════════════════════════════════════════════════════════
-- Pre-step: drop TEXT default on role_circuit_breaker.created_at
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE conduit.role_circuit_breaker ALTER COLUMN created_at DROP DEFAULT;

-- ═══════════════════════════════════════════════════════════════════
-- conduit utility tables
-- ═══════════════════════════════════════════════════════════════════

-- conduit.cost_logs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='cost_logs'
    AND column_name='recorded_at' AND data_type='text') THEN
    ALTER TABLE conduit.cost_logs ALTER COLUMN recorded_at TYPE TIMESTAMPTZ
      USING CASE WHEN recorded_at = '' THEN NULL
                 WHEN recorded_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(recorded_at, 'Z', '')::timestamptz
                 ELSE recorded_at::timestamptz END;
  END IF;
END $$;

-- conduit.model_pricing
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='model_pricing'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE conduit.model_pricing ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- conduit.agent_budgets
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='agent_budgets'
    AND column_name='reset_at' AND data_type='text') THEN
    ALTER TABLE conduit.agent_budgets ALTER COLUMN reset_at TYPE TIMESTAMPTZ
      USING CASE WHEN reset_at = '' THEN NULL
                 WHEN reset_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(reset_at, 'Z', '')::timestamptz
                 ELSE reset_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='agent_budgets'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE conduit.agent_budgets ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- conduit.pipeline_cursor
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='pipeline_cursor'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE conduit.pipeline_cursor ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- conduit.role_circuit_breaker
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='role_circuit_breaker'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE conduit.role_circuit_breaker ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='role_circuit_breaker'
    AND column_name='tripped_at' AND data_type='text') THEN
    ALTER TABLE conduit.role_circuit_breaker ALTER COLUMN tripped_at TYPE TIMESTAMPTZ
      USING CASE WHEN tripped_at = '' THEN NULL
                 WHEN tripped_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(tripped_at, 'Z', '')::timestamptz
                 ELSE tripped_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='role_circuit_breaker'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE conduit.role_circuit_breaker ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Post-step: restore proper NOW() default
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE conduit.role_circuit_breaker ALTER COLUMN created_at SET DEFAULT NOW();
