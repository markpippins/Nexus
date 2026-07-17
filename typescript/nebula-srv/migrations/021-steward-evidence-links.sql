-- ═══════════════════════════════════════════════════════════════════════
--  Migration 021 — Steward Evidence Links: harvest ↔ knowledge bridge
--  (Plan 1065)
--
--  Creates `steward.evidence_links` — the typed bridge connecting raw
--  harvested evidence (nebula.harvest_candidates) to semantic knowledge
--  graph entities (knowledge.graph_entities).
--
--  This table lives in the `steward.*` schema, NOT `nebula.*` or
--  `knowledge.*`, because "harvest candidate X refines entity Y" is a
--  semantic judgment made by the Steward, not a harvest property or a
--  knowledge graph structural edge.
--
--  Link types: supports | refines | instantiates | contradicts
--  Status lifecycle: proposed → accepted → rejected → superseded
--
--  Links are additive: multiple candidates → one entity, one candidate →
--  multiple entities with different types.
--
--  Bidirectional traversal:
--    entity → supporting candidates → transcript
--    candidate → transcript source → linked entities
--
--  Depends on: Migration 020 (steward schema), knowledge.graph_entities,
--              nebula.harvest_candidates
--
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 021-steward-evidence-links.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  Evidence Link Type Domain
-- ═══════════════════════════════════════════════════════════════════════

CREATE DOMAIN steward.evidence_link_type AS TEXT
CONSTRAINT valid_evidence_link_type CHECK (
    VALUE IN (
        'supports',       -- Evidence supports the entity
        'refines',        -- Evidence refines/elaborates entity details
        'instantiates',   -- Evidence is a concrete instance of the entity concept
        'contradicts'     -- Evidence contradicts the entity
    )
);

COMMENT ON DOMAIN steward.evidence_link_type IS
    'Sufficient link types for system utility without ontology bloat. '
    'supports | refines | instantiates | contradicts';

-- ═══════════════════════════════════════════════════════════════════════
--  Evidence Link Status Domain
-- ═══════════════════════════════════════════════════════════════════════

CREATE DOMAIN steward.evidence_link_status AS TEXT
CONSTRAINT valid_evidence_link_status CHECK (
    VALUE IN (
        'proposed',       -- Newly created, pending Steward review
        'accepted',       -- Reviewed and promoted by Steward
        'rejected',       -- Reviewed and rejected by Steward
        'superseded'      -- Replaced by a newer link
    )
);

COMMENT ON DOMAIN steward.evidence_link_status IS
    'Lifecycle: proposed → accepted | rejected. Accepted links can be '
    'superseded when newer evidence arrives.';

-- ═══════════════════════════════════════════════════════════════════════
--  Evidence Links Table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS steward.evidence_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── Knowledge graph entity (the "subject" of the evidence claim) ──
    knowledge_entity_id UUID         NOT NULL,

    -- ── Source evidence ─────────────────────────────────────────────
    nebula_harvest_id   UUID,         -- The harvest this evidence came from
    nebula_candidate_id UUID,         -- Specific candidate within the harvest

    -- ── Link semantics ──────────────────────────────────────────────
    link_type           steward.evidence_link_type NOT NULL,

    -- ── Status lifecycle ────────────────────────────────────────────
    status              steward.evidence_link_status NOT NULL DEFAULT 'proposed',
    reviewed_by         TEXT,                        -- Agent role or user who reviewed
    reviewed_at         TIMESTAMPTZ,

    -- ── Confidence in this link (0.0000–1.0000) ─────────────────────
    confidence          NUMERIC(5,4),

    -- ── Provenance: how this link was established ───────────────────
    provenance          TEXT NOT NULL DEFAULT 'auto_ingestor',
    rationale           TEXT,

    -- ── Extensible metadata ─────────────────────────────────────────
    metadata            JSONB NOT NULL DEFAULT '{}',

    -- ── Temporal ────────────────────────────────────────────────────
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ── Constraints ─────────────────────────────────────────────────
    CONSTRAINT chk_evidence_has_source
        CHECK (nebula_harvest_id IS NOT NULL OR nebula_candidate_id IS NOT NULL)
    -- Accepted link uniqueness enforced via partial unique index below
);

-- ── Unique index: only one 'accepted' link per (entity, candidate, type) ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_links_accepted_unique
    ON steward.evidence_links (knowledge_entity_id, nebula_candidate_id, link_type)
    WHERE status = 'accepted' AND nebula_candidate_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  Indexes for bidirectional traversal
-- ═══════════════════════════════════════════════════════════════════════

-- Entity → candidates: "what evidence supports this entity?"
CREATE INDEX IF NOT EXISTS idx_evidence_links_entity
    ON steward.evidence_links (knowledge_entity_id)
    WHERE status != 'rejected';

-- Candidate → entities: "what entities does this candidate support?"
CREATE INDEX IF NOT EXISTS idx_evidence_links_candidate
    ON steward.evidence_links (nebula_candidate_id)
    WHERE nebula_candidate_id IS NOT NULL AND status != 'rejected';

-- Harvest → links: "invalidate all links from this harvest" (regeneration)
CREATE INDEX IF NOT EXISTS idx_evidence_links_harvest
    ON steward.evidence_links (nebula_harvest_id)
    WHERE nebula_harvest_id IS NOT NULL;

