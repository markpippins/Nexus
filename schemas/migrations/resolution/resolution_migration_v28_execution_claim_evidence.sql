-- =============================================================================
-- MIGRATION: resolution v28 — SOL execution claims + evidence vocabulary
--
-- Purpose:
--   Add the minimum durable vocabulary needed to represent execution claims
--   without mistaking agent prose, lease metadata, or an observation for an
--   authoritative result. This is deliberately additive: the existing
--   proposition/assertion/verified_statement path remains valid and may be
--   used as the semantic evaluation path for an execution_claim.
--
-- Authority boundary:
--   * Tackle owns lease accounting and lease expiry.
--   * PEB owns admission/capability decisions and execution authority.
--   * Kernel/execution adapters own materialized runtime transitions.
--   * resolution owns claim/disposition evaluation and provenance linkage.
--   * Evidence rows are immutable observations; they do not become proof by
--     being inserted and do not independently move a claim to Asserted.
--
-- The lease/grant/attempt identifiers are text on purpose. Their authoritative
-- rows live in other subsystems while the resolution schema is still moving;
-- this avoids inventing cross-schema FKs and preserves identifiers from
-- Freebuff, harness, Wind, Duality, and future execution channels.
--
-- Review revision: semantic disposition is kept separate from PEB settlement,
-- and execution-context correlation is explicit on evidence. This migration
-- is live in the local resolution catalog; the separate PEB Flyway ledger does
-- not record resolution migrations, so live status is established by catalog
-- verification rather than a Flyway row.
-- Idempotent for schema evolution: CREATE IF NOT EXISTS, guarded indexes,
-- guarded vocabulary inserts, and replaceable trigger function.
-- =============================================================================

BEGIN;

-- ── 1. Vocabulary concepts ─────────────────────────────────────────────

INSERT INTO resolution.concept (name, description) VALUES
    ('PolicyVersion',    'Immutable policy or governance version selected for an execution decision'),
    ('RoleLease',        'Time-bounded role authority identity issued by the lease subsystem'),
    ('ExecutionGrant',   'PEB-issued capability and scope grant authorizing an execution attempt'),
    ('ExecutionAttempt', 'A single bounded attempt to materialize a granted execution'),
    ('ExecutionClaim',   'A claim about an execution attempt, initially a proposal until evaluated and independently evidenced'),
    ('Evidence',         'Immutable, content-addressed observation that may support or contradict a claim'),
    ('AdmissionReceipt', 'Durable receipt of an admission decision'),
    ('Violation',        'Durable record of an authority, scope, provenance, or invariant violation'),
    ('Projection',       'A derived presentation of authoritative resolution or execution state')
ON CONFLICT (name) DO NOTHING;

