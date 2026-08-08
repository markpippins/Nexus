-- ═══════════════════════════════════════════════════════════════════════
--  Migration 041 — Restore Harvest Auto-Segmentation (Substance Backfill)
--
--  PROBLEM
--  The SCD Type-4 bitemporal upgrade dropped ALL triggers on nebula tables
--  (DROP TRIGGER loop) and recreated only the bitemporal core set. The
--  harvests auto-segment trigger (migration 004) and the block-segmentation
--  INSTEAD OF triggers (migration 003) were NOT recreated. Result:
--
--    • conversation_snapshots creation stopped 2026-07-10 05:00
--    • ~2,313 harvests with docklang discourse_units have NO substance
--      content (no snapshot / blocks) — the entire old corpus
--    • harvests_insert_trigger detached → version/source_hash computed
--      by the auto-updatable view defaults instead (version=1)
--
--  FIX
--  1. Extract the auto-segment body into a callable, idempotent function
--     nebula.segment_harvest(p_harvest_id uuid) — single source of truth.
--  2. Re-point the harvests_auto_segment_trigger at it (thin wrapper).
--  3. Re-attach trg_harvests_history_auto_segment (AFTER INSERT).
--  4. Re-attach the INSTEAD OF INSERT triggers on the conversation_snapshots
--     and conversation_blocks VIEWS (also dropped by the SCD upgrade).
--
--  USAGE
--    psql -h localhost -U pguser -d nexus -f 041-restore-harvest-auto-segment.sql
--
--  BACKFILL (idempotent, per-harvest)
--    SELECT nebula.segment_harvest(h.id)
--    FROM   nebula.harvests h
--    WHERE  h.docklang ? 'discourse_units'
--      AND  NOT EXISTS (SELECT 1 FROM nebula.conversation_snapshots cs
--                       WHERE cs.conversation_id = h.id);
--    (or: python3 bin/substance_backfill.py --limit N)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Callable segmentation primitive ─────────────────────────────────
CREATE OR REPLACE FUNCTION nebula.segment_harvest(p_harvest_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
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
    docklang       jsonb;
BEGIN
    -- Load docklang for the given harvest
    SELECT h.docklang INTO docklang
    FROM nebula.harvests h
    WHERE h.id = p_harvest_id;

    IF docklang IS NULL OR NOT (docklang ? 'discourse_units') THEN
        RETURN NULL;
    END IF;

    -- ── Idempotency: skip if snapshot already exists ──────────────
    SELECT id INTO snapshot_id
    FROM nebula.conversation_snapshots
    WHERE conversation_id = p_harvest_id
    LIMIT 1;
    IF snapshot_id IS NOT NULL THEN
        RETURN snapshot_id;
    END IF;

    -- ── Count total blocks ────────────────────────────────────────
    SELECT COALESCE(sum(jsonb_array_length(du -> 'blocks')), 0)
    INTO   total_blocks
    FROM   jsonb_array_elements(docklang -> 'discourse_units') AS du;

    IF total_blocks = 0 THEN
        RETURN NULL;
    END IF;

    -- ── Compute source hash from full docklang ────────────────────
    source_hash := encode(sha256(convert_to(docklang::text, 'UTF8')), 'hex');

    -- ── Create snapshot (conversation_id = harvest id) ────────────
    INSERT INTO nebula.conversation_snapshots
        (conversation_id, snapshot_index, source_hash, capture_mode,
         block_count, created_by)
    VALUES (p_harvest_id, 0, substring(source_hash, 1, 16), 'AFTER_ACTION',
            total_blocks, 'SYSTEM')
    RETURNING id INTO snapshot_id;

    -- ── Insert blocks from each discourse unit ────────────────────
    FOR unit_elem IN
        SELECT * FROM jsonb_array_elements(docklang -> 'discourse_units')
    LOOP
        block_role := unit_elem #>> '{provenance,role}';

        FOR block_elem IN
            SELECT * FROM jsonb_array_elements(unit_elem -> 'blocks')
        LOOP
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
                p_harvest_id,
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

    RAISE NOTICE 'segment_harvest: snapshot % for harvest % (% blocks)',
        snapshot_id, p_harvest_id, total_blocks;

    RETURN snapshot_id;
END;
$function$;

-- ── 2. Trigger becomes a thin wrapper ──────────────────────────────────
CREATE OR REPLACE FUNCTION nebula.harvests_auto_segment_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM nebula.segment_harvest(NEW.id);
    RETURN NEW;
END;
$function$;

-- ── 3. Re-attach AFTER INSERT trigger on harvests_history ──────────────
DROP TRIGGER IF EXISTS trg_harvests_history_auto_segment
    ON nebula.harvests_history;

CREATE TRIGGER trg_harvests_history_auto_segment
    AFTER INSERT ON nebula.harvests_history
    FOR EACH ROW
    WHEN (NEW.docklang IS NOT NULL
          AND NEW.docklang != '{}'::jsonb
          AND NEW.docklang ? 'discourse_units')
    EXECUTE FUNCTION nebula.harvests_auto_segment_trigger();

-- ── 4. Re-attach INSTEAD OF INSERT triggers on the substance views ─────
DROP TRIGGER IF EXISTS trg_conversation_snapshots_insert
    ON nebula.conversation_snapshots;

CREATE TRIGGER trg_conversation_snapshots_insert
    INSTEAD OF INSERT ON nebula.conversation_snapshots
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_snapshots_insert_trigger();

DROP TRIGGER IF EXISTS trg_conversation_blocks_insert
    ON nebula.conversation_blocks;

CREATE TRIGGER trg_conversation_blocks_insert
    INSTEAD OF INSERT ON nebula.conversation_blocks
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_blocks_insert_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_trigger_count INTEGER;
    v_seg_fn        INTEGER;
BEGIN
    SELECT count(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname IN (
        'trg_harvests_history_auto_segment',
        'trg_conversation_snapshots_insert',
        'trg_conversation_blocks_insert'
    );

    SELECT count(*) INTO v_seg_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'nebula' AND p.proname = 'segment_harvest';

    RAISE NOTICE 'Restored triggers: % (expected 3), segment_harvest fn: % (expected 1)',
        v_trigger_count, v_seg_fn;
END $$;
