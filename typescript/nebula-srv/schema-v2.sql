-- Nebula RMS PostgreSQL Schema — Phase 2: Database-First
-- Adds harvests, agent_records, and projections tables to the nebula schema.
-- Run after schema.sql (Phase 1).

-- ═══════════════════════════════════════════════════════════════════════
--  HARVESTS — structured pipeline output from rover harvest_pipeline
--  Each row is one harvest run against a chat transcript.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.harvests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_path      TEXT NOT NULL,              -- filesystem path to source chat transcript
    source_filename  TEXT NOT NULL DEFAULT '',    -- display name (basename)
    model            TEXT NOT NULL DEFAULT '',    -- model used (e.g. "DeepSeek V4")
    total_candidates INTEGER NOT NULL DEFAULT 0,
    candidates       JSONB NOT NULL DEFAULT '[]', -- array of candidate objects
    source_text      TEXT,                        -- raw markdown of the harvest file
    tags             TEXT[] NOT NULL DEFAULT '{}',
    metadata         JSONB NOT NULL DEFAULT '{}', -- flexible metadata (duration, prompt ref, etc.)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harvests_model ON nebula.harvests(model);
CREATE INDEX IF NOT EXISTS idx_harvests_tags ON nebula.harvests USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_harvests_candidates ON nebula.harvests USING GIN(candidates);

CREATE TRIGGER trg_harvests_updated_at
    BEFORE UPDATE ON nebula.harvests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
--  HARVEST CANDIDATES — normalized relational view of harvests.candidates
--  JSONB. Each row is one SpecificationCandidate extracted from a harvest.
--  Provides direct foreign-key linking to the Nebula project hierarchy
--  (systems/subsystems/features) while the JSONB in harvests.candidates
--  remains the authoritative dump for the Rover pipeline.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.harvest_candidates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id        UUID NOT NULL,  -- FK omitted: harvests is a view in the bitemporal schema
    title             TEXT NOT NULL,
    intent_description TEXT,
    implementation_notes JSONB NOT NULL DEFAULT '[]',
    code_snippets     JSONB NOT NULL DEFAULT '[]',
    open_questions    JSONB NOT NULL DEFAULT '[]',
    tags              TEXT[] NOT NULL DEFAULT '{}',
    status            TEXT,

    -- Project hierarchy links (set when candidate is mapped to a project)
    -- FK omitted: systems/subsystems/features are views in the bitemporal schema
    system_id         UUID,
    subsystem_id      UUID,
    feature_id        UUID,

    -- Temporal columns (business/valid time — when this candidate mapping is valid)
    valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hc_harvest ON nebula.harvest_candidates(harvest_id);
CREATE INDEX IF NOT EXISTS idx_hc_system ON nebula.harvest_candidates(system_id);
CREATE INDEX IF NOT EXISTS idx_hc_subsystem ON nebula.harvest_candidates(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_hc_feature ON nebula.harvest_candidates(feature_id);
CREATE INDEX IF NOT EXISTS idx_hc_tags ON nebula.harvest_candidates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_hc_valid ON nebula.harvest_candidates(valid_from, valid_until);

CREATE TRIGGER trg_harvest_candidates_updated_at
    BEFORE UPDATE ON nebula.harvest_candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
--  AGENT RECORDS — all agent-written artifacts stored canonically
--  This replaces the audit/ filesystem as the source of truth.
--  Type discriminator: report | analysis | assessment | inspection |
--    prompt | response | engineering_log | architecture_note | decision
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.agent_records (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_type      TEXT NOT NULL
                     CHECK (record_type = ANY (ARRAY[
                         'report', 'analysis', 'assessment', 'inspection',
                         'prompt', 'response', 'engineering_log',
                         'architecture_note', 'decision'
                     ])),
    role             TEXT NOT NULL DEFAULT ''
                     CHECK (role = '' OR role = ANY (ARRAY[
                         'architect', 'planner', 'builder', 'reviewer',
                         'critic', 'analyst', 'inspector', 'engineer'
                     ])),
    title            TEXT NOT NULL DEFAULT '',
    content          TEXT NOT NULL DEFAULT '',     -- markdown body
    source_path      TEXT,                         -- original filesystem path if migrated
    metadata         JSONB NOT NULL DEFAULT '{}',  -- flexible metadata
    tags             TEXT[] NOT NULL DEFAULT '{}',
    system_id        UUID REFERENCES nebula.systems(id) ON DELETE SET NULL,
    subsystem_id     UUID REFERENCES nebula.subsystems(id) ON DELETE SET NULL,
    feature_id       UUID REFERENCES nebula.features(id) ON DELETE SET NULL,
    plan_ref         TEXT,                         -- optional conduit plan ref (e.g. "0136")
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_records_type ON nebula.agent_records(record_type);
CREATE INDEX IF NOT EXISTS idx_agent_records_role ON nebula.agent_records(role);
CREATE INDEX IF NOT EXISTS idx_agent_records_tags ON nebula.agent_records USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_agent_records_system ON nebula.agent_records(system_id);
CREATE INDEX IF NOT EXISTS idx_agent_records_plan ON nebula.agent_records(plan_ref);
CREATE INDEX IF NOT EXISTS idx_agent_records_created ON nebula.agent_records(created_at DESC);

CREATE TRIGGER trg_agent_records_updated_at
    BEFORE UPDATE ON nebula.agent_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
--  PROJECTIONS — config for on-demand markdown folder regeneration
--  Deterministic: SQL query + template → always same output
--  Inference: LLM generates narrative from DB query results
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.projections (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL UNIQUE,
    type             TEXT NOT NULL CHECK (type IN ('deterministic', 'inference')),
    description      TEXT NOT NULL DEFAULT '',
    source_query     TEXT NOT NULL DEFAULT '',     -- SQL SELECT that feeds the template
    template         TEXT NOT NULL DEFAULT '',     -- markdown template with {{placeholders}}
    target_path      TEXT NOT NULL DEFAULT '',     -- relative output path under audit/
    model            TEXT DEFAULT '',              -- LLM model for inference type
    schedule         TEXT DEFAULT '',              -- optional cron expression
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projections_type ON nebula.projections(type);

CREATE TRIGGER trg_projections_updated_at
    BEFORE UPDATE ON nebula.projections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
--  CROSS-REFERENCES — typed links between any two entities
--  Generic source→target with JSONB metadata for arbitrary link properties.
--  GIN index enables full-text and containment queries on metadata.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.cross_references (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type      TEXT NOT NULL,
    source_id        TEXT NOT NULL,
    target_type      TEXT NOT NULL,
    target_id        TEXT NOT NULL,
    rel_type         TEXT NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cross_refs_source
    ON nebula.cross_references(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_cross_refs_target
    ON nebula.cross_references(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_cross_refs_rel_type
    ON nebula.cross_references(rel_type);
CREATE INDEX IF NOT EXISTS idx_cross_refs_metadata
    ON nebula.cross_references USING GIN(metadata);
