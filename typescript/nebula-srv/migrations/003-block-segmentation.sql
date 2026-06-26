-- ═══════════════════════════════════════════════════════════════════════
--  Migration 003 — Block Segmentation Tables
--  Creates 5 new bitemporal tables in the nebula schema to support
--  interactive block-level segmentation in the harvest transcript viewer.
--
--  Tables:
--    1. conversation_snapshots   — immutable conversation snapshots
--    2. conversation_blocks      — individual blocks per snapshot
--    3. segments                 — user-defined block ranges
--    4. harvest_references       — typed edges between blocks/segments
--    5. projection_overrides     — suppress/include overrides
--
--  Pattern: SCD Type 4 (matching scd-type4-temporal.sql)
--    • _history table with (id, as_of_dt) composite PK
--    • Active-row view hiding temporal columns
--    • INSTEAD OF triggers on views for INSERT/UPDATE/DELETE
--    • Partial unique indexes for active-row id uniqueness
--
--  No FK constraints — app code manages relationships logically
--  (consistent with scd-type4-temporal.sql decision to drop all FKs).
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 003-block-segmentation.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. conversation_snapshots
--     Immutable point-in-time captures of a chat conversation.
--     Each harvest run against the same source creates a new snapshot
--     with incremented snapshot_index.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.conversation_snapshots_history (
    id                UUID NOT NULL,
    conversation_id   UUID NOT NULL,
    snapshot_index    INTEGER NOT NULL,
    source_hash       TEXT NOT NULL,
    capture_mode      TEXT NOT NULL DEFAULT 'AFTER_ACTION',
    block_count       INTEGER NOT NULL DEFAULT 0,
    created_by        TEXT NOT NULL DEFAULT 'SYSTEM',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    as_of_dt          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_dt     TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00'
);

ALTER TABLE nebula.conversation_snapshots_history
    ADD PRIMARY KEY (id, as_of_dt);

