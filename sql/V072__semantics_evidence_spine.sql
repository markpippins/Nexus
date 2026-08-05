-- ═══════════════════════════════════════════════════════════════════════
--  V072 — semantics: evidence spine (evidence_type, evidence_item,
--          statement_evidence) + cross-schema FK bridges
--
--  Purpose: Normalise evidence out of inline text blobs and JSON columns
--  into first-class entities.  The same transcript / commit / post can
--  support multiple statements; evidence itself carries no confidence
--  or polarity — those live on statement_evidence relative to a claim.
--
--  Immutability: evidence_item is hash-deduplicated.  Re-harvesting the
--  same artifact with the same hash ⇒ no new row.  Changed content ⇒
--  new row with new hash; the old row is soft-closed.
--
--  Three new tables:
--    • evidence_type        — controlled vocabulary (FK'd from evidence_item)
--    • evidence_item        — immutable, hash-deduplicated, bitemporal
--    • statement_evidence   — polymorphic junction to concept_relationship
--                             and representation_relationship
--
--  Cross-schema FK bridges (nullable, alongside existing blob columns):
--    • nebula.harvest_references.evidence_item_id
--    • voyager.identity_candidate.evidence_item_id
--    • voyager.observation_edge_hint.evidence_item_id
--
--  Conventions (consistent with V057/V065):
--    • uuid PK DEFAULT gen_random_uuid()
--    • expired_at timestamptz soft-delete (NULL ⇒ active)
--    • partial unique indexes WHERE expired_at IS NULL for natural keys
--    • inline FK REFERENCES
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. evidence_type — controlled vocabulary ──────────────────────────

CREATE TABLE semantics.evidence_type (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    description     text NOT NULL,
    origin_category text,           -- harvested | user_entered | explorer_discovered |
                                    -- planner_generated | steward_created | imported
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expired_at      timestamptz
);

CREATE UNIQUE INDEX idx_evidence_type_active_name
    ON semantics.evidence_type (name)
    WHERE expired_at IS NULL;

-- ── 2. evidence_item — immutable, hash-deduplicated ───────────────────

CREATE TABLE semantics.evidence_item (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_type_id  uuid NOT NULL REFERENCES semantics.evidence_type(id),

    -- How to get back to the canonical artifact
    uri               text,         -- e.g. conversation:msg-id, file:path#L1-L10,
                                    --      commit:SHA, service:id,
                                    --      db:schema.table.pk
    -- Cached snippet for humans
    excerpt           text,
    -- Steward annotation
    note              text,
    -- How the evidence entered the system
    origin            text,         -- harvested | user_entered | explorer_discovered |
                                    -- planner_generated | steward_created | imported

    -- When the evidence was observed / captured
    captured_at       timestamptz,

    -- Dedup key: (evidence_type_id, source_hash) is unique per active row.
    -- Re-harvesting the same content ⇒ no new row.
    source_hash       text,         -- SHA-256 of the canonical artifact content

    -- Type-specific details (e.g. line numbers for source_file,
    -- conversation metadata for transcript)
    metadata          jsonb,

    -- Bitemporal: validity window of the evidence itself
    valid_from        timestamptz,
    valid_to          timestamptz,

    -- Bitemporal: recording window
    recorded_on_dt    timestamptz NOT NULL DEFAULT now(),
    recorded_until_dt timestamptz NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    created_at        timestamptz NOT NULL DEFAULT now(),
    expired_at        timestamptz
);

-- Hash dedup: one active row per (type, hash) pair
CREATE UNIQUE INDEX idx_evidence_item_active_hash
    ON semantics.evidence_item (evidence_type_id, source_hash)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
      AND expired_at IS NULL;

-- Lookup by URI
CREATE INDEX idx_evidence_item_uri
    ON semantics.evidence_item (uri)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
      AND expired_at IS NULL;

-- ── 3. statement_evidence — evidence relative to a statement ──────────

CREATE TABLE semantics.statement_evidence (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_item_id  uuid NOT NULL REFERENCES semantics.evidence_item(id),

    -- Polymorphic FK: which statement table does this apply to?
    statement_type    text NOT NULL,  -- 'concept_relationship' | 'representation_relationship'
    statement_id      uuid NOT NULL,  -- FK to the specific row in that table

    -- Role of evidence relative to the statement
    role              text NOT NULL,  -- supports | contradicts | contextualizes |
                                      -- originated_from | supersedes | prompted_by

    -- How strongly does this evidence support/contradict?
    strength          numeric CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1)),

    comment           text,

    effective_at      timestamptz NOT NULL DEFAULT now(),
    expired_at        timestamptz
);

