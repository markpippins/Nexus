-- V049: Fix knowledge.semantic_search() and related schema issues
--
-- Bug: semantic_search() accepted query_text but never embedded it.
-- It computed distance to a zero vector, returning plausible-looking
-- but meaningless results. The function was a documented stub but
-- callable and returned misleading output.
--
-- Fix: Rewrite to accept a pre-embedded query vector (768-dim,
-- matching nomic-embed-text) and search graph_entity_embeddings
-- (the actual embedding table) instead of graph_entities.embedding
-- (which is empty and wrong dimension).
--
-- Also:
-- 1. Fix v_graph_summary to count from graph_entity_embeddings
-- 2. Add unique constraint to graph_edges to prevent duplicates
-- 3. Drop graph_entities.embedding (empty, wrong dimension, misleading)

-- ── 1. Rewrite semantic_search() ──────────────────────────────────

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

-- ── 2. Fix v_graph_summary ────────────────────────────────────────

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

-- ── 3. Add unique constraint to graph_edges ───────────────────────

ALTER TABLE knowledge.graph_edges
    ADD CONSTRAINT uq_graph_edges
    UNIQUE (source_section, source_id, relation_type, target_section, target_id);

-- ── 4. Drop graph_entities.embedding ──────────────────────────────

-- First drop the index that depends on the column
DROP INDEX IF EXISTS knowledge.idx_graph_entities_embedding;

-- Then drop the column
ALTER TABLE knowledge.graph_entities DROP COLUMN IF EXISTS embedding;

-- ── 5. Update knowledge-graph.sql schema file ─────────────────────
-- (This is a projection; the DDL above is canonical)
