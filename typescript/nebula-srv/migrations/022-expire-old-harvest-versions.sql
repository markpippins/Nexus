-- Migration 022: Expire old harvest versions, fix insert trigger
--
-- Problem: The harvests_insert_trigger() auto-increments version but never
-- expires previous versions of the same (source_path, model). This causes
-- the nebula.harvests VIEW to return ALL versions simultaneously, flooding
-- the UI with "duplicate" entries.
--
-- Fix:
--   1. Expire old active versions — set recorded_until_dt = NOW() for all
--      but the latest version per (source_path, model).
--   2. Update the insert trigger to expire previous versions when a new
--      harvest of the same source is inserted.
--
-- Depends on: 007-version-harvests.sql (which set up the version column)

SET search_path TO nebula;

-- ══════════════════════════════════════════════════════════════════
--  1. Expire old active harvest versions
-- ══════════════════════════════════════════════════════════════════
-- Keep only the highest version per (source_path, model) active;
-- expire all older versions so the view returns one row per source.

UPDATE nebula.harvests_history h
   SET recorded_until_dt = NOW()
 WHERE h.recorded_until_dt = '9999-12-31 23:59:59+00'
   AND h.id NOT IN (
       -- Subquery: latest version per (source_path, model)
       SELECT id FROM (
           SELECT id,
                  row_number() OVER (
                      PARTITION BY source_path, model
                      ORDER BY version DESC
                  ) AS rn
             FROM nebula.harvests_history
            WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
       ) latest
       WHERE latest.rn = 1
   );

-- ══════════════════════════════════════════════════════════════════
--  2. Fix harvests_insert_trigger — expire old versions on insert
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

-- ══════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_total_active INTEGER;
    v_duplicate_count INTEGER;
BEGIN
    -- Count total active rows
    SELECT count(*) INTO v_total_active
      FROM nebula.harvests_history
     WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

    -- Check for remaining duplicates
    SELECT count(*) INTO v_duplicate_count
      FROM (
          SELECT source_path, model, count(*)
            FROM nebula.harvests_history
           WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
           GROUP BY source_path, model
          HAVING count(*) > 1
      ) dup;

    RAISE NOTICE 'Active harvest rows after expiry: %', v_total_active;
    IF v_duplicate_count > 0 THEN
        RAISE WARNING 'Remaining duplicates per (source_path, model): %', v_duplicate_count;
    ELSE
        RAISE NOTICE 'Zero duplicates — all clean.';
    END IF;
END;
$$;
