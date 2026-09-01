-- =============================================================================
-- P-series: binding decision evidence and resolution-owned consumption boundary
-- =============================================================================
-- PEB records immutable evidence; resolution alone may consume an accepted
-- advisory result into lifecycle state. No blocking authority is activated.

BEGIN;

CREATE TABLE IF NOT EXISTS peb.binding_decision_evidence (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id                text NOT NULL,
    decision_class             text NOT NULL,
    binding_contract_version   integer NOT NULL CHECK (binding_contract_version = 1),
    subject_id                 text NOT NULL,
    work_item_id               text NOT NULL,
    disposition                text NOT NULL CHECK (disposition IN
        ('allow', 'refused', 'unknown', 'stale', 'drift', 'quarantined', 'superseded', 'rolled_back')),
    authority_level            text NOT NULL CHECK (authority_level = 'advisory'),
    evaluation_fingerprint     text NOT NULL CHECK (evaluation_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
    lineage_fingerprint        text NOT NULL CHECK (lineage_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
    replay_context             text NOT NULL,
    as_of                      timestamptz NOT NULL,
    payload                    jsonb NOT NULL,
    created_at                 timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_binding_decision_identity UNIQUE (decision_id, evaluation_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_binding_decision_subject_created
    ON peb.binding_decision_evidence (subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_binding_decision_disposition
    ON peb.binding_decision_evidence (disposition, created_at DESC);

CREATE OR REPLACE FUNCTION peb.forbid_binding_decision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'peb.binding_decision_evidence is append-only: % blocked for decision %', TG_OP, OLD.decision_id
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_binding_decision_no_update ON peb.binding_decision_evidence;
CREATE TRIGGER trg_binding_decision_no_update BEFORE UPDATE ON peb.binding_decision_evidence
FOR EACH ROW EXECUTE FUNCTION peb.forbid_binding_decision_mutation();
DROP TRIGGER IF EXISTS trg_binding_decision_no_delete ON peb.binding_decision_evidence;
CREATE TRIGGER trg_binding_decision_no_delete BEFORE DELETE ON peb.binding_decision_evidence
FOR EACH ROW EXECUTE FUNCTION peb.forbid_binding_decision_mutation();

-- A single resolution-owned transition boundary. The caller supplies the
-- validated decision evidence and the target transition; this function only
-- records the boundary event. It never changes PEB authority or Conduit state.
CREATE TABLE IF NOT EXISTS resolution.binding_resolution_transition (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_evidence_id       uuid NOT NULL REFERENCES peb.binding_decision_evidence(id),
    subject_id                 text NOT NULL,
    work_item_id               text NOT NULL,
    transition_name            text NOT NULL,
    transition_status          text NOT NULL CHECK (transition_status IN ('applied', 'refused')),
    idempotency_key            text NOT NULL UNIQUE,
    created_at                 timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION resolution.consume_binding_decision(
    p_decision_evidence_id uuid,
    p_subject_id text,
    p_work_item_id text,
    p_transition_name text,
    p_idempotency_key text
) RETURNS TABLE(transition_id uuid, transition_status text, reason text)
LANGUAGE plpgsql AS $$
DECLARE
    v_decision peb.binding_decision_evidence%ROWTYPE;
    v_existing resolution.binding_resolution_transition%ROWTYPE;
    v_id uuid;
BEGIN
    IF p_decision_evidence_id IS NULL OR p_subject_id IS NULL OR p_work_item_id IS NULL
       OR p_transition_name IS NULL OR p_idempotency_key IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'MISSING_TRANSITION_CONTEXT'; RETURN;
    END IF;
    SELECT * INTO v_decision FROM peb.binding_decision_evidence WHERE id = p_decision_evidence_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'DECISION_EVIDENCE_NOT_FOUND'; RETURN;
    END IF;
    IF v_decision.authority_level <> 'advisory' THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'NON_ADVISORY_AUTHORITY'; RETURN;
    END IF;
    IF v_decision.subject_id <> p_subject_id OR v_decision.work_item_id <> p_work_item_id THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'TRANSITION_BINDING_MISMATCH'; RETURN;
    END IF;
    SELECT * INTO v_existing FROM resolution.binding_resolution_transition
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.decision_evidence_id = p_decision_evidence_id
           AND v_existing.subject_id = p_subject_id
           AND v_existing.work_item_id = p_work_item_id
           AND v_existing.transition_name = p_transition_name THEN
            RETURN QUERY SELECT v_existing.id, v_existing.transition_status, 'IDEMPOTENT_REPLAY'; RETURN;
        END IF;
        RETURN QUERY SELECT NULL::uuid, 'refused', 'CONFLICTING_IDEMPOTENCY_REPLAY'; RETURN;
    END IF;
    v_id := gen_random_uuid();
    INSERT INTO resolution.binding_resolution_transition
        (id, decision_evidence_id, subject_id, work_item_id, transition_name,
         transition_status, idempotency_key)
    VALUES
        (v_id, p_decision_evidence_id, p_subject_id, p_work_item_id,
         p_transition_name,
         CASE WHEN v_decision.disposition = 'allow' THEN 'applied' ELSE 'refused' END,
         p_idempotency_key);
    RETURN QUERY SELECT v_id,
        CASE WHEN v_decision.disposition = 'allow' THEN 'applied' ELSE 'refused' END,
        CASE WHEN v_decision.disposition = 'allow' THEN 'BOUNDARY_RECORDED' ELSE 'NEGATIVE_DECISION_PRESERVED' END;
END;
$$;

COMMIT;
