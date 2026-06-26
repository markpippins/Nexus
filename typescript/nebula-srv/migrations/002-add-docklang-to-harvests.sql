-- Migration 002: Add docklang column to nebula.harvests
-- Depends on: 001-add-harvest-candidates.sql
-- Run: psql -d nexus -f migrations/002-add-docklang-to-harvests.sql
-- Idempotent: uses DO $$ to check column existence

SET search_path TO nebula;

-- Add docklang column to harvests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'nebula'
                   AND table_name = 'harvests'
                   AND column_name = 'docklang') THEN
    ALTER TABLE nebula.harvests ADD COLUMN docklang JSONB;
    RAISE NOTICE 'Added harvests.docklang';
  ELSE
    RAISE NOTICE 'harvests.docklang already exists';
  END IF;
END $$;

-- Also add to harvests_history for bitemporal consistency
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'nebula'
                   AND table_name = 'harvests_history'
                   AND column_name = 'docklang') THEN
    ALTER TABLE nebula.harvests_history ADD COLUMN docklang JSONB;
    RAISE NOTICE 'Added harvests_history.docklang';
  ELSE
    RAISE NOTICE 'harvests_history.docklang already exists';
  END IF;
END $$;
