-- ═══════════════════════════════════════════════════════════════════════
--  Migration 013 — Fix harvests trigger RETURNING column order
--
--  Bug: UPDATE on nebula.harvests fails with:
--    "returned row structure does not match the structure of the
--     triggering table. Returned type jsonb does not match expected
--     type timestamp with time zone in column 10."
--
--  Root cause: After scd-type4-bitemporal-upgrade.sql rebuilt the
--  harvests view with created_at at position 10 and later migrations
--  (002, 003, 007) added docklang, level, visibility_scope, etc.,
--  the view column order became:
--    ...metadata(9), created_at(10), level(11), visibility_scope(12),
--       docklang(13), source_hash(14), version(15), run_metadata(16)...
--
--  But the triggers (from migration 007) used:
--    ...metadata(9), docklang(10), created_at(11), level(12), ...
--
--  For INSTEAD OF UPDATE triggers, PostgreSQL compares RETURNING
--  columns by ordinal position against the view. Mismatch at pos 10
--  (trigger returns docklang/jsonb, view expects created_at/timestamptz)
--  caused the error.
--
--  Fix: Align both INSERT and UPDATE trigger column lists (INSERT INTO,
--  VALUES, and RETURNING) with the current view column order.
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 013-fix-harvests-trigger-column-order.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fix 1: harvests_insert_trigger ────────────────────────────────
-- Column order changed: metadata, created_at, level, visibility_scope, docklang
-- (was: metadata, docklang, created_at, level, visibility_scope)

CREATE OR REPLACE FUNCTION nebula.harvests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
    next_ver INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

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


-- ── Fix 2: harvests_update_trigger ────────────────────────────────
-- This is the critical fix — RETURNING clause now matches view order:
--   metadata, created_at, level, visibility_scope, docklang (not: metadata, docklang, created_at)

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


-- ── Verification ──────────────────────────────────────────────────
DO $$ DECLARE
    v_result RECORD;
BEGIN
    -- Test UPDATE through the view
    UPDATE nebula.harvests
    SET total_candidates = total_candidates
    WHERE source_filename = 'Kernel vs Projection Design.html'
    RETURNING id, total_candidates INTO v_result;

    RAISE NOTICE '✅ UPDATE test passed — harvest % total_candidates=%',
        v_result.id, v_result.total_candidates;

    -- Confirm trigger source contains correct column order
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'harvests_update_trigger'
          AND pronamespace = 'nebula'::regnamespace
          AND prosrc LIKE '%metadata, created_at,\n              level, visibility_scope, docklang,%'
    ) THEN
        RAISE NOTICE '✅ UPDATE trigger RETURNING order matches view';
    ELSE
        RAISE NOTICE '❌ UPDATE trigger RETURNING order may not match view';
    END IF;
END $$;

COMMIT;
