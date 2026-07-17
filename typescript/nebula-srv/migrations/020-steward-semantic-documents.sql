-- ═══════════════════════════════════════════════════════════════════════
--  Migration 020 — Steward Semantic Documents: Shared Projection Layer
--  (Plan 1064)
--
--  Creates the `steward` schema and `steward.semantic_documents` table —
--  a shared semantic projection layer with embeddings (VECTOR(1536)) over
--  knowledge graph entities and harvest candidates.
--
--  The semantic layer is a PROJECTION over:
--    - knowledge.graph_entities
--    - nebula.harvests / nebula.harvest_candidates
--    - nebula.agent_records
--    - (later: PEB docs, requirements, incidents)
--
--  Vector indexes live on steward-owned tables, NOT on Nebula itself,
--  preserving the cabinet/memory boundary.
--
--  Requires: pgvector extension (already installed)
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 020-steward-semantic-documents.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  Schema
-- ═══════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS steward;

COMMENT ON SCHEMA steward IS
    'Steward-owned schema: semantic projections, evidence bridges, and '
    'cognitive API surface. Steward is the maintainer of the knowledge '
    'graph (KG) — the cognitive model. Nebula is operational reality. '
    'KG references Nebula but never becomes it.';

-- ═══════════════════════════════════════════════════════════════════════
--  Document Kind Enum (TEXT + CHECK, not native ENUM for extensibility)
-- ═══════════════════════════════════════════════════════════════════════

CREATE DOMAIN steward.document_kind AS TEXT
CONSTRAINT valid_document_kind CHECK (
    VALUE IN (
        'knowledge_entity',    -- Entity from knowledge.graph_entities
        'harvest_candidate',   -- Candidate from nebula.harvest_candidates
        'transcript_chunk',    -- Chunk from a harvest transcript
        'agent_record',        -- Record from nebula.agent_records
        'requirement',         -- Requirement from nebula.requirements
        'plan',                -- Plan from nebula.plans
        'incident',            -- Incident (future)
        'peb_document'         -- PEB document (future)
    )
);

COMMENT ON DOMAIN steward.document_kind IS
    'Enumerated taxonomy of document origins for the semantic projection layer.';

-- ═══════════════════════════════════════════════════════════════════════
--  Origin System Enum
-- ═══════════════════════════════════════════════════════════════════════

CREATE DOMAIN steward.origin_system AS TEXT
CONSTRAINT valid_origin_system CHECK (
    VALUE IN ('knowledge', 'nebula')
);

COMMENT ON DOMAIN steward.origin_system IS
    'Which system the document originates from: knowledge (KG/cognitive) '
    'or nebula (operational/filing cabinets).';

-- ═══════════════════════════════════════════════════════════════════════
--  Semantic Documents Table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS steward.semantic_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── Origin tracking ─────────────────────────────────────────────
    origin_system       steward.origin_system NOT NULL,
    origin_table        TEXT NOT NULL,          -- e.g. 'graph_entities', 'harvest_candidates', 'agent_records'
    origin_id           TEXT NOT NULL,          -- UUID or ID from the origin table

    -- ── Document content ────────────────────────────────────────────
    document_kind       steward.document_kind NOT NULL,
    title               TEXT NOT NULL DEFAULT '',
    body                TEXT NOT NULL DEFAULT '',

    -- ── Embedding ───────────────────────────────────────────────────
    -- VECTOR(1536) matches OpenAI text-embedding-ada-002 / text-embedding-3-small dimensions
    embedding           vector(1536),

    -- ── Metadata ────────────────────────────────────────────────────
    metadata            JSONB NOT NULL DEFAULT '{}',

    -- ── Embedding pipeline tracking ─────────────────────────────────
    embedding_model     TEXT,                   -- e.g. 'text-embedding-3-small'
    embedding_generated_at TIMESTAMPTZ,
    embedding_version   INTEGER DEFAULT 1,      -- Bumped when re-embedding

    -- ── Temporal ────────────────────────────────────────────────────
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ── Constraints ─────────────────────────────────────────────────
    -- One document per origin system + table + id + kind
    UNIQUE (origin_system, origin_table, origin_id, document_kind)
);

