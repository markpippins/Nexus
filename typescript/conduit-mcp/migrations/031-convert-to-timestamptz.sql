-- Migration v31: Migrate vision.tickets.deadline TEXT → TIMESTAMPTZ
-- Scope: single catch-up column missed by original audit
-- Applied: 2026-07-12 02:22:33
--
-- This column was missed in the v27-v30 audit because its naming pattern
-- ('deadline') did not match the standard temporal suffixes (_at, _iso, _dt).
-- Discovered during post-migration verification of the vision schema.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'vision'
    AND table_name = 'tickets'
    AND column_name = 'deadline'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE vision.tickets
      ALTER COLUMN deadline TYPE TIMESTAMPTZ
      USING NULLIF(deadline, '')::timestamptz;
  END IF;
END $$;
