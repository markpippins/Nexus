-- =============================================================================
-- MIGRATION: resolution v29 — T24 graph-edge evidence bridge
--
-- Purpose:
--   Preserve T24 graph-edge provenance as SOL Evidence without promoting
--   endpoint resolution into semantic truth or execution authority.
--
-- Mapping:
--   knowledge.graph_edges.id                 -> graph_edge_id
--   (source_section, source_id)              -> source endpoint identity
--   relation_type                            -> predicate candidate
--   (target_section, target_id)              -> target endpoint identity
--   properties                               -> edge_properties
--   source_migration_id                     -> ingestion_run_id
--   resolution                               -> graph_resolution
--   unresolved_reason                        -> unresolved_reason
--
-- No FK is created back to knowledge.*. Resolution is a moving SOL sandbox,
-- and the bridge must remain replayable from an imported graph snapshot. The
-- graph edge UUID and natural endpoint keys are both retained. A graph edge
-- with resolution='resolved' means endpoint identity closure only; it is not
-- an Asserted proposition and cannot independently produce a PEB-accepted
-- settlement.
--
-- Idempotent and additive. This migration is not applied by this change.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS resolution.t24_graph_edge_evidence (
    evidence_id          uuid PRIMARY KEY REFERENCES resolution.execution_evidence(id),
    graph_edge_id        uuid NOT NULL,
    source_section       text NOT NULL,
    source_id            text NOT NULL,
    relation_type        text NOT NULL,
    target_section       text,
    target_id            text NOT NULL,
    edge_properties      jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_migration_id  uuid,
    graph_resolution     text NOT NULL DEFAULT 'unknown'
        CHECK (graph_resolution IN ('resolved','unresolved','unknown')),
    unresolved_reason    text,
    graph_created_at     timestamptz,
    imported_at          timestamptz NOT NULL DEFAULT now(),

    CHECK (
        (graph_resolution = 'unresolved' AND unresolved_reason IS NOT NULL)
        OR graph_resolution <> 'unresolved'
    ),
    CHECK (
        graph_resolution <> 'unresolved' OR target_section IS NULL
    ),
    UNIQUE (graph_edge_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_t24_graph_edge_evidence_edge
    ON resolution.t24_graph_edge_evidence (graph_edge_id);

CREATE INDEX IF NOT EXISTS idx_t24_graph_edge_evidence_endpoint
    ON resolution.t24_graph_edge_evidence (source_section, source_id, target_section, target_id);

CREATE INDEX IF NOT EXISTS idx_t24_graph_edge_evidence_migration
    ON resolution.t24_graph_edge_evidence (source_migration_id)
    WHERE source_migration_id IS NOT NULL;

COMMENT ON TABLE resolution.t24_graph_edge_evidence IS
    'Lossless T24 graph-edge provenance attached to immutable SOL execution_evidence. Resolved endpoint identity is not semantic truth or execution acceptance.';

-- A read-only mapping view makes the proposed ExecutionClaim path explicit:
-- a caller may join this evidence to execution_claim_evidence, but no graph
-- row is automatically converted into a claim or disposition.
CREATE OR REPLACE VIEW resolution.v_t24_execution_evidence AS
SELECT
    ee.id AS evidence_id,
    ee.evidence_key,
    ee.evidence_kind,
    ee.source_system,
    ee.source_hash,
    ee.captured_at,
    ee.captured_by,
    ee.context_kind,
    ee.policy_version_hash,
    ee.lease_id,
    ee.grant_id,
    ee.attempt_id,
    ee.verifier_id,
    ee.verifier_independence,
    ge.graph_edge_id,
    ge.source_section,
    ge.source_id,
    ge.relation_type,
    ge.target_section,
    ge.target_id,
    ge.edge_properties,
    ge.source_migration_id,
    ge.graph_resolution,
    ge.unresolved_reason,
    ce.claim_id,
    ce.role AS claim_evidence_role,
    ce.verification_state
FROM resolution.execution_evidence ee
JOIN resolution.t24_graph_edge_evidence ge ON ge.evidence_id = ee.id
LEFT JOIN resolution.execution_claim_evidence ce ON ce.evidence_id = ee.id;

COMMIT;
