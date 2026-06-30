-- ═══════════════════════════════════════════════════════════════════════
--  Migration 014 — Evidence Links: harvest → knowledge bridge table
--
--  Creates knowledge.evidence_links, the typed bridge connecting raw
--  harvested evidence (nebula.harvests_history / harvest_candidates) to
--  semantic knowledge graph entities (knowledge.graph_entities).
--
--  This is NOT a generic cross-reference table (use nebula.cross_references
--  for arbitrary entity-to-entity links). evidence_links is specifically
--  for the harvest→knowledge pipeline: each row is a provenance-tracked
--  claim like "entity X is supported by harvest candidate Y with
--  confidence 0.87".
--
--  This enables:
--    - Traceability: every knowledge graph node knows which source docs
--      support or contradict it
--    - Confidence scoring: link-level confidence aggregates into entity
--      confidence
--    - Provenance audit: every link records how it was established
--      (auto_ingestor, manual, reconciler)
--    - Selective regeneration: when a harvest is re-run, its evidence
--      links can be invalidated and rebuilt
--
--  Schema: knowledge (same schema as graph_entities, graph_edges)
--  Depends on: knowledge.graph_entities, nebula.harvests_history,
--              nebula.harvest_candidates
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 014-evidence-links.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  Evidence Link Type Taxonomy (stored as enum-compatible TEXT)
-- ═══════════════════════════════════════════════════════════════════════

-- We use TEXT + CHECK constraint rather than a native PG ENUM so that
-- new types can be added via migration without ALTER TYPE ... ADD VALUE,
-- which requires a full table lock and doesn't support DROP.
-- The canonical type list lives in evidence-link-type.ts on the server.

CREATE DOMAIN knowledge.evidence_link_type AS TEXT
CONSTRAINT valid_evidence_link_type CHECK (
    VALUE IN (
        'supports',       -- Entity is supported by the evidence
        'refines',        -- Evidence refines/elaborates entity details
        'instantiates',   -- Evidence is a concrete instance of the entity concept
        'contradicts',    -- Evidence contradicts the entity
        'supersedes',     -- This evidence supersedes older evidence for this entity
        'mentions',       -- Evidence mentions the entity (weakest link)
        'informs',        -- Evidence informs entity definition without direct support
        'validates'       -- Evidence validates entity correctness
    )
);

COMMENT ON DOMAIN knowledge.evidence_link_type IS
    'Enumerated taxonomy of evidence-to-knowledge link semantics.
     supports | refines | instantiates | contradicts | supersedes | mentions | informs | validates';

-- ═══════════════════════════════════════════════════════════════════════
--  Evidence Links Table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS knowledge.evidence_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── Knowledge graph entity (the "subject" of the evidence claim) ──
    knowledge_entity_id UUID         NOT NULL,

    -- ── Source evidence identifiers (at least one should be non-null) ─
    nebula_harvest_id   UUID,         -- The harvest this evidence came from
    nebula_candidate_id UUID,         -- Specific candidate within the harvest

    -- ── Link semantics ──────────────────────────────────────────────
    link_type           knowledge.evidence_link_type NOT NULL,

    -- Confidence in this link (0.0000–1.0000).
    -- NULL = confidence not yet assessed (e.g., newly ingested).
    confidence          NUMERIC(5,4),

    -- Provenance: how this link was established.
    --   'auto_ingestor'   → created by the automated harvest→knowledge pipeline
    --   'manual'           → user/agent-created
    --   'reconciler'       → created by the reconciliation/steward service
    --   'llm_extracted'    → extracted by LLM during knowledge graph build
    --   'migration'        → backfilled during system migration
    provenance          TEXT NOT NULL DEFAULT 'auto_ingestor',

    -- Rationale: free-text explanation of why this link exists.
    rationale           TEXT,

    -- Source span: precise location in the source material.
    -- Example: {"start_offset": 142, "end_offset": 389, "chunk_index": 0, "chunk_label": "introduction"}
    source_span         JSONB,

    -- Extensible metadata (e.g., extraction model, prompt template, etc.)
    metadata            JSONB NOT NULL DEFAULT '{}',

    -- Temporal
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ── Constraints ──────────────────────────────────────────────────
    -- At least one source identifier should be present
    CONSTRAINT chk_evidence_has_source
        CHECK (nebula_harvest_id IS NOT NULL OR nebula_candidate_id IS NOT NULL),

    -- Prevent duplicate evidence links (same entity, same source, same type).
    -- Note: PostgreSQL treats NULLs as distinct in unique constraints, so
    -- (entity_A, NULL, NULL, 'supports') and (entity_A, NULL, NULL, 'supports')
    -- are NOT duplicates. This is intentional — multiple manual links for the
    -- same entity+type are allowed (they differ by provenance/rationale).
    UNIQUE (knowledge_entity_id, nebula_harvest_id, nebula_candidate_id, link_type)
);

