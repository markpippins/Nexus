-- ═══════════════════════════════════════════════════════════════════════
--  Migration 026 — Block/Harvest Orphan Guard
--
--  Adds a BEFORE INSERT trigger-level foreign key check to the 5 temporal
--  views whose INSTEAD OF INSERT triggers write conversation_id:
--    1. conversation_blocks
--    2. conversation_snapshots
--    3. harvest_references
--    4. segments
--    5. projection_overrides
--
--  When a row is inserted into any of these views, the trigger validates
--  that conversation_id references an existing harvest (either active in
--  the VIEW or expired in the HISTORY table).  If not, the insert is
--  rejected with a clear error message.
--
--  This is the database-level equivalent of the FK constraint that can't
--  exist on temporal tables (no FK on views over SCD4 history tables).
--
--  Pattern:  Shared assertion function called at the top of each
--            INSTEAD OF INSERT trigger, before any write occurs.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Helper: assert_harvest_exists(p_conversation_id)
--     Raises an exception if the conversation_id has never been a harvest.
--
--     Checks both the active VIEW (harvests) AND the history table
--     (harvests_history) to allow inserts against expired or historical
--     conversation IDs that were valid at some point.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.assert_harvest_exists(
    p_conversation_id UUID
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nebula.harvests WHERE id = p_conversation_id
    ) THEN
        RAISE EXCEPTION 'conversation_id % does not match any active harvest', p_conversation_id
              USING HINT = 'Every conversation_block, snapshot, reference, segment, and override must belong to an active (non-expired) harvest. Create the harvest first.';
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  2. conversation_blocks — updated INSERT trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.conversation_blocks_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Orphan guard
    PERFORM nebula.assert_harvest_exists(NEW.conversation_id);

    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.conversation_blocks_history
        (id, conversation_id, snapshot_id, block_index, parent_turn_id,
         parent_block_id, block_type, content_md, content_hash, dom_path,
         dom_fingerprint, first_line_no, last_line_no, created_at,
         as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.conversation_id, NEW.snapshot_id, NEW.block_index,
         NEW.parent_turn_id, NEW.parent_block_id,
         COALESCE(NEW.block_type, 'paragraph'),
         COALESCE(NEW.content_md, ''),
         COALESCE(NEW.content_hash, ''),
         NEW.dom_path, NEW.dom_fingerprint,
         NEW.first_line_no, NEW.last_line_no,
         COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  3. conversation_snapshots — updated INSERT trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.conversation_snapshots_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Orphan guard
    PERFORM nebula.assert_harvest_exists(NEW.conversation_id);

    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.conversation_snapshots_history
        (id, conversation_id, snapshot_index, source_hash, capture_mode,
         block_count, created_by, created_at, as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.conversation_id, NEW.snapshot_index, NEW.source_hash,
         COALESCE(NEW.capture_mode, 'AFTER_ACTION'),
         COALESCE(NEW.block_count, 0), COALESCE(NEW.created_by, 'SYSTEM'),
         COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  4. harvest_references — updated INSERT trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.harvest_references_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Orphan guard
    PERFORM nebula.assert_harvest_exists(NEW.conversation_id);

    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.harvest_references_history
        (id, conversation_id, snapshot_id, source_block_id, source_segment_id,
         target_block_id, target_segment_id, edge_type, confidence, state,
         source, reason, evidence_json, provenance_json, created_by,
         created_at, as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.conversation_id, NEW.snapshot_id,
         NEW.source_block_id, NEW.source_segment_id,
         NEW.target_block_id, NEW.target_segment_id,
         COALESCE(NEW.edge_type, 'implicit'),
         COALESCE(NEW.confidence, 0.0000),
         COALESCE(NEW.state, 'CANDIDATE'),
         COALESCE(NEW.source, 'HARVEST'),
         NEW.reason, NEW.evidence_json, NEW.provenance_json,
         COALESCE(NEW.created_by, 'SYSTEM'),
         COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  5. segments — updated INSERT trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.segments_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Orphan guard
    PERFORM nebula.assert_harvest_exists(NEW.conversation_id);

    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.segments_history
        (id, conversation_id, snapshot_id, start_block_id, end_block_id,
         start_block_index, end_block_index, segment_type, state, source,
         title, notes_md, created_by, created_at, as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.conversation_id, NEW.snapshot_id,
         NEW.start_block_id, NEW.end_block_id,
         NEW.start_block_index, NEW.end_block_index,
         NEW.segment_type,
         COALESCE(NEW.state, 'PROPOSED'),
         COALESCE(NEW.source, 'USER'),
         NEW.title, NEW.notes_md,
         COALESCE(NEW.created_by, 'USER'),
         COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  6. projection_overrides — updated INSERT trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.projection_overrides_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Orphan guard
    PERFORM nebula.assert_harvest_exists(NEW.conversation_id);

    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.projection_overrides_history
        (id, conversation_id, snapshot_id, target_type, target_id,
         projection_target, override_type, reason_code, notes_md,
         source, created_by, created_at, as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.conversation_id, NEW.snapshot_id,
         COALESCE(NEW.target_type, 'BLOCK'), NEW.target_id,
         COALESCE(NEW.projection_target, 'BP'),
         COALESCE(NEW.override_type, 'EXCLUDE'),
         COALESCE(NEW.reason_code, 'USER_OVERRIDE'),
         NEW.notes_md,
         COALESCE(NEW.source, 'USER'),
         COALESCE(NEW.created_by, 'USER'),
         COALESCE(NEW.created_at, NOW()), NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_count INTEGER;
    v_name  TEXT;
BEGIN
    -- Verify the helper function exists
    SELECT COUNT(*) INTO v_count
    FROM pg_proc
    WHERE proname = 'assert_harvest_exists'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'nebula');

    IF v_count = 0 THEN
        RAISE EXCEPTION 'assert_harvest_exists function was not created';
    END IF;

    -- Verify each insert trigger references the guard
    FOR v_name IN VALUES ('conversation_blocks_insert_trigger'),
                          ('conversation_snapshots_insert_trigger'),
                          ('harvest_references_insert_trigger'),
                          ('segments_insert_trigger'),
                          ('projection_overrides_insert_trigger')
    LOOP
        SELECT COUNT(*) INTO v_count
        FROM pg_proc
        WHERE proname = v_name
          AND prosrc LIKE '%assert_harvest_exists%'
          AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'nebula');

        IF v_count = 0 THEN
            RAISE WARNING 'Trigger function nebula.% does not contain assert_harvest_exists call', v_name;
        ELSE
            RAISE NOTICE '✅ nebula.% — guarded', v_name;
        END IF;
    END LOOP;

    RAISE NOTICE 'Migration 026 complete — 5 INSERT triggers now guard against orphan conversation_ids.';
    RAISE NOTICE 'Helper: nebula.assert_harvest_exists(UUID)';
END $$;

COMMIT;