INSERT INTO resolution.semantic_type (name, description, default_staleness_window)
SELECT v.name, v.description, v.default_staleness_window
FROM (VALUES
    ('ExecutionClaim', 'A claim about a bounded execution attempt; not authoritative until the required evaluation and evidence gates pass.', interval '1 day'),
    ('ExecutionEvidence', 'An immutable observation captured from an execution adapter or provenance source.', NULL)
) AS v(name, description, default_staleness_window)
WHERE to_regclass('resolution.semantic_type') IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- ── 2. ExecutionClaim ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resolution.execution_claim (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_key             text NOT NULL,

    -- Optional semantic anchor. A claim may be created before a proposition
    -- exists, but a later evaluation can bind it to one.
    proposition_id        uuid REFERENCES resolution.proposition(id),

    -- Subject/predicate/object are intentionally representation-neutral. The
    -- subject_ref can carry a repository/worktree, graph entity, service row,
    -- or other canonical reference without using display names as identity.
    subject_kind          text NOT NULL,
    subject_ref           jsonb NOT NULL DEFAULT '{}'::jsonb,
    predicate             text NOT NULL,
    object_value          jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Correlation to external authority records. These are identifiers, not
    -- claims that the referenced subsystem has approved this row.
    policy_version_hash   text,
    lease_id              text,
    grant_id              text,
    attempt_id            text,

    declared_by           text NOT NULL,
    declared_at           timestamptz NOT NULL DEFAULT now(),
    observed_at           timestamptz,

    -- Resolution disposition is semantic state, not PEB admission or
    -- settlement state. PEB acceptance is represented by its own receipt and
    -- must not be collapsed into this semantic disposition.
    disposition            text NOT NULL DEFAULT 'Proposed'
        CHECK (disposition IN ('Proposed','Pending','Asserted','Disputed','Rejected','Stale','Retracted')),

    -- Independent verification is recorded as a fact about the claim's
    -- evidence path. It is not inferred from declared_by or from prose.
    verification_method   text,
    verified_by            text,
    verified_at            timestamptz,
    verification_summary  jsonb,

    created_at             timestamptz NOT NULL DEFAULT now(),
    valid_from             timestamptz NOT NULL DEFAULT now(),
    valid_until            timestamptz NOT NULL DEFAULT 'infinity',
    recorded_on_dt         timestamptz NOT NULL DEFAULT now(),
    recorded_until_dt     timestamptz NOT NULL DEFAULT 'infinity',

    CHECK (
        disposition <> 'Asserted'
        OR (verification_method IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_claim_active_key
    ON resolution.execution_claim (claim_key)
    WHERE recorded_until_dt = 'infinity'::timestamptz
      AND valid_until = 'infinity'::timestamptz;

CREATE INDEX IF NOT EXISTS idx_execution_claim_attempt
    ON resolution.execution_claim (attempt_id)
    WHERE attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_claim_grant
    ON resolution.execution_claim (grant_id)
    WHERE grant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_claim_disposition
    ON resolution.execution_claim (disposition);

COMMENT ON TABLE resolution.execution_claim IS
    'SOL execution claim. Inserted claims are proposals; Asserted requires resolution evaluation plus independent evidence. PEB settlement/acceptance is a separate authoritative receipt.';

-- ── 3. Immutable Evidence ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resolution.execution_evidence (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_key             text NOT NULL,
    evidence_kind            text NOT NULL,
    source_system            text NOT NULL,
    source_ref               jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_hash              text NOT NULL,
    captured_at              timestamptz NOT NULL,
    captured_by              text NOT NULL,

    -- Provenance evidence (such as T24 graph edges) may have no execution
    -- context. Execution evidence must carry the PEB/Tackle correlation so a
    -- verifier result cannot be replayed as an unbound completion fact.
    context_kind             text NOT NULL DEFAULT 'provenance'
        CHECK (context_kind IN ('execution','provenance')),
    policy_version_hash      text,
    lease_id                 text,
    grant_id                 text,
    attempt_id               text,

    -- verifier_independence is explicit and nullable: NULL means unknown,
    -- false means the verifier is the claimant or otherwise non-independent.
    verifier_id              text,
    verifier_independence    boolean,
    verifier_method          text,

    payload                  jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    valid_from               timestamptz NOT NULL DEFAULT now(),
    valid_until              timestamptz NOT NULL DEFAULT 'infinity',
    recorded_on_dt           timestamptz NOT NULL DEFAULT now(),
    recorded_until_dt        timestamptz NOT NULL DEFAULT 'infinity',

    CHECK (
        context_kind <> 'execution'
        OR (policy_version_hash IS NOT NULL AND lease_id IS NOT NULL
            AND grant_id IS NOT NULL AND attempt_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_evidence_active_key
    ON resolution.execution_evidence (evidence_key)
    WHERE recorded_until_dt = 'infinity'::timestamptz
      AND valid_until = 'infinity'::timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_evidence_content
    ON resolution.execution_evidence (source_system, evidence_kind, source_hash);

CREATE INDEX IF NOT EXISTS idx_execution_evidence_source
    ON resolution.execution_evidence (source_system, evidence_kind);

COMMENT ON TABLE resolution.execution_evidence IS
    'Immutable execution observation. Content identity is source_system + evidence_kind + source_hash; evidence alone never establishes claim authority.';

-- Evidence is append-only. Expiration/versioning is represented by new rows
-- and bitemporal columns, not UPDATE/DELETE mutation.
CREATE OR REPLACE FUNCTION resolution.execution_evidence_immutable()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'resolution.execution_evidence is immutable: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_execution_evidence_immutable ON resolution.execution_evidence;
CREATE TRIGGER trg_execution_evidence_immutable
    BEFORE UPDATE OR DELETE ON resolution.execution_evidence
    FOR EACH ROW
    EXECUTE FUNCTION resolution.execution_evidence_immutable();

-- ── 4. Claim-to-evidence relation ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS resolution.execution_claim_evidence (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id          uuid NOT NULL REFERENCES resolution.execution_claim(id),
    evidence_id       uuid NOT NULL REFERENCES resolution.execution_evidence(id),
    role              text NOT NULL
        CHECK (role IN ('supports','contradicts','contextualizes','originated_from','supersedes')),
    verification_state text NOT NULL DEFAULT 'candidate'
        CHECK (verification_state IN ('candidate','confirmed','contested','superseded')),
    strength          numeric CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1)),
    linked_by         text NOT NULL,
    linked_at         timestamptz NOT NULL DEFAULT now(),
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    expired_at        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_claim_evidence_active
    ON resolution.execution_claim_evidence (claim_id, evidence_id, role)
    WHERE expired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_execution_claim_evidence_claim
    ON resolution.execution_claim_evidence (claim_id);

CREATE INDEX IF NOT EXISTS idx_execution_claim_evidence_evidence
    ON resolution.execution_claim_evidence (evidence_id);

COMMENT ON TABLE resolution.execution_claim_evidence IS
    'Evidence is related to a claim with polarity and verification state. Active links are append-only/expire-not-delete; the link does not itself settle a PEB execution outcome.';

COMMIT;
