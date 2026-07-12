-- ═══════════════════════════════════════════════════════════════════════
--  Migration 027 — Block Role Column
--
--  Adds a `role` column to conversation_blocks to distinguish user vs
--  assistant turns. The docklang discourse_units already contain a `role`
--  field ("user" or "assistant") but it was being discarded.
--
--  Changes:
--    1. ALTER TABLE conversation_blocks_history ADD COLUMN role
--    2. Recreate conversation_blocks VIEW to include role (appended at end)
--    3. Update INSERT trigger function to accept role
--    4. Update UPDATE trigger function to preserve role
--    5. Update auto-segment trigger to extract role from docklang
--    6. Backfill existing blocks from docklang (direct UPDATE, no expire/re-insert)
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 027-block-role-column.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Add role column to history table
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE nebula.conversation_blocks_history
    ADD COLUMN IF NOT EXISTS role TEXT;

COMMENT ON COLUMN nebula.conversation_blocks_history.role IS
    'Speaker role: "user" or "assistant". Populated from docklang discourse_unit.role.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. Recreate VIEW to include role column (appended at end)
--
--  IMPORTANT: PostgreSQL's CREATE OR REPLACE VIEW cannot insert columns
--  in the middle of the SELECT list — it reinterprets that as renaming
--  existing columns. The role column MUST be appended at the end.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW nebula.conversation_blocks AS
SELECT id, conversation_id, snapshot_id, block_index, parent_turn_id,
       parent_block_id, block_type, content_md, content_hash,
       dom_path, dom_fingerprint, first_line_no, last_line_no, created_at,
       role
FROM   nebula.conversation_blocks_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;


