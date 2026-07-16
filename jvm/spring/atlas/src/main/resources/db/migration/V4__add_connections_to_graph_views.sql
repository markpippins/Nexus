-- Atlas V4: Add connections JSONB column to graph_views

ALTER TABLE registry.graph_views
    ADD COLUMN IF NOT EXISTS connections JSONB;
