-- Migration 007: Version harvests
-- Adds version INTEGER, source_hash TEXT, and run_metadata JSONB to
-- nebula.harvests_history so repeated harvests of the same source_path
-- by the same model produce distinct, versioned rows.
--
-- Depends on: schema-v2.sql, scd-type4-bitemporal-upgrade.sql,
--             003-level-visibility-constraints.sql

SET search_path TO nebula;

-- ── 1. Add columns ──────────────────────────────────────────────

ALTER TABLE nebula.harvests_history
    ADD COLUMN IF NOT EXISTS source_hash TEXT;

ALTER TABLE nebula.harvests_history
    ADD COLUMN IF NOT EXISTS version INTEGER;

ALTER TABLE nebula.harvests_history
    ADD COLUMN IF NOT EXISTS run_metadata JSONB;

-- ── 2. Resolve duplicates before index ───────────────────────────
-- Assign sequential versions per (source_path, model) for active rows
UPDATE nebula.harvests_history h
   SET version = seq.seq
  FROM (
    SELECT id, row_number() OVER (
        PARTITION BY source_path, model
        ORDER BY created_at
    ) AS seq
      FROM nebula.harvests_history
     WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
  ) seq
 WHERE h.id = seq.id
   AND h.recorded_until_dt = '9999-12-31 23:59:59+00';

-- Backfill any remaining NULLs
UPDATE nebula.harvests_history
   SET version = 1
 WHERE version IS NULL;

-- ── 3. Backfill source_hash ─────────────────────────────────────

UPDATE nebula.harvests_history
   SET source_hash = MD5(COALESCE(source_path, '') || COALESCE(model, ''))
 WHERE source_hash IS NULL;

-- ── 4. Backfill run_metadata ────────────────────────────────────

UPDATE nebula.harvests_history
   SET run_metadata = '{}'::JSONB
 WHERE run_metadata IS NULL;

-- ── 5. Set defaults + NOT NULL ──────────────────────────────────

ALTER TABLE nebula.harvests_history
    ALTER COLUMN version SET DEFAULT 1,
    ALTER COLUMN version SET NOT NULL,
    ALTER COLUMN run_metadata SET DEFAULT '{}'::JSONB,
    ALTER COLUMN run_metadata SET NOT NULL;

-- ── 6. Partial unique index (active rows only) ──────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_harvests_source_model_version
    ON nebula.harvests_history (source_path, model, version)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

-- ── 7. Update the VIEW ──────────────────────────────────────────
-- NOTE: Column order must match the RETURNING clause in update triggers.
--       2013-06-29 fix: docklang moved after visibility_scope (pos 13)
--       so RETURNING columns align by ordinal position with the view.

CREATE OR REPLACE VIEW nebula.harvests AS
SELECT id, source_path, source_filename, model, total_candidates,
       candidates, source_text, tags, metadata, created_at,
       level, visibility_scope, docklang,
       source_hash, version, run_metadata,
       recorded_on_dt, recorded_until_dt, valid_from, valid_until
FROM   nebula.harvests_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt
  AND  NOW() >= valid_from AND NOW() < valid_until;

-- ── 8. Update INSTEAD OF INSERT trigger ─────────────────────────
-- Column order: metadata, created_at, level, visibility_scope, docklang
-- (matches the view column order for RETURN NEW compatibility)

CREATE OR REPLACE FUNCTION nebula.harvests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
    next_ver INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    -- Auto-increment version for same source_path + model
    SELECT COALESCE(MAX(h.version), 0) + 1 INTO next_ver
      FROM nebula.harvests_history h
     WHERE h.source_path = NEW.source_path
       AND h.model = NEW.model
       AND h.recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at,
         level, visibility_scope, docklang,
         source_hash, version, run_metadata,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, COALESCE(NEW.created_at, NOW()),
         COALESCE(NEW.level, 1), COALESCE(NEW.visibility_scope, 'all'),
         NEW.docklang,
         COALESCE(NEW.source_hash, MD5(COALESCE(NEW.source_path, '') || COALESCE(NEW.model, ''))),
         COALESCE(NEW.version, next_ver),
         COALESCE(NEW.run_metadata, '{}'::JSONB),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.level := COALESCE(NEW.level, 1);
    NEW.visibility_scope := COALESCE(NEW.visibility_scope, 'all');
    NEW.source_hash := COALESCE(NEW.source_hash, MD5(COALESCE(NEW.source_path, '') || COALESCE(NEW.model, '')));
    NEW.version := COALESCE(NEW.version, next_ver);
    NEW.run_metadata := COALESCE(NEW.run_metadata, '{}'::JSONB);
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 9. Update INSTEAD OF UPDATE trigger ─────────────────────────
-- CRITICAL: RETURNING clause must match view column order by ordinal
-- position. The view has created_at(10) then docklang(13), so RETURNING
-- must use: ...metadata, created_at, level, visibility_scope, docklang...
-- (was: ...metadata, docklang, created_at, level, visibility_scope...)

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
         source_hash, version, run_metadata,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, OLD.created_at,
         COALESCE(NEW.level, 1), COALESCE(NEW.visibility_scope, 'all'),
         NEW.docklang,
         COALESCE(NEW.source_hash, OLD.source_hash),
         COALESCE(NEW.version, OLD.version),
         COALESCE(NEW.run_metadata, OLD.run_metadata),
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, source_path, source_filename, model, total_candidates,
              candidates, source_text, tags, metadata, created_at,
              level, visibility_scope, docklang,
              source_hash, version, run_metadata,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;
