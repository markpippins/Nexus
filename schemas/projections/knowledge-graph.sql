-- Knowledge Graph DDL — PostgreSQL + JSONB + pgvector
-- Projected from: nexus/schemas/core/knowledge-graph.jsonld
-- Migration: read nexus/graph/nexus-knowledge-graph.json into these tables

-- Requires pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Entity table: every node in the knowledge graph ──────────────────
CREATE TABLE IF NOT EXISTS knowledge.graph_entities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section         TEXT NOT NULL,           -- 'types', 'actors', 'decisions', 'gaps_and_blockers', etc.
    entity_id       TEXT NOT NULL,           -- the 'id' field from the JSON source
    name            TEXT,                    -- the 'name' field if present (queryable)
    entity_type     TEXT,                    -- 'category' for types, 'type' for actors, 'severity' for gaps, etc.
    status          TEXT,                    -- 'status' for actors and decisions
    description     TEXT,                    -- extracted description text for embedding
    properties      JSONB NOT NULL DEFAULT '{}',  -- the full original JSON payload
    embedding       VECTOR(1536),            -- pgvector: OpenAI ada-002 / nomic-embed-text compatible
    source_file     TEXT,                    -- which graph file this came from (for multi-source tracking)
    checksum        TEXT,                    -- SHA256 of properties JSON for integrity
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Each entity is unique within its section
    UNIQUE (section, entity_id)
);

-- ── Edge table: every relationship in the knowledge graph ────────────
CREATE TABLE IF NOT EXISTS knowledge.graph_edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_section  TEXT NOT NULL,
    source_id       TEXT NOT NULL,
    relation_type   TEXT NOT NULL,           -- 'produces', 'consumes', 'governed_by', 'references', 'depends_on', etc.
    target_section  TEXT,
    target_id       TEXT NOT NULL,
    properties      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Quick lookup: all edges from/to an entity
    FOREIGN KEY (source_section, source_id) REFERENCES knowledge.graph_entities(section, entity_id) ON DELETE CASCADE,
    FOREIGN KEY (target_section, target_id) REFERENCES knowledge.graph_entities(section, entity_id) ON DELETE CASCADE
);

-- ── Cross-reference table: section-to-section link maps ──────────────
CREATE TABLE IF NOT EXISTS knowledge.graph_cross_references (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_name        TEXT NOT NULL,           -- 'cirs_to_projection_algebra', 'decisions_to_cirs_rules', etc.
    source_section  TEXT,
    source_id       TEXT,
    target_section  TEXT,
    target_id       TEXT,
    weight          REAL DEFAULT 1.0,
    properties      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Migration tracking ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge.graph_migrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file     TEXT NOT NULL,
    file_checksum   TEXT NOT NULL,
    entity_count    INTEGER NOT NULL,
    edge_count      INTEGER NOT NULL,
    cross_ref_count INTEGER NOT NULL,
    version         TEXT,
    migrated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes for common query patterns ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_graph_entities_section ON knowledge.graph_entities(section);
CREATE INDEX IF NOT EXISTS idx_graph_entities_name ON knowledge.graph_entities(name);
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON knowledge.graph_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_entities_status ON knowledge.graph_entities(status);
CREATE INDEX IF NOT EXISTS idx_graph_entities_gin_props ON knowledge.graph_entities USING GIN (properties);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON knowledge.graph_edges(source_section, source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON knowledge.graph_edges(target_section, target_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_relation ON knowledge.graph_edges(relation_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source_relation ON knowledge.graph_edges(source_section, source_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_graph_cross_refs_map ON knowledge.graph_cross_references(map_name);

-- pgvector index for semantic search
-- Use cosine distance by default; switch to L2 or IP depending on embedding model
CREATE INDEX IF NOT EXISTS idx_graph_entities_embedding ON knowledge.graph_entities
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ── Views for common query patterns ────────────────────────────────

-- All edges for a given entity (by section:id)
CREATE OR REPLACE VIEW knowledge.v_entity_edges AS
SELECT
    e.id AS entity_uuid,
    e.section,
    e.entity_id,
    e.name,
    jsonb_agg(DISTINCT jsonb_build_object(
        'relation', g.relation_type,
        'target_section', g.target_section,
        'target_id', g.target_id
    )) FILTER (WHERE g.id IS NOT NULL) AS outgoing_edges,
    jsonb_agg(DISTINCT jsonb_build_object(
        'relation', g2.relation_type,
        'source_section', g2.source_section,
        'source_id', g2.source_id
    )) FILTER (WHERE g2.id IS NOT NULL) AS incoming_edges
FROM knowledge.graph_entities e
LEFT JOIN knowledge.graph_edges g ON g.source_section = e.section AND g.source_id = e.entity_id
LEFT JOIN knowledge.graph_edges g2 ON g2.target_section = e.section AND g2.target_id = e.entity_id
GROUP BY e.id, e.section, e.entity_id, e.name;

-- Full graph summary
CREATE OR REPLACE VIEW knowledge.v_graph_summary AS
SELECT
    section,
    count(*) AS entity_count,
    count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded_count
FROM knowledge.graph_entities
GROUP BY section
ORDER BY section;

-- ── Helper: semantic search ───────────────────────────────────────
-- Usage: SELECT * FROM knowledge.semantic_search('governance kernel', 10);
-- Note: this function is a STUB. Application-layer code must provide
-- the query embedding and replace the zero-vector parameter.
-- Until then, run:   SELECT * FROM semantic_search() WHERE false;
CREATE OR REPLACE FUNCTION knowledge.semantic_search(
    query_text TEXT DEFAULT NULL,
    result_limit INTEGER DEFAULT 10,
    target_section TEXT DEFAULT NULL
)
RETURNS TABLE(
    section TEXT,
    entity_id TEXT,
    name TEXT,
    description TEXT,
    similarity REAL
)
LANGUAGE plpgsql
AS $$
DECLARE
    zero_vec VECTOR(1536);
BEGIN
    -- Build a zero vector of the correct dimension for placeholder
    SELECT array_fill(0::real, ARRAY[1536])::vector(1536) INTO zero_vec;

    -- Embedding generation happens outside SQL (application layer).
    -- This function expects the caller to provide the query embedding
    -- via the zero_vec placeholder (or a proper parameter in production).
    RETURN QUERY
    SELECT
        ge.section,
        ge.entity_id,
        ge.name,
        ge.description,
        (1 - (ge.embedding <=> zero_vec))::real AS similarity
    FROM knowledge.graph_entities ge
    WHERE
        (target_section IS NULL OR ge.section = target_section)
        AND ge.embedding IS NOT NULL
        AND query_text IS NOT NULL  -- return empty until caller provides real embedding
    ORDER BY
        ge.embedding <=> zero_vec
    LIMIT result_limit;
END;
$$;
