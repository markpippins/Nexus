-- ═══════════════════════════════════════════════════════════════════════
--  Migration 004 — Fix DockLang Persistence + Auto-Segment Trigger
--
--  Two changes:
--    1. Fix harvests_insert_trigger and harvests_update_trigger to
--       persist the docklang column through the SCD Type 4 triggers.
--       (Pre-existing bug: docklang was not included in the INSERT
--        column lists, so it was silently dropped on every write.)
--    2. Add an AFTER INSERT trigger on nebula.harvests_history that
--       automatically creates a conversation_snapshot + blocks when
--       docklang with discourse_units is detected.
--
--  The auto-segment trigger is idempotent: it checks if a snapshot
--  already exists for this harvest before creating one.
--
--  Covers all harvest creation paths:
--    • batch_harvest_to_db.py (INSERT with docklang)
--    • backfill_docklang.py (UPDATE SET docklang → SCD4 insert)
--    • POST /api/harvests (INSERT without docklang → no-op)
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 004-auto-segment-trigger.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Fix harvests_insert_trigger — add docklang to column list
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.harvests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, docklang, created_at,
         level, visibility_scope,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, NEW.docklang,
         COALESCE(NEW.created_at, NOW()),
         COALESCE(NEW.level, 1), COALESCE(NEW.visibility_scope, 'all'),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.level := COALESCE(NEW.level, 1);
    NEW.visibility_scope := COALESCE(NEW.visibility_scope, 'all');
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  2. Fix harvests_update_trigger — add docklang to column list
-- ═══════════════════════════════════════════════════════════════════════

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
         candidates, source_text, tags, metadata, docklang, created_at,
         level, visibility_scope,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (OLD.id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, NEW.docklang, OLD.created_at,
         COALESCE(NEW.level, 1), COALESCE(NEW.visibility_scope, 'all'),
         NOW(), '9999-12-31 23:59:59+00',
         OLD.valid_from, OLD.valid_until)
    RETURNING id, source_path, source_filename, model, total_candidates,
              candidates, source_text, tags, metadata, docklang, created_at,
              level, visibility_scope,
              recorded_on_dt, recorded_until_dt, valid_from, valid_until INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  3. Auto-segment trigger function
--
--  Fires on INSERT into nebula.harvests_history when docklang has
--  discourse_units. Creates a conversation_snapshot + blocks.
--
--  Idempotent: skips if a snapshot already exists for this harvest ID
--  (the conversation_id = harvest.id convention).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.harvests_auto_segment_trigger()
RETURNS TRIGGER AS $$
DECLARE
    snapshot_id    UUID;
    unit_elem      jsonb;
    block_elem     jsonb;
    block_index    INTEGER := 0;
    total_blocks   INTEGER;
    source_hash    TEXT;
BEGIN
    -- ── Idempotency: skip if snapshot already exists ──────────────
    IF EXISTS (SELECT 1 FROM nebula.conversation_snapshots
               WHERE conversation_id = NEW.id) THEN
        RETURN NEW;
    END IF;

    -- ── Count total blocks ────────────────────────────────────────
    SELECT COALESCE(sum(jsonb_array_length(du -> 'blocks')), 0)
    INTO   total_blocks
    FROM   jsonb_array_elements(NEW.docklang -> 'discourse_units') AS du;

    IF total_blocks = 0 THEN
        RETURN NEW;
    END IF;

    -- ── Compute source hash from full docklang ────────────────────
    source_hash := encode(sha256(convert_to(NEW.docklang::text, 'UTF8')), 'hex');

    -- ── Create snapshot (conversation_id = harvest id) ────────────
    INSERT INTO nebula.conversation_snapshots
        (conversation_id, snapshot_index, source_hash, capture_mode,
         block_count, created_by)
    VALUES (NEW.id, 0, substring(source_hash, 1, 16), 'AFTER_ACTION',
            total_blocks, 'SYSTEM')
    RETURNING id INTO snapshot_id;

    -- ── Insert blocks from each discourse unit ────────────────────
    FOR unit_elem IN
        SELECT * FROM jsonb_array_elements(NEW.docklang -> 'discourse_units')
    LOOP
        FOR block_elem IN
            SELECT * FROM jsonb_array_elements(unit_elem -> 'blocks')
        LOOP
            INSERT INTO nebula.conversation_blocks
                (conversation_id, snapshot_id, block_index, parent_turn_id,
                 block_type, content_md, content_hash)
            VALUES (
                NEW.id,
                snapshot_id,
                block_index,
                unit_elem #>> '{heading}',
                COALESCE(block_elem #>> '{type}', 'paragraph'),
                COALESCE(block_elem #>> '{content}', ''),
                substring(
                    encode(sha256(
                        convert_to(COALESCE(block_elem #>> '{content}', ''), 'UTF8')
                    ), 'hex'),
                    1, 16
                )
            );
            block_index := block_index + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Auto-segment: snapshot % for harvest % (% blocks)',
        snapshot_id, NEW.id, total_blocks;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  4. AFTER INSERT trigger on harvests_history
--
--  Only fires on rows with docklang that has discourse_units.
--  The WHEN clause does a fast bail for harvests without docklang.
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_harvests_history_auto_segment
    ON nebula.harvests_history;

CREATE TRIGGER trg_harvests_history_auto_segment
    AFTER INSERT ON nebula.harvests_history
    FOR EACH ROW
    WHEN (NEW.docklang IS NOT NULL
          AND NEW.docklang != '{}'::jsonb
          AND NEW.docklang ? 'discourse_units')
    EXECUTE FUNCTION nebula.harvests_auto_segment_trigger();


-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_triggers INTEGER;
    v_snapshots INTEGER;
BEGIN
    -- Confirm the trigger exists on harvests_history
    SELECT count(*) INTO v_triggers
    FROM pg_trigger
    WHERE tgrelid = 'nebula.harvests_history'::regclass
      AND tgname = 'trg_harvests_history_auto_segment';

    RAISE NOTICE 'Trigger trg_harvests_history_auto_segment: %',
        CASE WHEN v_triggers > 0 THEN 'CREATED' ELSE 'MISSING' END;

    -- Count existing snapshots (from seed script)
    SELECT count(*) INTO v_snapshots FROM nebula.conversation_snapshots;
    RAISE NOTICE 'Existing conversation_snapshots: % (unchanged)', v_snapshots;

    RAISE NOTICE 'Migration 004 complete.';
    RAISE NOTICE '  • Fixed docklang persistence in insert/update triggers';
    RAISE NOTICE '  • Added auto-segment trigger on harvests_history';
END $$;

COMMIT;