-- ═══════════════════════════════════════════════════════════════════════
--  Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Lookup by origin (reverse lookup: "which semantic docs project from this entity?")
CREATE INDEX IF NOT EXISTS idx_semantic_docs_origin
    ON steward.semantic_documents (origin_system, origin_table, origin_id);

-- Lookup by document kind (filter to specific projection types)
CREATE INDEX IF NOT EXISTS idx_semantic_docs_kind
    ON steward.semantic_documents (document_kind);

-- Lookup by origin system (filter to knowledge vs nebula projections)
CREATE INDEX IF NOT EXISTS idx_semantic_docs_system
    ON steward.semantic_documents (origin_system);

-- GIN index on metadata for JSON containment queries
CREATE INDEX IF NOT EXISTS idx_semantic_docs_metadata
    ON steward.semantic_documents USING GIN (metadata);

-- ── Vector Index ─────────────────────────────────────────────────────────
-- Using IVFFlat for approximate nearest neighbor search.
-- lists = sqrt(rows) heuristic; tuned for ~10k documents initially.
-- The vector index lives on the steward-owned table, NOT on Nebula.

CREATE INDEX IF NOT EXISTS idx_semantic_docs_embedding
    ON steward.semantic_documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ═══════════════════════════════════════════════════════════════════════
--  Trigger: update updated_at on modification
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION steward.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                   WHERE tgname = 'trg_semantic_docs_updated_at'
                     AND tgrelid = 'steward.semantic_documents'::regclass) THEN
        CREATE TRIGGER trg_semantic_docs_updated_at
            BEFORE UPDATE ON steward.semantic_documents
            FOR EACH ROW EXECUTE FUNCTION steward.set_updated_at();
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  Helper: detect documents with missing embeddings
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION steward.docs_missing_embeddings(
    limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    origin_system steward.origin_system,
    origin_table TEXT,
    origin_id TEXT,
    document_kind steward.document_kind,
    title TEXT
)
LANGUAGE sql STABLE AS $$
    SELECT id, origin_system, origin_table, origin_id, document_kind, title
    FROM steward.semantic_documents
    WHERE embedding IS NULL
    ORDER BY created_at ASC
    LIMIT limit_count;
$$;

COMMENT ON FUNCTION steward.docs_missing_embeddings IS
    'Find semantic documents that need embeddings generated. Used by the '
    'embedding pipeline worker: detect missing → generate → update.';

-- ═══════════════════════════════════════════════════════════════════════
--  Helper: semantic similarity search
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION steward.semantic_search(
    query_embedding vector(1536),
    match_count INTEGER DEFAULT 10,
    filter_kind steward.document_kind DEFAULT NULL,
    filter_system steward.origin_system DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    origin_system steward.origin_system,
    origin_table TEXT,
    origin_id TEXT,
    document_kind steward.document_kind,
    title TEXT,
    body TEXT,
    similarity FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT
        id, origin_system, origin_table, origin_id, document_kind,
        title, body,
        1 - (embedding <=> query_embedding) AS similarity
    FROM steward.semantic_documents
    WHERE embedding IS NOT NULL
      AND (filter_kind IS NULL OR document_kind = filter_kind)
      AND (filter_system IS NULL OR origin_system = filter_system)
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

COMMENT ON FUNCTION steward.semantic_search IS
    'Semantic similarity search over the projection layer. Returns documents '
    'ranked by cosine similarity to the query embedding. Optional filters by '
    'document kind and origin system.';

-- ═══════════════════════════════════════════════════════════════════════
--  Verification
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'steward' AND table_name = 'semantic_documents';

    IF v_count = 0 THEN
        RAISE EXCEPTION '❌ steward.semantic_documents table was not created';
    END IF;

    RAISE NOTICE '✅ steward.semantic_documents table created successfully';
    RAISE NOTICE '   Schema: steward (new)';
    RAISE NOTICE '   Domains: steward.document_kind, steward.origin_system';
    RAISE NOTICE '   Vector index: ivfflat (cosine, lists=100)';
    RAISE NOTICE '   Helpers: docs_missing_embeddings(), semantic_search()';
END $$;

COMMIT;