-- One evidence item can only have one role per statement
CREATE UNIQUE INDEX idx_statement_evidence_active
    ON semantics.statement_evidence (evidence_item_id, statement_type, statement_id, role)
    WHERE expired_at IS NULL;

-- Lookup all evidence for a given statement
CREATE INDEX idx_statement_evidence_by_statement
    ON semantics.statement_evidence (statement_type, statement_id)
    WHERE expired_at IS NULL;

-- ── 4. Seed evidence_type vocabulary ──────────────────────────────────

INSERT INTO semantics.evidence_type (name, description, origin_category) VALUES
    ('transcript',           'Conversation transcript (harvested chat log)',                   'harvested'),
    ('kg_relationship',      'Knowledge graph relationship edge',                              'harvested'),
    ('source_file',          'Source file (filename + optional line range)',                   'harvested'),
    ('git_commit',           'Git commit (SHA + optional repo path)',                          'harvested'),
    ('service_registry',     'Service registry entry (registry.services row)',                 'harvested'),
    ('terrain',              'Terrain runnable service entry (terrain.runnable_services row)', 'harvested'),
    ('assembly_post',        'Assembly forum post or comment',                                 'harvested'),
    ('work_receipt',         'Conduit work receipt event',                                     'harvested'),
    ('agent_record',         'Agent record (nebula.agent_records row)',                        'harvested'),
    ('user_assertion',       'Direct user assertion (no external evidence yet)',               'user_entered'),
    ('model_prior',          'Model training data / prior knowledge',                          'imported'),
    ('explorer_discovery',   'Explorer role filesystem / runtime discovery',                   'explorer_discovered'),
    ('harvest_candidate',    'Harvest candidate intent',                                       'planner_generated'),
    ('requirement',          'Requirement (promoted from candidate)',                          'planner_generated'),
    ('drift_finding',        'Snapshot drift finding',                                         'harvested')
ON CONFLICT DO NOTHING;

-- ── 5. Cross-schema FK bridges ───────────────────────────────────────

-- nebula.harvest_references is a VIEW over harvest_references_history.
-- Add the column to the base table, then recreate the view.
ALTER TABLE nebula.harvest_references_history
    ADD COLUMN IF NOT EXISTS evidence_item_id uuid;

DROP VIEW IF EXISTS nebula.harvest_references;

CREATE VIEW nebula.harvest_references AS
SELECT id,
       conversation_id,
       snapshot_id,
       source_block_id,
       source_segment_id,
       target_block_id,
       target_segment_id,
       edge_type,
       confidence,
       state,
       source,
       reason,
       evidence_json,
       evidence_item_id,
       provenance_json,
       created_by,
       created_at
FROM nebula.harvest_references_history
WHERE (now() >= as_of_dt) AND (now() < expiration_dt);

-- voyager.identity_candidate — alongside existing evidence jsonb
ALTER TABLE voyager.identity_candidate
    ADD COLUMN IF NOT EXISTS evidence_item_id uuid
    REFERENCES semantics.evidence_item(id);

-- voyager.observation_edge_hint — alongside existing evidence jsonb
ALTER TABLE voyager.observation_edge_hint
    ADD COLUMN IF NOT EXISTS evidence_item_id uuid
    REFERENCES semantics.evidence_item(id);

COMMIT;
