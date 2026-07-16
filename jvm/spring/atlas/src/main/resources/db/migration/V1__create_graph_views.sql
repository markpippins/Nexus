-- Atlas V1: Graph Views — saved camera + node position presets
-- Schema: registry (shared with service-registry)

CREATE TABLE IF NOT EXISTS registry.graph_views (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    camera_position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    camera_position_y DOUBLE PRECISION NOT NULL DEFAULT 40,
    camera_position_z DOUBLE PRECISION NOT NULL DEFAULT 120,
    camera_target_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    camera_target_y DOUBLE PRECISION NOT NULL DEFAULT 15,
    camera_target_z DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registry.graph_view_positions (
    id              BIGSERIAL PRIMARY KEY,
    graph_view_id   BIGINT NOT NULL REFERENCES registry.graph_views(id) ON DELETE CASCADE,
    node_id         TEXT NOT NULL,
    position_x      DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y      DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_z      DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(graph_view_id, node_id)
);

-- Ensure only one default view at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_views_single_default
    ON registry.graph_views(is_default) WHERE is_default = true;
