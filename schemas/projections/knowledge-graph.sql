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
    FOREIGN KEY (target_section, target_id) REFERENCES knowledge.graph_entities(section, entity_id) ON DELETE CASCADE,

    -- Prevent duplicate edges
    UNIQUE (source_section, source_id, relation_type, target_section, target_id)
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

-- Full graph summary (counts entities with embeddings in graph_entity_embeddings)
CREATE OR REPLACE VIEW knowledge.v_graph_summary AS
SELECT
    e.section,
    count(DISTINCT e.entity_id) AS entity_count,
    count(DISTINCT em.kg_entity_id) AS embedded_count
FROM knowledge.graph_entities e
LEFT JOIN knowledge.graph_entity_embeddings em
    ON e.entity_id = em.kg_entity_id AND e.section = em.section
GROUP BY e.section
ORDER BY e.section;

-- ── Semantic search ───────────────────────────────────────────────
-- Usage: SELECT * FROM knowledge.semantic_search($1::vector, 10);
-- Note: query_embedding must be a 768-dim vector (nomic-embed-text).
-- Embedding is done at the application layer via Ollama.
CREATE OR REPLACE FUNCTION knowledge.semantic_search(
    query_embedding VECTOR(768),
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
BEGIN
    RETURN QUERY
    SELECT
        ge.section,
        ge.kg_entity_id,
        ge.name,
        ge.embed_text,
        (1 - (ge.embedding <=> query_embedding))::real AS similarity
    FROM knowledge.graph_entity_embeddings ge
    WHERE
        (target_section IS NULL OR ge.section = target_section)
    ORDER BY
        ge.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$;
