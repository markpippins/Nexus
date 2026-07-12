-- Migration v29: Migrate TEXT timestamp columns to TIMESTAMPTZ
-- Scope: conduit kernel/log tables
-- Applied: 2026-07-12 01:59:52
--
-- Tables covered:
--   conduit.kernel_delta_log   (created_at)
--   conduit.kernel_snapshot    (created_at)
--   conduit.lineage_log        (created_at)
--   conduit.bridge_checkpoint  (last_recorded_on_dt)
--
-- Special handling: kernel tables use to_char(now(),...)::text defaults
-- and bridge_checkpoint uses DEFAULT ''::text. All defaults must be
-- dropped before ALTER TYPE, then restored to NOW() after.

-- ═══════════════════════════════════════════════════════════════════
-- Pre-step: drop TEXT defaults that would block ALTER TYPE
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE conduit.bridge_checkpoint ALTER COLUMN last_recorded_on_dt DROP DEFAULT;
ALTER TABLE conduit.kernel_delta_log ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE conduit.kernel_snapshot ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE conduit.lineage_log ALTER COLUMN created_at DROP DEFAULT;

-- ═══════════════════════════════════════════════════════════════════
-- conduit kernel/log tables
-- ═══════════════════════════════════════════════════════════════════

-- conduit.kernel_delta_log
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='kernel_delta_log'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE conduit.kernel_delta_log ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

-- conduit.kernel_snapshot
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='kernel_snapshot'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE conduit.kernel_snapshot ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

-- conduit.lineage_log
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='lineage_log'
    AND column_name='created_at' AND data_type='text') THEN
    ALTER TABLE conduit.lineage_log ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING CASE WHEN created_at = '' THEN NULL
                 WHEN created_at ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(created_at, 'Z', '')::timestamptz
                 ELSE created_at::timestamptz END;
  END IF;
END $$;

-- conduit.bridge_checkpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='conduit' AND table_name='bridge_checkpoint'
    AND column_name='last_recorded_on_dt' AND data_type='text') THEN
    ALTER TABLE conduit.bridge_checkpoint ALTER COLUMN last_recorded_on_dt TYPE TIMESTAMPTZ
      USING CASE WHEN last_recorded_on_dt = '' THEN NULL
                 WHEN last_recorded_on_dt ~ '[+-]\d{2}:\d{2}Z$' THEN REPLACE(last_recorded_on_dt, 'Z', '')::timestamptz
                 ELSE last_recorded_on_dt::timestamptz END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Post-step: restore proper NOW() defaults
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE conduit.kernel_delta_log ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE conduit.kernel_snapshot ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE conduit.lineage_log ALTER COLUMN created_at SET DEFAULT NOW();