-- Filter by link type
CREATE INDEX IF NOT EXISTS idx_evidence_links_type
    ON steward.evidence_links (link_type);

-- Filter by status (proposed links need review)
CREATE INDEX IF NOT EXISTS idx_evidence_links_status
    ON steward.evidence_links (status)
    WHERE status = 'proposed';

-- Composite: entity + type (for aggregate scoring queries)
CREATE INDEX IF NOT EXISTS idx_evidence_links_entity_type
    ON steward.evidence_links (knowledge_entity_id, link_type)
    WHERE status = 'accepted';

-- GIN index on metadata
CREATE INDEX IF NOT EXISTS idx_evidence_links_metadata
    ON steward.evidence_links USING GIN (metadata);

-- ═══════════════════════════════════════════════════════════════════════
--  Trigger: update updated_at on modification
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION steward.set_evidence_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                   WHERE tgname = 'trg_evidence_links_updated_at'
                     AND tgrelid = 'steward.evidence_links'::regclass) THEN
        CREATE TRIGGER trg_evidence_links_updated_at
            BEFORE UPDATE ON steward.evidence_links
            FOR EACH ROW EXECUTE FUNCTION steward.set_evidence_links_updated_at();
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  Helper: supersede an accepted link
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION steward.supersede_evidence_link(
    p_link_id UUID,
    p_superseded_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE steward.evidence_links
    SET status = 'superseded',
        metadata = metadata || jsonb_build_object('superseded_by', p_superseded_by::text)
    WHERE id = p_link_id AND status = 'accepted';

    IF NOT FOUND THEN
        RAISE NOTICE 'No accepted link found with id %', p_link_id;
        RETURN false;
    END IF;
    RETURN true;
END;
$$;

COMMENT ON FUNCTION steward.supersede_evidence_link IS
    'Mark an accepted evidence link as superseded by a newer link. '
    'Used when newer evidence arrives that replaces the old link. '
    'Returns true if the link was superseded, false if no accepted link was found.';

-- ═══════════════════════════════════════════════════════════════════════
--  Helper: get evidence for an entity (bidirectional traversal entry point)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION steward.evidence_for_entity(
    p_entity_id UUID,
    p_link_type steward.evidence_link_type DEFAULT NULL,
    p_status steward.evidence_link_status DEFAULT 'accepted'
)
RETURNS TABLE (
    id UUID,
    link_type steward.evidence_link_type,
    status steward.evidence_link_status,
    confidence NUMERIC,
    nebula_candidate_id UUID,
    nebula_harvest_id UUID,
    rationale TEXT
)
LANGUAGE sql STABLE AS $$
    SELECT id, link_type, status, confidence, nebula_candidate_id, nebula_harvest_id, rationale
    FROM steward.evidence_links
    WHERE knowledge_entity_id = p_entity_id
      AND (p_link_type IS NULL OR link_type = p_link_type)
      AND status = p_status
    ORDER BY confidence DESC NULLS LAST;
$$;

COMMENT ON FUNCTION steward.evidence_for_entity IS
    'Get all evidence links for a knowledge graph entity. '
    'Default: accepted links only, sorted by confidence.';

-- ═══════════════════════════════════════════════════════════════════════
--  Helper: get entities linked to a candidate (reverse traversal)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION steward.entities_for_candidate(
    p_candidate_id UUID,
    p_status steward.evidence_link_status DEFAULT 'accepted'
)
RETURNS TABLE (
    id UUID,
    knowledge_entity_id UUID,
    link_type steward.evidence_link_type,
    confidence NUMERIC,
    rationale TEXT
)
LANGUAGE sql STABLE AS $$
    SELECT id, knowledge_entity_id, link_type, confidence, rationale
    FROM steward.evidence_links
    WHERE nebula_candidate_id = p_candidate_id
      AND status = p_status
    ORDER BY confidence DESC NULLS LAST;
$$;

COMMENT ON FUNCTION steward.entities_for_candidate IS
    'Get all knowledge entities linked to a harvest candidate. '
    'Enables: candidate → linked entities → supporting evidence traversal.';

-- ═══════════════════════════════════════════════════════════════════════
--  Foreign Keys (conditional — graph_entities may not exist yet)
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'knowledge' AND table_name = 'graph_entities') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'fk_steward_evidence_entity'
                         AND table_schema = 'steward') THEN
            ALTER TABLE steward.evidence_links
                ADD CONSTRAINT fk_steward_evidence_entity
                FOREIGN KEY (knowledge_entity_id)
                REFERENCES knowledge.graph_entities(id)
                ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  Verification
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'steward' AND table_name = 'evidence_links';

    IF v_count = 0 THEN
        RAISE EXCEPTION '❌ steward.evidence_links table was not created';
    END IF;

    RAISE NOTICE '✅ steward.evidence_links table created successfully';
    RAISE NOTICE '   Link types: supports | refines | instantiates | contradicts';
    RAISE NOTICE '   Status lifecycle: proposed → accepted | rejected → superseded';
    RAISE NOTICE '   Helpers: supersede_evidence_link(), evidence_for_entity(), entities_for_candidate()';
    RAISE NOTICE '   Bidirectional traversal: entity→candidates, candidate→entities';
END $$;

COMMIT;
