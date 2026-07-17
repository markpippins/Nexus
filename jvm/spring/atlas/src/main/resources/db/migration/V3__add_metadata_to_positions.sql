-- Atlas V3: Add component metadata columns to graph_view_positions

ALTER TABLE registry.graph_view_positions
    ADD COLUMN IF NOT EXISTS label       TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS color       TEXT;
