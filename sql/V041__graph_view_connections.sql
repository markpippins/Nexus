-- Migration: graph edge persistence as first-class rows
-- Adds the graph_view_connections table and migrates any existing JSONB
-- connections from graph_views.connections into relational rows.

CREATE TABLE IF NOT EXISTS registry.graph_view_connections (
    id              BIGSERIAL PRIMARY KEY,
    graph_view_id   BIGINT NOT NULL REFERENCES registry.graph_views(id) ON DELETE CASCADE,
    source_node_id  VARCHAR NOT NULL,
    target_node_id  VARCHAR NOT NULL,
    direction       VARCHAR(20) NOT NULL CHECK (direction IN ('OUTBOUND', 'BIDIRECTIONAL')),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (graph_view_id, source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_graph_view_connections_view
    ON registry.graph_view_connections(graph_view_id);

-- Migrate existing JSONB connections (idempotent: skip rows that already exist)
DO $$
DECLARE
    rec RECORD;
    conn RECORD;
BEGIN
    FOR rec IN SELECT id, connections FROM registry.graph_views WHERE connections IS NOT NULL LOOP
        FOR conn IN SELECT
                        (elem->>'sourceNodeId')::text AS source_node_id,
                        (elem->>'targetNodeId')::text AS target_node_id,
                        COALESCE((elem->>'direction')::text, 'OUTBOUND') AS direction
                    FROM jsonb_array_elements(rec.connections::jsonb) AS elem LOOP
            BEGIN
                INSERT INTO registry.graph_view_connections (graph_view_id, source_node_id, target_node_id, direction)
                VALUES (rec.id, conn.source_node_id, conn.target_node_id, conn.direction)
                ON CONFLICT (graph_view_id, source_node_id, target_node_id) DO NOTHING;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Failed to migrate connection for graph_view_id=%: %', rec.id, SQLERRM;
            END;
        END LOOP;
    END LOOP;
END $$;

-- The old JSONB column can be dropped after the migration is verified.
-- ALTER TABLE registry.graph_views DROP COLUMN connections;
