-- Migration 001: Add harvest_candidates table and backfill from existing JSONB
-- Depends on: schema.sql (Phase 1) for the update_updated_at() function and base tables
--             schema-v2.sql (Phase 2) for the harvests table
-- Run: psql -d nexus -f migrations/001-add-harvest-candidates.sql
-- Idempotent: uses IF NOT EXISTS / DO NOTHING / idempotent backfill
--
-- NOTE: No FOREIGN KEY constraints on harvest_id, system_id, subsystem_id, feature_id.
-- The hierarchy tables (systems, subsystems, features, harvests) are VIEWS in the
-- SCD Type 4 bitemporal schema. Referential integrity is enforced at the application
-- layer (nebula-srv REST API).

SET search_path TO nebula;

-- 1. Add level + visibility columns to harvests (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'nebula' AND table_name = 'harvests_history' AND column_name = 'level') THEN
    ALTER TABLE nebula.harvests_history ADD COLUMN level TEXT DEFAULT 'standard';
    RAISE NOTICE 'Added harvests_history.level';
  ELSE
    RAISE NOTICE 'harvests_history.level already exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'nebula' AND table_name = 'harvests_history' AND column_name = 'visibility_scope') THEN
    ALTER TABLE nebula.harvests_history ADD COLUMN visibility_scope TEXT DEFAULT 'internal';
    RAISE NOTICE 'Added harvests_history.visibility_scope';
  ELSE
    RAISE NOTICE 'harvests_history.visibility_scope already exists';
  END IF;
END $$;

-- 2. Create harvest_candidates table
CREATE TABLE IF NOT EXISTS nebula.harvest_candidates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id        UUID NOT NULL,
    title             TEXT NOT NULL,
    intent_description TEXT,
    implementation_notes JSONB NOT NULL DEFAULT '[]',
    code_snippets     JSONB NOT NULL DEFAULT '[]',
    open_questions    JSONB NOT NULL DEFAULT '[]',
    tags              TEXT[] NOT NULL DEFAULT '{}',
    status            TEXT,
    system_id         UUID,
    subsystem_id      UUID,
    feature_id        UUID,
    valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_hc_harvest ON nebula.harvest_candidates(harvest_id);
CREATE INDEX IF NOT EXISTS idx_hc_system ON nebula.harvest_candidates(system_id);
CREATE INDEX IF NOT EXISTS idx_hc_subsystem ON nebula.harvest_candidates(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_hc_feature ON nebula.harvest_candidates(feature_id);
CREATE INDEX IF NOT EXISTS idx_hc_tags ON nebula.harvest_candidates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_hc_valid ON nebula.harvest_candidates(valid_from, valid_until);

-- 4. Trigger
DO $$
BEGIN
  CREATE TRIGGER trg_harvest_candidates_updated_at
    BEFORE UPDATE ON nebula.harvest_candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Trigger trg_harvest_candidates_updated_at already exists';
END $$;

-- 5. Backfill from existing harvests (idempotent — skips existing)
DO $$
DECLARE
  rec RECORD;
  cand JSONB;
  title TEXT;
  cnt INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT id, candidates FROM nebula.harvests
    WHERE candidates IS NOT NULL AND jsonb_array_length(candidates) > 0
  LOOP
    FOR cand IN SELECT * FROM jsonb_array_elements(rec.candidates)
    LOOP
      title := cand->>'title';
      IF title IS NULL OR title = '' THEN
        title := 'Untitled';
      END IF;

      -- Skip if already exists
      IF EXISTS (SELECT 1 FROM nebula.harvest_candidates WHERE harvest_id = rec.id AND title = title) THEN
        CONTINUE;
      END IF;

      INSERT INTO nebula.harvest_candidates (
        harvest_id, title,
        intent_description,
        implementation_notes, code_snippets, open_questions,
        tags, status
      ) VALUES (
        rec.id, title,
        COALESCE(cand->>'intentDescription', cand->>'intent_description'),
        COALESCE(cand->'implementationNotes', cand->'implementation_notes', '[]'::jsonb),
        COALESCE(cand->'codeSnippets', cand->'code_snippets', '[]'::jsonb),
        COALESCE(cand->'openQuestions', cand->'open_questions', '[]'::jsonb),
        COALESCE(cand->'tags', '{}'::jsonb)::text[],
        COALESCE(cand->>'status', cand->>'promotionStatus')
      );
      cnt := cnt + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Backfilled % candidates from existing harvests.', cnt;
END $$;