-- Performance: list snapshots for a conversation, newest first
CREATE INDEX IF NOT EXISTS idx_snapshots_history_conv
    ON nebula.conversation_snapshots_history (conversation_id, snapshot_index DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active-id uniqueness (only one active row per snapshot id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_active_id
    ON nebula.conversation_snapshots_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active view — temporal columns hidden
CREATE OR REPLACE VIEW nebula.conversation_snapshots AS
SELECT id, conversation_id, snapshot_index, source_hash, capture_mode,
       block_count, created_by, created_at
FROM   nebula.conversation_snapshots_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- Insert trigger
CREATE OR REPLACE FUNCTION nebula.conversation_snapshots_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
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

CREATE TRIGGER trg_conversation_snapshots_insert
    INSTEAD OF INSERT ON nebula.conversation_snapshots
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_snapshots_insert_trigger();

-- Update trigger (snapshots are mostly append-only, but metadata may change)
CREATE OR REPLACE FUNCTION nebula.conversation_snapshots_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.conversation_snapshots_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.conversation_snapshots_history
        (id, conversation_id, snapshot_index, source_hash, capture_mode,
         block_count, created_by, created_at, as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.conversation_id, NEW.snapshot_index, NEW.source_hash,
         COALESCE(NEW.capture_mode, OLD.capture_mode),
         COALESCE(NEW.block_count, OLD.block_count),
         COALESCE(NEW.created_by, OLD.created_by),
         OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, conversation_id, snapshot_index, source_hash, capture_mode,
              block_count, created_by, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conversation_snapshots_update
    INSTEAD OF UPDATE ON nebula.conversation_snapshots
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_snapshots_update_trigger();

-- Delete trigger (bitemporal expire)
CREATE OR REPLACE FUNCTION nebula.conversation_snapshots_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.conversation_snapshots_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conversation_snapshots_delete
    INSTEAD OF DELETE ON nebula.conversation_snapshots
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_snapshots_delete_trigger();


-- ═══════════════════════════════════════════════════════════════════════
--  2. conversation_blocks
--     Every individual content block as a separately addressable row.
--     content_hash enables diffing against previous snapshots.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.conversation_blocks_history (
    id                UUID NOT NULL,
    conversation_id   UUID NOT NULL,
    snapshot_id       UUID NOT NULL,
    block_index       INTEGER NOT NULL,
    parent_turn_id    TEXT,
    parent_block_id   UUID,
    block_type        TEXT NOT NULL DEFAULT 'paragraph',
    content_md        TEXT NOT NULL DEFAULT '',
    content_hash      TEXT NOT NULL DEFAULT '',
    dom_path          TEXT,
    dom_fingerprint   TEXT,
    first_line_no     INTEGER,
    last_line_no      INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    as_of_dt          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_dt     TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00'
);

ALTER TABLE nebula.conversation_blocks_history
    ADD PRIMARY KEY (id, as_of_dt);

-- List blocks for a snapshot, ordered by position
CREATE INDEX IF NOT EXISTS idx_blocks_history_snapshot
    ON nebula.conversation_blocks_history (snapshot_id, block_index)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Diff support: find blocks by content hash within a snapshot
CREATE INDEX IF NOT EXISTS idx_blocks_history_hash
    ON nebula.conversation_blocks_history (snapshot_id, content_hash)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active-id uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_active_id
    ON nebula.conversation_blocks_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active view
CREATE OR REPLACE VIEW nebula.conversation_blocks AS
SELECT id, conversation_id, snapshot_id, block_index, parent_turn_id,
       parent_block_id, block_type, content_md, content_hash, dom_path,
       dom_fingerprint, first_line_no, last_line_no, created_at
FROM   nebula.conversation_blocks_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- Insert trigger
CREATE OR REPLACE FUNCTION nebula.conversation_blocks_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
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

CREATE TRIGGER trg_conversation_blocks_insert
    INSTEAD OF INSERT ON nebula.conversation_blocks
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_blocks_insert_trigger();

-- Update trigger
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
         parent_block_id, block_type, content_md, content_hash, dom_path,
         dom_fingerprint, first_line_no, last_line_no, created_at,
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
         OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, conversation_id, snapshot_id, block_index, parent_turn_id,
              parent_block_id, block_type, content_md, content_hash,
              dom_path, dom_fingerprint, first_line_no, last_line_no,
              created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conversation_blocks_update
    INSTEAD OF UPDATE ON nebula.conversation_blocks
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_blocks_update_trigger();

-- Delete trigger
CREATE OR REPLACE FUNCTION nebula.conversation_blocks_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.conversation_blocks_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conversation_blocks_delete
    INSTEAD OF DELETE ON nebula.conversation_blocks
    FOR EACH ROW EXECUTE FUNCTION nebula.conversation_blocks_delete_trigger();


-- ═══════════════════════════════════════════════════════════════════════
--  3. segments
--     User-defined block ranges with classification and lifecycle state.
--     Segment is defined by a start block and end block within a snapshot.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.segments_history (
    id                UUID NOT NULL,
    conversation_id   UUID NOT NULL,
    snapshot_id       UUID NOT NULL,
    start_block_id    UUID NOT NULL,
    end_block_id      UUID NOT NULL,
    start_block_index INTEGER NOT NULL,
    end_block_index   INTEGER NOT NULL,
    segment_type      TEXT,
    state             TEXT NOT NULL DEFAULT 'PROPOSED',
    source            TEXT NOT NULL DEFAULT 'USER',
    title             TEXT,
    notes_md          TEXT,
    created_by        TEXT NOT NULL DEFAULT 'USER',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    as_of_dt          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_dt     TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00'
);

ALTER TABLE nebula.segments_history
    ADD PRIMARY KEY (id, as_of_dt);

-- List segments for a snapshot, ordered by position
CREATE INDEX IF NOT EXISTS idx_segments_history_snapshot
    ON nebula.segments_history (snapshot_id, start_block_index, end_block_index)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active-id uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_segments_active_id
    ON nebula.segments_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active view
CREATE OR REPLACE VIEW nebula.segments AS
SELECT id, conversation_id, snapshot_id, start_block_id, end_block_id,
       start_block_index, end_block_index, segment_type, state, source,
       title, notes_md, created_by, created_at
FROM   nebula.segments_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- Insert trigger
CREATE OR REPLACE FUNCTION nebula.segments_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
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

CREATE TRIGGER trg_segments_insert
    INSTEAD OF INSERT ON nebula.segments
    FOR EACH ROW EXECUTE FUNCTION nebula.segments_insert_trigger();

-- Update trigger
CREATE OR REPLACE FUNCTION nebula.segments_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.segments_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.segments_history
        (id, conversation_id, snapshot_id, start_block_id, end_block_id,
         start_block_index, end_block_index, segment_type, state, source,
         title, notes_md, created_by, created_at, as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.conversation_id, NEW.snapshot_id,
         NEW.start_block_id, NEW.end_block_id,
         NEW.start_block_index, NEW.end_block_index,
         COALESCE(NEW.segment_type, OLD.segment_type),
         COALESCE(NEW.state, OLD.state),
         COALESCE(NEW.source, OLD.source),
         COALESCE(NEW.title, OLD.title),
         COALESCE(NEW.notes_md, OLD.notes_md),
         COALESCE(NEW.created_by, OLD.created_by),
         OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, conversation_id, snapshot_id, start_block_id, end_block_id,
              start_block_index, end_block_index, segment_type, state, source,
              title, notes_md, created_by, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_segments_update
    INSTEAD OF UPDATE ON nebula.segments
    FOR EACH ROW EXECUTE FUNCTION nebula.segments_update_trigger();

-- Delete trigger
CREATE OR REPLACE FUNCTION nebula.segments_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.segments_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_segments_delete
    INSTEAD OF DELETE ON nebula.segments
    FOR EACH ROW EXECUTE FUNCTION nebula.segments_delete_trigger();


-- ═══════════════════════════════════════════════════════════════════════
--  4. harvest_references
--     Typed, confidence-weighted edges connecting blocks and segments.
--     Edges can connect block→block, block→segment, segment→block,
--     or segment→segment. Produced by HARVEST pipeline, BP, or USER.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.harvest_references_history (
    id                UUID NOT NULL,
    conversation_id   UUID NOT NULL,
    snapshot_id       UUID NOT NULL,
    source_block_id   UUID,
    source_segment_id UUID,
    target_block_id   UUID,
    target_segment_id UUID,
    edge_type         TEXT NOT NULL DEFAULT 'implicit',
    confidence        NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
    state             TEXT NOT NULL DEFAULT 'CANDIDATE',
    source            TEXT NOT NULL DEFAULT 'HARVEST',
    reason            TEXT,
    evidence_json     JSONB,
    provenance_json   JSONB,
    created_by        TEXT NOT NULL DEFAULT 'SYSTEM',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    as_of_dt          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_dt     TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00'
);

ALTER TABLE nebula.harvest_references_history
    ADD PRIMARY KEY (id, as_of_dt);

-- List references for a snapshot, ordered by confidence desc
CREATE INDEX IF NOT EXISTS idx_harvest_refs_history_snapshot
    ON nebula.harvest_references_history (snapshot_id, state, confidence DESC)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Find references involving a specific block or segment (as source or target)
CREATE INDEX IF NOT EXISTS idx_harvest_refs_history_source_block
    ON nebula.harvest_references_history (source_block_id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_harvest_refs_history_target_block
    ON nebula.harvest_references_history (target_block_id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_harvest_refs_history_source_segment
    ON nebula.harvest_references_history (source_segment_id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_harvest_refs_history_target_segment
    ON nebula.harvest_references_history (target_segment_id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active-id uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_harvest_refs_active_id
    ON nebula.harvest_references_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active view
CREATE OR REPLACE VIEW nebula.harvest_references AS
SELECT id, conversation_id, snapshot_id, source_block_id, source_segment_id,
       target_block_id, target_segment_id, edge_type, confidence, state,
       source, reason, evidence_json, provenance_json, created_by, created_at
FROM   nebula.harvest_references_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- Insert trigger
CREATE OR REPLACE FUNCTION nebula.harvest_references_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
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

CREATE TRIGGER trg_harvest_references_insert
    INSTEAD OF INSERT ON nebula.harvest_references
    FOR EACH ROW EXECUTE FUNCTION nebula.harvest_references_insert_trigger();

-- Update trigger
CREATE OR REPLACE FUNCTION nebula.harvest_references_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.harvest_references_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.harvest_references_history
        (id, conversation_id, snapshot_id, source_block_id, source_segment_id,
         target_block_id, target_segment_id, edge_type, confidence, state,
         source, reason, evidence_json, provenance_json, created_by,
         created_at, as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.conversation_id, NEW.snapshot_id,
         NEW.source_block_id, NEW.source_segment_id,
         NEW.target_block_id, NEW.target_segment_id,
         COALESCE(NEW.edge_type, OLD.edge_type),
         COALESCE(NEW.confidence, OLD.confidence),
         COALESCE(NEW.state, OLD.state),
         COALESCE(NEW.source, OLD.source),
         COALESCE(NEW.reason, OLD.reason),
         COALESCE(NEW.evidence_json, OLD.evidence_json),
         COALESCE(NEW.provenance_json, OLD.provenance_json),
         COALESCE(NEW.created_by, OLD.created_by),
         OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, conversation_id, snapshot_id, source_block_id,
              source_segment_id, target_block_id, target_segment_id,
              edge_type, confidence, state, source, reason,
              evidence_json, provenance_json, created_by, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_harvest_references_update
    INSTEAD OF UPDATE ON nebula.harvest_references
    FOR EACH ROW EXECUTE FUNCTION nebula.harvest_references_update_trigger();

-- Delete trigger
CREATE OR REPLACE FUNCTION nebula.harvest_references_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.harvest_references_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_harvest_references_delete
    INSTEAD OF DELETE ON nebula.harvest_references
    FOR EACH ROW EXECUTE FUNCTION nebula.harvest_references_delete_trigger();


-- ═══════════════════════════════════════════════════════════════════════
--  5. projection_overrides
--     Instructions controlling block/segment visibility in downstream
--     projections (BP, Planner, Reflection). The UI never deletes data —
--     blocks are suppressed via EXCLUDE overrides.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.projection_overrides_history (
    id                    UUID NOT NULL,
    conversation_id       UUID NOT NULL,
    snapshot_id           UUID NOT NULL,
    target_type           TEXT NOT NULL DEFAULT 'BLOCK',
    target_id             UUID NOT NULL,
    projection_target     TEXT NOT NULL DEFAULT 'BP',
    override_type         TEXT NOT NULL DEFAULT 'EXCLUDE',
    reason_code           TEXT NOT NULL DEFAULT 'USER_OVERRIDE',
    notes_md              TEXT,
    source                TEXT NOT NULL DEFAULT 'USER',
    created_by            TEXT NOT NULL DEFAULT 'USER',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    as_of_dt              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_dt         TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00'
);

ALTER TABLE nebula.projection_overrides_history
    ADD PRIMARY KEY (id, as_of_dt);

-- List overrides for a snapshot, filtered by projection target
CREATE INDEX IF NOT EXISTS idx_projection_overrides_history_snapshot
    ON nebula.projection_overrides_history (snapshot_id, projection_target, target_type)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Find overrides for a specific target (block, segment, or reference)
CREATE INDEX IF NOT EXISTS idx_projection_overrides_history_target
    ON nebula.projection_overrides_history (target_type, target_id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active-id uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_projection_overrides_active_id
    ON nebula.projection_overrides_history (id)
    WHERE expiration_dt = '9999-12-31 23:59:59+00';

-- Active view
CREATE OR REPLACE VIEW nebula.projection_overrides AS
SELECT id, conversation_id, snapshot_id, target_type, target_id,
       projection_target, override_type, reason_code, notes_md,
       source, created_by, created_at
FROM   nebula.projection_overrides_history
WHERE  NOW() >= as_of_dt AND NOW() < expiration_dt;

-- Insert trigger
CREATE OR REPLACE FUNCTION nebula.projection_overrides_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
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

CREATE TRIGGER trg_projection_overrides_insert
    INSTEAD OF INSERT ON nebula.projection_overrides
    FOR EACH ROW EXECUTE FUNCTION nebula.projection_overrides_insert_trigger();

-- Update trigger
CREATE OR REPLACE FUNCTION nebula.projection_overrides_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE nebula.projection_overrides_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    INSERT INTO nebula.projection_overrides_history
        (id, conversation_id, snapshot_id, target_type, target_id,
         projection_target, override_type, reason_code, notes_md,
         source, created_by, created_at, as_of_dt, expiration_dt)
    VALUES
        (OLD.id, NEW.conversation_id, NEW.snapshot_id,
         COALESCE(NEW.target_type, OLD.target_type),
         COALESCE(NEW.target_id, OLD.target_id),
         COALESCE(NEW.projection_target, OLD.projection_target),
         COALESCE(NEW.override_type, OLD.override_type),
         COALESCE(NEW.reason_code, OLD.reason_code),
         COALESCE(NEW.notes_md, OLD.notes_md),
         COALESCE(NEW.source, OLD.source),
         COALESCE(NEW.created_by, OLD.created_by),
         OLD.created_at, NOW(), '9999-12-31 23:59:59+00')
    RETURNING id, conversation_id, snapshot_id, target_type, target_id,
              projection_target, override_type, reason_code, notes_md,
              source, created_by, created_at INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projection_overrides_update
    INSTEAD OF UPDATE ON nebula.projection_overrides
    FOR EACH ROW EXECUTE FUNCTION nebula.projection_overrides_update_trigger();

-- Delete trigger
CREATE OR REPLACE FUNCTION nebula.projection_overrides_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE nebula.projection_overrides_history
    SET    expiration_dt = NOW()
    WHERE  id = OLD.id AND expiration_dt = '9999-12-31 23:59:59+00';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projection_overrides_delete
    INSTEAD OF DELETE ON nebula.projection_overrides
    FOR EACH ROW EXECUTE FUNCTION nebula.projection_overrides_delete_trigger();


-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM nebula.conversation_snapshots;
    RAISE NOTICE 'Active conversation_snapshots: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.conversation_blocks;
    RAISE NOTICE 'Active conversation_blocks: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.segments;
    RAISE NOTICE 'Active segments: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.harvest_references;
    RAISE NOTICE 'Active harvest_references: %', v_count;

    SELECT COUNT(*) INTO v_count FROM nebula.projection_overrides;
    RAISE NOTICE 'Active projection_overrides: %', v_count;

    RAISE NOTICE 'Migration 003 complete — 5 new bitemporal tables created.';
    RAISE NOTICE 'History tables: nebula.{table}_history';
    RAISE NOTICE 'Active views:   nebula.{table}';
END $$;

COMMIT;
