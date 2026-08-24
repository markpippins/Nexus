-- =============================================================================
-- MIGRATION: resolution v34 — verified_statement immutability trigger
--
-- Adopted from the /claude experimental branch (2026-08-24).
--
-- Same pattern as resolution.execution_evidence_immutable() from v28:
-- verified_statement has always been INTENDED as an immutable compile-step
-- fact (the Verifier's output), but that was convention only, never enforced.
-- Confirmed nothing in this build ever updates or deletes a row here, so this
-- is a pure safety net — it enforces what was already true in practice.
--
-- Semantics:
--   BEFORE UPDATE OR DELETE → RAISE EXCEPTION, preserving the verifier's
--   output exactly as recorded. INSERT-only from this point forward.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION resolution.verified_statement_immutable()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'resolution.verified_statement is immutable: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verified_statement_immutable ON resolution.verified_statement;
CREATE TRIGGER trg_verified_statement_immutable
    BEFORE UPDATE OR DELETE ON resolution.verified_statement
    FOR EACH ROW
    EXECUTE FUNCTION resolution.verified_statement_immutable();

COMMIT;