-- Migration 023: Add file_size column to nebula.harvests
--
-- Purpose: Enable cheap pre-ingestion dedup — check file size before
-- running expensive dockling/html parsing on re-imported files.
--
-- Used in conjunction with source_hash:
--   Same filename + same size + same hash → skip (unchanged)
--   Same filename + different size      → reprocess (definitely changed)
--   Same filename + same size + diff hash → reprocess (rare hash collision)
--
-- Depends on: 022-expire-old-harvest-versions.sql

SET search_path TO nebula;

-- ══════════════════════════════════════════════════════════════════
--  1. Add column to history table
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE nebula.harvests_history
  ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- ══════════════════════════════════════════════════════════════════
--  2. Recreate the view with file_size
-- ══════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS nebula.harvests CASCADE;

CREATE VIEW nebula.harvests AS
SELECT id,
       source_path,
       source_filename,
       model,
       total_candidates,
       candidates,
       source_text,
       tags,
       metadata,
       created_at,
       level,
       visibility_scope,
       docklang,
       source_hash,
       file_size,
       version,
       run_metadata,
       recorded_on_dt,
       recorded_until_dt,
       valid_from,
       valid_until
  FROM nebula.harvests_history
 WHERE now() >= recorded_on_dt AND now() < recorded_until_dt
   AND now() >= valid_from AND now() < valid_until;

-- ══════════════════════════════════════════════════════════════════
--  3. Recreate insert trigger with file_size
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.harvests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
    next_ver INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    -- Expire previous active version(s) of the same source+model
    UPDATE nebula.harvests_history
       SET recorded_until_dt = NOW()
     WHERE source_path = NEW.source_path
       AND model = NEW.model
       AND recorded_until_dt = '9999-12-31 23:59:59+00';

    -- Auto-increment version for same source_path + model
    SELECT COALESCE(MAX(h.version), 0) + 1 INTO next_ver
      FROM nebula.harvests_history h
     WHERE h.source_path = NEW.source_path
       AND h.model = NEW.model;

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at,
         level, visibility_scope, docklang,
         source_hash, file_size, version, run_metadata,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, COALESCE(NEW.created_at, NOW()),
         COALESCE(NEW.level, 1), COALESCE(NEW.visibility_scope, 'all'),
         NEW.docklang,
         COALESCE(NEW.source_hash, MD5(COALESCE(NEW.source_path, '') || COALESCE(NEW.model, ''))),
         NEW.file_size,
         COALESCE(NEW.version, next_ver),
         COALESCE(NEW.run_metadata, '{}'::JSONB),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.level := COALESCE(NEW.level, 1);
    NEW.visibility_scope := COALESCE(NEW.visibility_scope, 'all');
    NEW.source_hash := COALESCE(NEW.source_hash, MD5(COALESCE(NEW.source_path, '') || COALESCE(NEW.model, '')));
    NEW.file_size := NEW.file_size;
    NEW.version := COALESCE(NEW.version, next_ver);
    NEW.run_metadata := COALESCE(NEW.run_metadata, '{}'::JSONB);
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════════
--  4. Recreate update trigger with file_size
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.harvests_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.harvests_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at,
         level, visibility_scope, docklang,
         source_hash, file_size, version, run_metadata,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, OLD.created_at,
         COALESCE(NEW.level, 1), COALESCE(NEW.visibility_scope, 'all'),
         NEW.docklang,
         COALESCE(NEW.source_hash, OLD.source_hash),
         COALESCE(NEW.file_size, OLD.file_size),
         COALESCE(NEW.version, OLD.version),
         COALESCE(NEW.run_metadata, OLD.run_metadata),
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, source_path, source_filename, model, total_candidates,
              candidates, source_text, tags, metadata, created_at,
              level, visibility_scope, docklang,
              source_hash, file_size, version, run_metadata,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════════
--  5. Recreate INSTEAD OF triggers on the view
-- ══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_harvests_insert ON nebula.harvests;
CREATE TRIGGER trg_harvests_insert
    INSTEAD OF INSERT ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_insert_trigger();

DROP TRIGGER IF EXISTS trg_harvests_update ON nebula.harvests;
CREATE TRIGGER trg_harvests_update
    INSTEAD OF UPDATE ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION nebula.harvests_update_trigger();

-- ══════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
      FROM nebula.harvests;

    RAISE NOTICE 'Harvests view working: % rows', v_count;
    RAISE NOTICE 'Migration 023 applied successfully.';
END;
$$;
