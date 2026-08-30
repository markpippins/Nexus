-- =============================================================================
-- W3.03: Harden durable evidence and receipt persistence
-- =============================================================================
-- 1. Append-only enforcement for resolution.execution_admission_receipt
--    (evidence-plane immutability): BEFORE UPDATE/DELETE trigger raising an
--    exception. Corrections create a NEW receipt (idempotent-replay path in
--    resolution.admit_verified_execution_claim already deduplicates by
--    peb_transaction_id); history is never rewritten.
-- 2. UUID validation guard for receipt correlation ids stored in
--    peb.transactions.metadata (peb_transaction_id / conduit_transition_id):
--    a malformed correlation id must never enter the witnessed-run join.
--    Implemented as a check function usable in CHECK constraints or triggers.
--
-- Preserves separate PEB and Conduit authorities: this migration touches
-- resolution.* evidence only and adds read-side validation helpers for the
-- execution-srv witnessed-run join. peb.decisions stays dormant.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP ... IF EXISTS).
-- =============================================================================

BEGIN;

-- ── 1. Append-only enforcement for execution_admission_receipt ──────────────

CREATE OR REPLACE FUNCTION resolution.forbid_admission_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'resolution.execution_admission_receipt is append-only: % blocked on peb_transaction_id %',
        TG_OP, OLD.peb_transaction_id
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_admission_receipt_no_update ON resolution.execution_admission_receipt;
CREATE TRIGGER trg_admission_receipt_no_update
    BEFORE UPDATE ON resolution.execution_admission_receipt
    FOR EACH ROW EXECUTE FUNCTION resolution.forbid_admission_receipt_mutation();

DROP TRIGGER IF EXISTS trg_admission_receipt_no_delete ON resolution.execution_admission_receipt;
CREATE TRIGGER trg_admission_receipt_no_delete
    BEFORE DELETE ON resolution.execution_admission_receipt
    FOR EACH ROW EXECUTE FUNCTION resolution.forbid_admission_receipt_mutation();

COMMENT ON FUNCTION resolution.forbid_admission_receipt_mutation() IS
    'W3.03: evidence-plane immutability — admission receipts are append-only; corrections create a new receipt via the idempotent-replay path.';

-- ── 2. UUID validation for receipt correlation ids ──────────────────────────
-- The witnessed-run join correlates receipts via
-- receipts.metadata->>'peb_transaction_id' / 'conduit_transition_id' (TEXT).
-- This helper validates the shape so a malformed correlation id can never
-- enter the join. Usable in CHECK constraints or BEFORE triggers.

CREATE OR REPLACE FUNCTION resolution.is_uuid(value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF value IS NULL THEN
        RETURN FALSE;
    END IF;
    PERFORM value::uuid;
    RETURN TRUE;
EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION resolution.is_uuid(text) IS
    'W3.03: strict UUID text validation for receipt correlation ids entering the witnessed-run join.';

COMMIT;
