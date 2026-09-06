-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ SUPERSEDED BY V134 (semantics_retire_ontology_tables, commit 30221fc6)
-- V134 converges nexus.semantics to the sol/semantics shape. The
-- `semantics.execution_claim` table, its CRUD procedures, and the routing
-- of `check_statement_id()`'s execution_claim branch to semantics.* were
-- DELIBERATELY RETIRED: V134 Step 4 drops the CRUD procs and Step 5 drops
-- the table, and Step 2 repoints the polymorphic check at
-- resolution.execution_claim. Do NOT apply V116 against a post-V134 DB.
-- Do NOT re-create semantics.execution_claim without an architect decision
-- (the semantics-side schema differs from resolution.execution_claim — see
-- V134 header "Data note"). Ledgered as superseded 2026-09-05 (architect).
-- ═══════════════════════════════════════════════════════════════════════
-- V116 — semantics: execution-claim projection and evidence linkage
--
-- Purpose:
--   Add the semantics-side projection of the SOL execution-claim vocabulary
--   introduced by resolution_migration_v28_execution_claim_evidence.sql.
--   Existing semantics.evidence_item remains the evidence substrate; the
--   existing statement_evidence polymorphic junction is extended to target
--   execution_claim rows.
--
-- Authority boundary:
--   semantics records and projects claims/evidence. It does not issue a
--   RoleLease, authorize an ExecutionGrant, perform a kernel transition, or
--   independently turn a claim into an accepted execution. resolution remains
--   the SOL evaluation surface; Tackle/PEB/kernel retain their authorities.
--
-- resolution_claim_id is intentionally a correlation identifier without a
-- cross-schema FK while the resolution schema is still evolving. The claim
-- projection preserves the external identity and can be reconciled later.
--
-- Idempotent: CREATE IF NOT EXISTS, guarded indexes/constraints, ON CONFLICT
-- vocabulary seeds, CREATE OR REPLACE procedures, and trigger replacement.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Execution-claim projection ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantics.execution_claim (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resolution_claim_id   uuid,
    claim_key             text NOT NULL,
    subject_kind          text NOT NULL,
    subject_ref           jsonb NOT NULL DEFAULT '{}'::jsonb,
    predicate             text NOT NULL,
    object_value          jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Correlation identifiers, not local authority assertions.
    policy_version_hash   text,
    lease_id              text,
    grant_id              text,
    attempt_id            text,

    declared_by           text NOT NULL,
    declared_at           timestamptz NOT NULL DEFAULT now(),
    observed_at           timestamptz,
    disposition            text NOT NULL DEFAULT 'Proposed',
    verification_method   text,
    verified_by           text,
    verified_at           timestamptz,
    verification_summary jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz,

    CONSTRAINT execution_claim_disposition_check
      CHECK (disposition IN ('Proposed','Pending','Asserted','Disputed','Rejected','Stale','Retracted')),
    CONSTRAINT execution_claim_verified_state_check
      CHECK (
        disposition <> 'Asserted'
        OR (verification_method IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
      )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semantics_execution_claim_active_key
    ON semantics.execution_claim (claim_key)
    WHERE expired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_semantics_execution_claim_resolution_id
    ON semantics.execution_claim (resolution_claim_id)
    WHERE resolution_claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_semantics_execution_claim_attempt
    ON semantics.execution_claim (attempt_id)
    WHERE attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_semantics_execution_claim_grant
    ON semantics.execution_claim (grant_id)
    WHERE grant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_semantics_execution_claim_disposition
    ON semantics.execution_claim (disposition);

COMMENT ON TABLE semantics.execution_claim IS
    'Semantics-side projection of a SOL execution claim. It records correlation and evaluation metadata; PEB admission and kernel materialization remain authoritative elsewhere.';
COMMENT ON COLUMN semantics.execution_claim.resolution_claim_id IS
    'Correlation to resolution.execution_claim.id; intentionally not an FK until the moving resolution schema is ratified and ordered.';
COMMENT ON COLUMN semantics.execution_claim.disposition IS
    'Semantic disposition only. Asserted requires verification metadata but does not imply PEB admission, settlement, or execution success.';

-- ── 2. Evidence vocabulary ─────────────────────────────────────────────

INSERT INTO semantics.evidence_type (name, description, origin_category, notes) VALUES
    ('execution_observation', 'Observed output or state from a bounded execution attempt.', 'harvested', 'Must be bound to an execution claim through statement_evidence.'),
    ('execution_adapter', 'Read-only verification adapter result for an execution artifact.', 'explorer_discovered', 'Verifier identity and independence belong in evidence_item metadata until the shared evidence contract is extended.'),
    ('admission_receipt', 'PEB admission decision receipt for an execution grant or attempt.', 'harvested', 'Evidence of admission is not evidence of materialized success.'),
    ('kernel_receipt', 'Kernel or execution-surface materialization receipt.', 'harvested', 'Independent of agent prose; bind to the relevant execution claim.'),
    ('lease_record', 'Role-lease issuance, expiry, or revocation observation.', 'harvested', 'Lease evidence does not itself authorize an execution.')
ON CONFLICT DO NOTHING;

-- ── 3. Extend the polymorphic statement surface ────────────────────────

ALTER TABLE semantics.statement_evidence
  DROP CONSTRAINT IF EXISTS statement_evidence_type_check;

ALTER TABLE semantics.statement_evidence
  ADD CONSTRAINT statement_evidence_type_check
    CHECK (statement_type IN (
      'source_observation',
      'agent_record',
      'work_request',
      'implementation_plan',
      'harvest_candidate',
      'representation_relationship',
      'concept_relationship',
      'execution_claim'
    ));

CREATE OR REPLACE FUNCTION semantics.check_statement_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    found boolean;
BEGIN
    CASE NEW.statement_type
        WHEN 'source_observation' THEN
            SELECT EXISTS(SELECT 1 FROM semantics.source_observation WHERE id = NEW.statement_id) INTO found;
        WHEN 'agent_record' THEN
            SELECT EXISTS(SELECT 1 FROM nebula.agent_records WHERE id = NEW.statement_id) INTO found;
        WHEN 'work_request' THEN
            SELECT EXISTS(
                SELECT 1 FROM nebula.work_requests WHERE id = NEW.statement_id
                UNION ALL
                SELECT 1 FROM conduit.work_requests WHERE id = NEW.statement_id
            ) INTO found;
        WHEN 'implementation_plan' THEN
            SELECT EXISTS(SELECT 1 FROM nebula.implementation_plans WHERE id = NEW.statement_id) INTO found;
        WHEN 'harvest_candidate' THEN
            SELECT EXISTS(SELECT 1 FROM nebula.harvest_candidates WHERE id = NEW.statement_id) INTO found;
        WHEN 'representation_relationship' THEN
            SELECT EXISTS(SELECT 1 FROM semantics.representation_relationship WHERE id = NEW.statement_id) INTO found;
        WHEN 'concept_relationship' THEN
            SELECT EXISTS(SELECT 1 FROM semantics.concept_relationship WHERE id = NEW.statement_id) INTO found;
        WHEN 'execution_claim' THEN
            SELECT EXISTS(SELECT 1 FROM semantics.execution_claim WHERE id = NEW.statement_id) INTO found;
        ELSE
            RAISE EXCEPTION 'Unknown statement_type: %', NEW.statement_type;
    END CASE;

    IF NOT found THEN
        RAISE EXCEPTION 'Polymorphic resolution failed: no row in % with id %',
            NEW.statement_type, NEW.statement_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_statement_evidence_check_statement ON semantics.statement_evidence;
CREATE TRIGGER trg_statement_evidence_check_statement
  BEFORE INSERT OR UPDATE ON semantics.statement_evidence
  FOR EACH ROW
  EXECUTE FUNCTION semantics.check_statement_id();

-- ── 4. Stored procedures for the service registry ──────────────────────

CREATE OR REPLACE FUNCTION semantics.add_execution_claim(
    p_id uuid DEFAULT NULL,
    p_resolution_claim_id uuid DEFAULT NULL,
    p_claim_key text DEFAULT NULL,
    p_subject_kind text DEFAULT NULL,
    p_subject_ref jsonb DEFAULT '{}'::jsonb,
    p_predicate text DEFAULT NULL,
    p_object_value jsonb DEFAULT '{}'::jsonb,
    p_policy_version_hash text DEFAULT NULL,
    p_lease_id text DEFAULT NULL,
    p_grant_id text DEFAULT NULL,
    p_attempt_id text DEFAULT NULL,
    p_declared_by text DEFAULT NULL,
    p_declared_at timestamptz DEFAULT now(),
    p_observed_at timestamptz DEFAULT NULL,
    p_disposition text DEFAULT 'Proposed',
    p_verification_method text DEFAULT NULL,
    p_verified_by text DEFAULT NULL,
    p_verified_at timestamptz DEFAULT NULL,
    p_verification_summary jsonb DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.execution_claim AS $$
DECLARE v_row semantics.execution_claim%ROWTYPE;
BEGIN
    INSERT INTO semantics.execution_claim (
        id, resolution_claim_id, claim_key, subject_kind, subject_ref,
        predicate, object_value, policy_version_hash, lease_id, grant_id,
        attempt_id, declared_by, declared_at, observed_at, disposition,
        verification_method, verified_by, verified_at, verification_summary,
        expired_at
    ) VALUES (
        COALESCE(p_id, gen_random_uuid()), p_resolution_claim_id, p_claim_key,
        p_subject_kind, COALESCE(p_subject_ref, '{}'::jsonb), p_predicate,
        COALESCE(p_object_value, '{}'::jsonb), p_policy_version_hash, p_lease_id,
        p_grant_id, p_attempt_id, p_declared_by, COALESCE(p_declared_at, now()),
        p_observed_at, COALESCE(p_disposition, 'Proposed'), p_verification_method,
        p_verified_by, p_verified_at, p_verification_summary, p_expired_at
    ) RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_execution_claim(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.execution_claim SET expired_at = now()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_execution_claim(
    p_id uuid,
    p_resolution_claim_id uuid DEFAULT NULL,
    p_claim_key text DEFAULT NULL,
    p_subject_kind text DEFAULT NULL,
    p_subject_ref jsonb DEFAULT '{}'::jsonb,
    p_predicate text DEFAULT NULL,
    p_object_value jsonb DEFAULT '{}'::jsonb,
    p_policy_version_hash text DEFAULT NULL,
    p_lease_id text DEFAULT NULL,
    p_grant_id text DEFAULT NULL,
    p_attempt_id text DEFAULT NULL,
    p_declared_by text DEFAULT NULL,
    p_declared_at timestamptz DEFAULT now(),
    p_observed_at timestamptz DEFAULT NULL,
    p_disposition text DEFAULT 'Proposed',
    p_verification_method text DEFAULT NULL,
    p_verified_by text DEFAULT NULL,
    p_verified_at timestamptz DEFAULT NULL,
    p_verification_summary jsonb DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.execution_claim AS $$
DECLARE v_row semantics.execution_claim%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.execution_claim SET expired_at = now()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'update_execution_claim: no active row with id %', p_id;
    END IF;

    INSERT INTO semantics.execution_claim (
        id, resolution_claim_id, claim_key, subject_kind, subject_ref,
        predicate, object_value, policy_version_hash, lease_id, grant_id,
        attempt_id, declared_by, declared_at, observed_at, disposition,
        verification_method, verified_by, verified_at, verification_summary,
        expired_at
    ) VALUES (
        gen_random_uuid(), p_resolution_claim_id, p_claim_key, p_subject_kind,
        COALESCE(p_subject_ref, '{}'::jsonb), p_predicate,
        COALESCE(p_object_value, '{}'::jsonb), p_policy_version_hash, p_lease_id,
        p_grant_id, p_attempt_id, p_declared_by, COALESCE(p_declared_at, now()),
        p_observed_at, COALESCE(p_disposition, 'Proposed'), p_verification_method,
        p_verified_by, p_verified_at, p_verification_summary, p_expired_at
    ) RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

COMMIT;
