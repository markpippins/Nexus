-- =============================================================================
-- MIGRATION: resolution v30 — verified execution admission bridge
--
-- Purpose:
--   Provide the narrow, fail-closed bridge used by PEB before it records an
--   execution transaction as admitted.  A worker/model claim is not enough:
--   the claim must already be linked to immutable, independently verified Git
--   evidence carrying the same lease, grant, attempt, and policy context.
--
-- Authority boundary:
--   * resolution validates the semantic claim/evidence relationship and emits
--     an admission assessment/receipt;
--   * PEB remains the authority that records the admission result;
--   * this function never grants a lease, creates a grant, mutates a claim,
--     settles a WorkRequest, or turns semantic Asserted into PEB acceptance.
--
-- The receipt deliberately has no FK to peb.transactions while the two schema
-- lifecycles are still independently migrated.  p_peb_transaction_id is a
-- correlation key supplied by PEB and conflicting reuse is rejected.
--
-- Unapplied additive migration.  It requires v28/v29 to have been applied in
-- the same database before the function can be called.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS resolution.execution_admission_receipt (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    peb_transaction_id    uuid NOT NULL,
    claim_id              uuid NOT NULL REFERENCES resolution.execution_claim(id),
    evidence_id           uuid NOT NULL REFERENCES resolution.execution_evidence(id),
    evidence_kind         text NOT NULL,
    source_system         text NOT NULL,
    policy_version_hash   text NOT NULL,
    lease_id              text NOT NULL,
    grant_id              text NOT NULL,
    attempt_id            text NOT NULL,
    admitted              boolean NOT NULL,
    reason                text NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_admission_receipt_peb_tx
    ON resolution.execution_admission_receipt (peb_transaction_id);

CREATE INDEX IF NOT EXISTS idx_execution_admission_receipt_claim
    ON resolution.execution_admission_receipt (claim_id, evidence_id);

COMMENT ON TABLE resolution.execution_admission_receipt IS
    'Resolution-side assessment of whether independently verified execution evidence is eligible for PEB admission. It is not a PEB settlement receipt.';

CREATE OR REPLACE FUNCTION resolution.admit_verified_execution_claim(
    p_peb_transaction_id  uuid,
    p_claim_id            uuid,
    p_evidence_id         uuid,
    p_policy_version_hash text,
    p_lease_id            text,
    p_grant_id            text,
    p_attempt_id          text,
    p_source_system       text DEFAULT 'git-verifier',
    p_evidence_kind       text DEFAULT 'git_ref_commit'
) RETURNS TABLE(admitted boolean, reason text, receipt_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_claim                 resolution.execution_claim%ROWTYPE;
    v_evidence              resolution.execution_evidence%ROWTYPE;
    v_link                  resolution.execution_claim_evidence%ROWTYPE;
    v_existing              resolution.execution_admission_receipt%ROWTYPE;
    v_admitted               boolean := true;
    v_reason                 text := 'verified Git evidence is eligible for PEB admission';
    v_receipt_id             uuid := gen_random_uuid();
BEGIN
    IF p_peb_transaction_id IS NULL OR p_claim_id IS NULL OR p_evidence_id IS NULL
       OR p_policy_version_hash IS NULL OR p_lease_id IS NULL
       OR p_grant_id IS NULL OR p_attempt_id IS NULL THEN
        RETURN QUERY SELECT false, 'MISSING_EXECUTION_ADMISSION_CONTEXT', NULL::uuid;
        RETURN;
    END IF;

    -- Idempotent replay is allowed only for the exact same correlation. A
    -- transaction id may never be reused to smuggle a different claim or
    -- evidence into the admission ledger.
    SELECT * INTO v_existing
    FROM resolution.execution_admission_receipt
    WHERE peb_transaction_id = p_peb_transaction_id;

    IF FOUND THEN
        IF v_existing.claim_id = p_claim_id
           AND v_existing.evidence_id = p_evidence_id
           AND v_existing.policy_version_hash = p_policy_version_hash
           AND v_existing.lease_id = p_lease_id
           AND v_existing.grant_id = p_grant_id
           AND v_existing.attempt_id = p_attempt_id
           AND v_existing.source_system = p_source_system
           AND v_existing.evidence_kind = p_evidence_kind THEN
            RETURN QUERY SELECT v_existing.admitted, v_existing.reason, v_existing.id;
        END IF;
        RETURN QUERY SELECT false, 'CONFLICTING_EXECUTION_ADMISSION_REPLAY', NULL::uuid;
        RETURN;
    END IF;

    SELECT * INTO v_claim
    FROM resolution.execution_claim
    WHERE id = p_claim_id;

    SELECT * INTO v_evidence
    FROM resolution.execution_evidence
    WHERE id = p_evidence_id;

    SELECT ce.* INTO v_link
    FROM resolution.execution_claim_evidence ce
    WHERE ce.claim_id = p_claim_id
      AND ce.evidence_id = p_evidence_id
      AND ce.role = 'supports'
      AND ce.verification_state = 'confirmed'
      AND ce.expired_at IS NULL
    ORDER BY ce.linked_at DESC
    LIMIT 1;

    IF NOT FOUND OR v_claim.id IS NULL OR v_evidence.id IS NULL THEN
        v_admitted := false;
        v_reason := 'CLAIM_EVIDENCE_LINK_NOT_CONFIRMED';
    ELSIF v_claim.disposition IN ('Rejected', 'Disputed', 'Stale', 'Retracted') THEN
        v_admitted := false;
        v_reason := 'CLAIM_SEMANTIC_DISPOSITION_NOT_ADMISSIBLE';
    ELSIF v_evidence.context_kind <> 'execution'
       OR v_evidence.policy_version_hash IS NULL
       OR v_evidence.lease_id IS NULL
       OR v_evidence.grant_id IS NULL
       OR v_evidence.attempt_id IS NULL THEN
        v_admitted := false;
        v_reason := 'EVIDENCE_MISSING_EXECUTION_CONTEXT';
    ELSIF v_evidence.policy_version_hash IS DISTINCT FROM p_policy_version_hash
       OR v_evidence.lease_id IS DISTINCT FROM p_lease_id
       OR v_evidence.grant_id IS DISTINCT FROM p_grant_id
       OR v_evidence.attempt_id IS DISTINCT FROM p_attempt_id
       OR v_claim.policy_version_hash IS DISTINCT FROM p_policy_version_hash
       OR v_claim.lease_id IS DISTINCT FROM p_lease_id
       OR v_claim.grant_id IS DISTINCT FROM p_grant_id
       OR v_claim.attempt_id IS DISTINCT FROM p_attempt_id THEN
        v_admitted := false;
        v_reason := 'EXECUTION_CONTEXT_MISMATCH';
    ELSIF v_evidence.source_system IS DISTINCT FROM p_source_system
       OR v_evidence.evidence_kind IS DISTINCT FROM p_evidence_kind THEN
        v_admitted := false;
        v_reason := 'UNEXPECTED_EVIDENCE_ADAPTER';
    ELSIF v_evidence.verifier_independence IS DISTINCT FROM true
       OR v_evidence.verifier_id IS NULL
       OR v_evidence.verifier_method IS NULL
       OR coalesce(v_evidence.payload->>'outcome', '') IS DISTINCT FROM 'verified' THEN
        v_admitted := false;
        v_reason := 'EVIDENCE_NOT_INDEPENDENTLY_VERIFIED';
    END IF;

    IF v_claim.id IS NOT NULL AND v_evidence.id IS NOT NULL THEN
        INSERT INTO resolution.execution_admission_receipt (
            id, peb_transaction_id, claim_id, evidence_id, evidence_kind,
            source_system, policy_version_hash, lease_id, grant_id, attempt_id,
            admitted, reason
        ) VALUES (
            v_receipt_id, p_peb_transaction_id, p_claim_id, p_evidence_id,
            p_evidence_kind, p_source_system, p_policy_version_hash, p_lease_id,
            p_grant_id, p_attempt_id, v_admitted, v_reason
        );
    END IF;

    RETURN QUERY SELECT v_admitted, v_reason,
        CASE WHEN v_claim.id IS NOT NULL AND v_evidence.id IS NOT NULL
             THEN v_receipt_id ELSE NULL::uuid END;
END;
$$;

COMMENT ON FUNCTION resolution.admit_verified_execution_claim(uuid, uuid, uuid, text, text, text, text, text, text) IS
    'Fail-closed execution admission assessment. Only confirmed, independently verified, context-matching Git evidence may return admitted=true; PEB records the final transaction result separately.';

COMMIT;