-- ═══════════════════════════════════════════════════════════════════════
--  Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Lookup by knowledge entity (most common query: "what evidence supports this entity?")
CREATE INDEX IF NOT EXISTS idx_evidence_links_entity
    ON knowledge.evidence_links (knowledge_entity_id);

-- Lookup by harvest (regeneration query: "invalidate all links from this harvest")
CREATE INDEX IF NOT EXISTS idx_evidence_links_harvest
    ON knowledge.evidence_links (nebula_harvest_id)
    WHERE nebula_harvest_id IS NOT NULL;

-- Lookup by candidate (point query: "what entities does this candidate support?")
CREATE INDEX IF NOT EXISTS idx_evidence_links_candidate
    ON knowledge.evidence_links (nebula_candidate_id)
    WHERE nebula_candidate_id IS NOT NULL;

-- Filter by link type
CREATE INDEX IF NOT EXISTS idx_evidence_links_type
    ON knowledge.evidence_links (link_type);

-- Filter by confidence for scoring queries
CREATE INDEX IF NOT EXISTS idx_evidence_links_confidence
    ON knowledge.evidence_links (confidence NULLS LAST)
    WHERE confidence IS NOT NULL;

-- Composite: entity + type (for aggregate scoring)
CREATE INDEX IF NOT EXISTS idx_evidence_links_entity_type
    ON knowledge.evidence_links (knowledge_entity_id, link_type);

-- GIN index on metadata for JSON containment queries
CREATE INDEX IF NOT EXISTS idx_evidence_links_metadata
    ON knowledge.evidence_links USING GIN (metadata);

-- ═══════════════════════════════════════════════════════════════════════
--  Foreign Keys (not enforced at table creation — graph_entities and
--  harvest tables are created in separate migrations)
-- ═══════════════════════════════════════════════════════════════════════

-- FK to knowledge.graph_entities
-- Not added here: graph_entities is in a different migration and
-- may not exist yet when this migration runs. We add the constraint
-- in a separate DO block that handles the case gracefully.

DO $$
BEGIN
    -- Add FK to knowledge.graph_entities if the table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'knowledge' AND table_name = 'graph_entities') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'fk_evidence_links_entity'
                         AND table_schema = 'knowledge') THEN
            ALTER TABLE knowledge.evidence_links
                ADD CONSTRAINT fk_evidence_links_entity
                FOREIGN KEY (knowledge_entity_id)
                REFERENCES knowledge.graph_entities(id)
                ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  Trigger: set created_at on INSERT (defensive — should be handled by DEFAULT)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION knowledge.set_evidence_links_created_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_at = COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                   WHERE tgname = 'trg_evidence_links_created_at'
                     AND tgrelid = 'knowledge.evidence_links'::regclass) THEN
        CREATE TRIGGER trg_evidence_links_created_at
            BEFORE INSERT ON knowledge.evidence_links
            FOR EACH ROW EXECUTE FUNCTION knowledge.set_evidence_links_created_at();
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  Verification
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_count INTEGER;
    v_domain_ok BOOLEAN;
BEGIN
    -- Check domain exists and accepts valid values
    SELECT COUNT(*) = 1 INTO v_domain_ok
    FROM (
        SELECT 'supports'::knowledge.evidence_link_type AS t
        UNION ALL
        SELECT 'contradicts'::knowledge.evidence_link_type
    ) d;

    IF NOT v_domain_ok THEN
        RAISE EXCEPTION '❌ evidence_link_type domain validation failed';
    END IF;

    -- Check table exists
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'knowledge' AND table_name = 'evidence_links';

    IF v_count = 0 THEN
        RAISE EXCEPTION '❌ knowledge.evidence_links table was not created';
    END IF;

    RAISE NOTICE '✅ knowledge.evidence_links table created successfully';
    RAISE NOTICE '   Domain knowledge.evidence_link_type validated';
    RAISE NOTICE '   Indexes: entity, harvest, candidate, type, confidence, entity_type, metadata';
END $$;

COMMIT;