-- ═══════════════════════════════════════════════════════════════════════
--  3. Recreate INSERT trigger — accept role field (appended after created_at)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.conversation_blocks_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.conversation_blocks_history
        (id, conversation_id, snapshot_id, block_index, parent_turn_id,
         parent_block_id, block_type, content_md, content_hash,
         dom_path, dom_fingerprint, first_line_no, last_line_no, created_at,
         role,
         as_of_dt, expiration_dt)
    VALUES
        (new_id, NEW.conversation_id, NEW.snapshot_id, NEW.block_index,
         NEW.parent_turn_id, NEW.parent_block_id,
         COALESCE(NEW.block_type, 'paragraph'),
         COALESCE(NEW.content_md, ''),
         COALESCE(NEW.content_hash, ''),
         NEW.dom_path, NEW.dom_fingerprint,
         NEW.first_line_no, NEW.last_line_no,
         COALESCE(NEW.created_at, NOW()),
         NEW.role,
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  4. Recreate UPDATE trigger — preserve role field (appended after created_at)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.conversation_blocks_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.conversation_blocks_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.conversation_blocks_history
        (id, conversation_id, snapshot_id, block_index, parent_turn_id,
         parent_block_id, block_type, content_md, content_hash,
         dom_path, dom_fingerprint, first_line_no, last_line_no, created_at,
         role,
         as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.conversation_id, NEW.snapshot_id, NEW.block_index,
         NEW.parent_turn_id, NEW.parent_block_id,
         COALESCE(NEW.block_type, OLD.block_type),
         COALESCE(NEW.content_md, OLD.content_md),
         COALESCE(NEW.content_hash, OLD.content_hash),
         COALESCE(NEW.dom_path, OLD.dom_path),
         COALESCE(NEW.dom_fingerprint, OLD.dom_fingerprint),
         COALESCE(NEW.first_line_no, OLD.first_line_no),
         COALESCE(NEW.last_line_no, OLD.last_line_no),
         OLD.created_at,
         COALESCE(NEW.role, OLD.role),
         NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, conversation_id, snapshot_id, block_index, parent_turn_id,
              parent_block_id, block_type, content_md, content_hash,
              dom_path, dom_fingerprint, first_line_no, last_line_no,
              created_at, role INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
--  5. Update auto-segment trigger — extract role from docklang
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
    block_content  TEXT;
    block_hash     TEXT;
    block_role     TEXT;
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
        -- Extract role from the discourse_unit's provenance (e.g., "user", "assistant")
        -- Dockling stores role under provenance: {provenance, role}
        block_role := unit_elem #>> '{provenance,role}';

        FOR block_elem IN
            SELECT * FROM jsonb_array_elements(unit_elem -> 'blocks')
        LOOP
            -- Resolve content: prefer explicit content, fall back to
            -- formatting list items (dockling stores lists under 'items' key)
            IF block_elem #>> '{content}' IS NOT NULL AND block_elem #>> '{content}' != '' THEN
                block_content := block_elem #>> '{content}';
            ELSIF block_elem ? 'items' AND jsonb_array_length(block_elem -> 'items') > 0 THEN
                SELECT string_agg('- ' || item, CHR(10))
                INTO   block_content
                FROM   jsonb_array_elements_text(block_elem -> 'items') AS item;
            ELSE
                block_content := '';
            END IF;

            block_hash := substring(
                encode(sha256(convert_to(COALESCE(block_content, ''), 'UTF8')), 'hex'),
                1, 16
            );

            INSERT INTO nebula.conversation_blocks
                (conversation_id, snapshot_id, block_index, parent_turn_id,
                 block_type, content_md, content_hash, role)
            VALUES (
                NEW.id,
                snapshot_id,
                block_index,
                unit_elem #>> '{heading}',
                COALESCE(block_elem #>> '{type}', 'paragraph'),
                block_content,
                block_hash,
                block_role
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
--  6. Backfill role for existing blocks from docklang
--
--  Uses direct UPDATE on the history table (not expire/re-insert) because
--  the role column is brand-new — all existing values are NULL, so there
--  is no temporal data to preserve.
--  Matches blocks to docklang discourse units by sequential block_index.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    h_rec        RECORD;
    snap_rec     RECORD;
    unit_elem    jsonb;
    block_elem   jsonb;
    block_idx    INTEGER;
    total_updated INTEGER := 0;
    total_harvests INTEGER := 0;
BEGIN
    FOR h_rec IN
        SELECT h.id, h.docklang
        FROM nebula.harvests h
        WHERE h.docklang IS NOT NULL
          AND h.docklang ? 'discourse_units'
    LOOP
        SELECT cs.id INTO snap_rec
        FROM nebula.conversation_snapshots cs
        WHERE cs.conversation_id = h_rec.id
        LIMIT 1;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        block_idx := 0;

        FOR unit_elem IN
            SELECT * FROM jsonb_array_elements(h_rec.docklang -> 'discourse_units')
        LOOP
            FOR block_elem IN
                SELECT * FROM jsonb_array_elements(unit_elem -> 'blocks')
            LOOP
                -- Dockling stores role under provenance: {provenance, role}
                UPDATE nebula.conversation_blocks_history
                SET role = unit_elem #>> '{provenance,role}'
                WHERE conversation_id = h_rec.id
                  AND snapshot_id = snap_rec.id
                  AND block_index = block_idx
                  AND expiration_dt = '9999-12-31 23:59:59+00';

                block_idx := block_idx + 1;
                total_updated := total_updated + 1;
            END LOOP;
        END LOOP;

        total_harvests := total_harvests + 1;

        IF total_harvests % 50 = 0 THEN
            RAISE NOTICE 'Backfill progress: % harvests processed, % blocks updated', total_harvests, total_updated;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfill complete: % harvests processed, % blocks updated with role.', total_harvests, total_updated;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_col_exists   BOOLEAN;
    v_total_blocks INTEGER;
    v_with_role    INTEGER;
    v_no_role      INTEGER;
    v_user_blocks  INTEGER;
    v_assistant    INTEGER;
BEGIN
    -- Verify column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'nebula'
          AND table_name = 'conversation_blocks_history'
          AND column_name = 'role'
    ) INTO v_col_exists;

    RAISE NOTICE 'Column nebula.conversation_blocks_history.role exists: %', v_col_exists;

    -- Count role distribution
    SELECT COUNT(*) INTO v_total_blocks FROM nebula.conversation_blocks;
    SELECT COUNT(*) INTO v_with_role FROM nebula.conversation_blocks WHERE role IS NOT NULL;
    SELECT COUNT(*) INTO v_no_role FROM nebula.conversation_blocks WHERE role IS NULL;

    RAISE NOTICE 'Active conversation_blocks: %', v_total_blocks;
    RAISE NOTICE '  With role set:  %', v_with_role;
    RAISE NOTICE '  Role NULL:      %', v_no_role;

    IF v_with_role > 0 THEN
        SELECT COUNT(*) INTO v_user_blocks FROM nebula.conversation_blocks WHERE role = 'user';
        SELECT COUNT(*) INTO v_assistant FROM nebula.conversation_blocks WHERE role = 'assistant';
        RAISE NOTICE '  user blocks:      %', v_user_blocks;
        RAISE NOTICE '  assistant blocks: %', v_assistant;
    END IF;

    RAISE NOTICE 'Migration 027 complete — role column added and backfilled.';
END $$;

COMMIT;
