-- Migration v27: Migrate TEXT timestamp columns to TIMESTAMPTZ
-- Scope: conduit core tables + tackle shared tables
-- Applied: 2026-07-12 01:54:33
--
-- Converts empty-string '' → NULL, handles +00:00Z suffix, and casts valid
-- ISO 8601 strings to timestamptz. Idempotent — only converts columns that
-- are still type 'text'.
--
-- Tables covered:
--   conduit.plans            (created_at, updated_at)
--   conduit.schema_version   (applied_at)
--   conduit.sessions         (created_at, start_iso, end_iso, last_heartbeat_at,
--                              last_activity, workflow_start_time, workflow_close_time)
--   conduit.circuit_breaker  (tripped_at, updated_at, wake_requested_at)
--   conduit.work_requests    (created_at, updated_at)
--   tackle.providers         (created_at, updated_at)
--   tackle.harnesses         (created_at, updated_at)
--   tackle.models            (created_at, updated_at)
--   tackle.config_bundle     (created_at, updated_at, valid_from, valid_to)

-- ═══════════════════════════════════════════════════════════════════
-- conduit core tables
-- ═══════════════════════════════════════════════════════════════════

-- conduit.plans
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='plans'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE conduit.plans ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='plans'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE conduit.plans ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- conduit.schema_version
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='schema_version'
    AND column_name='applied_at' AND data_type='text') THEN
    ALTER TABLE conduit.schema_version ALTER COLUMN applied_at TYPE TIMESTAMPTZ
      USING CASE WHEN applied_at = '' THEN NULL
                 WHEN applied_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(applied_at, 'Z', '')::timestamptz
                 ELSE applied_at::timestamptz END;
  END IF;
END $$;

-- conduit.sessions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='sessions'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE conduit.sessions ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='sessions'
    AND column_name='start_iso' AND data_type='text') THEN
    ALTER TABLE conduit.sessions ALTER COLUMN start_iso TYPE TIMESTAMPTZ
      USING CASE WHEN start_iso = '' THEN NULL
                 WHEN start_iso ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(start_iso, 'Z', '')::timestamptz
                 ELSE start_iso::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='sessions'
    AND column_name='end_iso' AND data_type='text') THEN
    ALTER TABLE conduit.sessions ALTER COLUMN end_iso TYPE TIMESTAMPTZ
      USING CASE WHEN end_iso = '' THEN NULL
                 WHEN end_iso ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(end_iso, 'Z', '')::timestamptz
                 ELSE end_iso::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='sessions'
    AND column_name='last_heartbeat_at' AND data_type='text') THEN
    ALTER TABLE conduit.sessions ALTER COLUMN last_heartbeat_at TYPE TIMESTAMPTZ
      USING CASE WHEN last_heartbeat_at = '' THEN NULL
                 WHEN last_heartbeat_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(last_heartbeat_at, 'Z', '')::timestamptz
                 ELSE last_heartbeat_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='sessions'
    AND column_name='last_activity' AND data_type='text') THEN
    ALTER TABLE conduit.sessions ALTER COLUMN last_activity TYPE TIMESTAMPTZ
      USING CASE WHEN last_activity = '' THEN NULL
                 WHEN last_activity ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(last_activity, 'Z', '')::timestamptz
                 ELSE last_activity::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='sessions'
    AND column_name='workflow_start_time' AND data_type='text') THEN
    ALTER TABLE conduit.sessions ALTER COLUMN workflow_start_time TYPE TIMESTAMPTZ
      USING CASE WHEN workflow_start_time = '' THEN NULL
                 WHEN workflow_start_time ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(workflow_start_time, 'Z', '')::timestamptz
                 ELSE workflow_start_time::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='sessions'
    AND column_name='workflow_close_time' AND data_type='text') THEN
    ALTER TABLE conduit.sessions ALTER COLUMN workflow_close_time TYPE TIMESTAMPTZ
      USING CASE WHEN workflow_close_time = '' THEN NULL
                 WHEN workflow_close_time ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(workflow_close_time, 'Z', '')::timestamptz
                 ELSE workflow_close_time::timestamptz END;
  END IF;
END $$;

-- conduit.circuit_breaker
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='circuit_breaker'
    AND column_name='tripped_at' AND data_type='text') THEN
    ALTER TABLE conduit.circuit_breaker ALTER COLUMN tripped_at TYPE TIMESTAMPTZ
      USING CASE WHEN tripped_at = '' THEN NULL
                 WHEN tripped_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(tripped_at, 'Z', '')::timestamptz
                 ELSE tripped_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='circuit_breaker'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE conduit.circuit_breaker ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='circuit_breaker'
    AND column_name='wake_requested_at' AND data_type='text') THEN
    ALTER TABLE conduit.circuit_breaker ALTER COLUMN wake_requested_at TYPE TIMESTAMPTZ
      USING CASE WHEN wake_requested_at = '' THEN NULL
                 WHEN wake_requested_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(wake_requested_at, 'Z', '')::timestamptz
                 ELSE wake_requested_at::timestamptz END;
  END IF;
END $$;

-- conduit.work_requests
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='work_requests'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE conduit.work_requests ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='work_requests'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE conduit.work_requests ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- tackle shared tables
-- ═══════════════════════════════════════════════════════════════════

-- tackle.providers
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='providers'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE tackle.providers ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='providers'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE tackle.providers ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- tackle.harnesses
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='harnesses'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE tackle.harnesses ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='harnesses'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE tackle.harnesses ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- tackle.models
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='models'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE tackle.models ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='models'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE tackle.models ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

-- tackle.config_bundle
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='config_bundle'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE tackle.config_bundle ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='config_bundle'
    AND column_name='updated_at' AND data_type='text') THEN
    ALTER TABLE tackle.config_bundle ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING CASE WHEN updated_at = '' THEN NULL
                 WHEN updated_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(updated_at, 'Z', '')::timestamptz
                 ELSE updated_at::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='config_bundle'
    AND column_name='valid_from' AND data_type='text') THEN
    ALTER TABLE tackle.config_bundle ALTER COLUMN valid_from TYPE TIMESTAMPTZ
      USING CASE WHEN valid_from = '' THEN NULL
                 WHEN valid_from ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(valid_from, 'Z', '')::timestamptz
                 ELSE valid_from::timestamptz END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='tackle' AND table_name='config_bundle'
    AND column_name='valid_to' AND data_type='text') THEN
    ALTER TABLE tackle.config_bundle ALTER COLUMN valid_to TYPE TIMESTAMPTZ
      USING CASE WHEN valid_to = '' THEN NULL
                 WHEN valid_to ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(valid_to, 'Z', '')::timestamptz
                 ELSE valid_to::timestamptz END;
  END IF;
END $$;
