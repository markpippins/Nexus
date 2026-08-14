-- V105: Knowledge-graph edge provenance + real FK constraints (T24 step 4)
--
-- Applies the edge-endpoint contract from schemas/projections/knowledge-graph.sql
-- to the live knowledge schema:
--   * graph_edges gains per-edge provenance (source_migration_id, resolution,
--     unresolved_reason) so unresolved edges are preserved losslessly instead
--     of deleted (issue #33 regression).
--   * graph_edges + graph_cross_references gain real FK constraints on their
--     (section, entity_id) endpoints, replacing the old replica-role bypass.
--
-- Both edge tables are currently 0 rows (the 08-08 rebuild zeroed them), so
-- the constraints apply cleanly. graph_entities already carries the required
-- UNIQUE (section, entity_id).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / DO-block constraint guards).

BEGIN;

-- ── 1. Provenance columns on graph_edges ────────────────────────────────

ALTER TABLE knowledge.graph_edges
    ADD COLUMN IF NOT EXISTS source_migration_id UUID;

ALTER TABLE knowledge.graph_edges
    ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT 'resolved';

ALTER TABLE knowledge.graph_edges
    ADD COLUMN IF NOT EXISTS unresolved_reason TEXT;

-- ── 2. Real FKs on graph_edges ──────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'graph_edges_source_fkey'
          AND conrelid = 'knowledge.graph_edges'::regclass
    ) THEN
        ALTER TABLE knowledge.graph_edges
            ADD CONSTRAINT graph_edges_source_fkey
            FOREIGN KEY (source_section, source_id)
            REFERENCES knowledge.graph_entities(section, entity_id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'graph_edges_target_fkey'
          AND conrelid = 'knowledge.graph_edges'::regclass
    ) THEN
        ALTER TABLE knowledge.graph_edges
            ADD CONSTRAINT graph_edges_target_fkey
            FOREIGN KEY (target_section, target_id)
            REFERENCES knowledge.graph_entities(section, entity_id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- ── 3. Real FKs on graph_cross_references ───────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'graph_cross_refs_source_fkey'
          AND conrelid = 'knowledge.graph_cross_references'::regclass
    ) THEN
        ALTER TABLE knowledge.graph_cross_references
            ADD CONSTRAINT graph_cross_refs_source_fkey
            FOREIGN KEY (source_section, source_id)
            REFERENCES knowledge.graph_entities(section, entity_id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'graph_cross_refs_target_fkey'
          AND conrelid = 'knowledge.graph_cross_references'::regclass
    ) THEN
        ALTER TABLE knowledge.graph_cross_references
            ADD CONSTRAINT graph_cross_refs_target_fkey
            FOREIGN KEY (target_section, target_id)
            REFERENCES knowledge.graph_entities(section, entity_id)
            ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
