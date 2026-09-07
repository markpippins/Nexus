-- =============================================================================
-- V143 (Lilac Wave 1, plan 8261639 / Stage B): canonical admission replay-proofing
-- =============================================================================
-- Ratified by Q-C (architect decision daae50b0, 2026-09-06): the PEB partial
-- unique index ships as a SEPARATE additive migration — index + trigger only,
-- no data movement, independently reversible — so Stage B can proceed and
-- roll back alone, decoupled from V142's freeze timeline (V144 is the
-- self-gating retirement DDL; see V141 numbering note).
--
-- What this adds (canonical surface, resolution.receipt):
--   1. SELF-GATING PRE-VERIFICATION (Q-C: "dry-run SELECT on the indexed
--      expression against live rows before CREATE INDEX" — executable form):
--      the migration REFUSES to apply if any duplicate
--      payload->>'peb_transaction_id' exists among kind='admission' rows.
--      Live probe of record 2026-09-07: 0 admission rows, 0 duplicates on
--      BOTH local and vanadium (legacy V132 surface: 3 rows, 0 dups, its own
--      unique index idx_execution_admission_receipt_peb_tx intact).
--   2. PARTIAL UNIQUE INDEX on the canonical admission branch:
--        UNIQUE (payload->>'peb_transaction_id')
--        WHERE kind='admission' AND the id IS NOT NULL AND <> ''
--      Stage B of the writer-redirection design: PEB admission replays
--      become idempotent at the canonical surface, mirroring the peb
--      transaction id uniqueness the legacy surface already enforces
--      (authority stays PEB-only per C2 Q3 — this adds NO producer grants).
--   3. APPEND-ONLY TRIGGER MIRROR (V132 parity): UPDATE/DELETE on canonical
--      kind='admission' rows is refused. Scoped with a WHEN clause so
--      lifecycle rows are untouched; corrections create a NEW receipt
--      (R4 replay paths), history is never rewritten.
--
-- Reversibility (Q-C "independently reversible"):
--   DROP TRIGGER IF EXISTS trg_canonical_admission_append_only ON resolution.receipt;
--   DROP FUNCTION IF EXISTS resolution.forbid_canonical_admission_mutation();
--   DROP INDEX IF EXISTS resolution.uq_resolution_receipt_admission_peb_txn;
--   (No data is created, moved, or destroyed by this migration.)
--
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
-- =============================================================================

BEGIN;

-- ── 1. Self-gating pre-verification (Q-C) ───────────────────────────────────
DO $$
DECLARE
    v_dup       bigint;
    v_adm_rows  bigint;
    v_v132      oid;
    v_v132_dup  bigint;
BEGIN
    -- The exact expression the index enforces, scanned against live rows.
    SELECT count(*) INTO v_dup FROM (
        SELECT payload->>'peb_transaction_id' AS txn
        FROM resolution.receipt
        WHERE kind = 'admission'
          AND payload->>'peb_transaction_id' IS NOT NULL
          AND payload->>'peb_transaction_id' <> ''
        GROUP BY 1
        HAVING count(*) > 1
    ) d;
    SELECT count(*) INTO v_adm_rows FROM resolution.receipt WHERE kind = 'admission';

    IF v_dup > 0 THEN
        RAISE EXCEPTION
            'V143 pre-verification FAILED: % duplicate peb_transaction_id value(s) among % canonical admission rows — resolve before applying (Q-C)',
            v_dup, v_adm_rows
            USING ERRCODE = 'P0003';
    END IF;
    RAISE NOTICE 'V143 probe: % canonical admission rows, 0 duplicates — safe to index', v_adm_rows;

    -- Supplementary probe of the legacy V132 surface (informational only).
    v_v132 := to_regclass('resolution.execution_admission_receipt');
    IF v_v132 IS NOT NULL THEN
        SELECT count(*) INTO v_v132_dup FROM (
            SELECT peb_transaction_id FROM resolution.execution_admission_receipt
            GROUP BY 1 HAVING count(*) > 1
        ) d;
        IF v_v132_dup > 0 THEN
            RAISE WARNING 'V143 probe: % duplicate peb_transaction_id values in legacy execution_admission_receipt (has its own unique index — investigate)', v_v132_dup;
        ELSE
            RAISE NOTICE 'V143 probe: legacy V132 surface consistent (0 duplicates)';
        END IF;
    ELSE
        RAISE NOTICE 'V143 probe: legacy V132 surface absent in this database — skipping (throwaway test schema or fresh install)';
    END IF;
END $$;

-- ── 2. Partial unique index (the Q-C deliverable) ───────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_resolution_receipt_admission_peb_txn
    ON resolution.receipt ((payload->>'peb_transaction_id'))
    WHERE kind = 'admission'
      AND payload->>'peb_transaction_id' IS NOT NULL
      AND payload->>'peb_transaction_id' <> '';

COMMENT ON INDEX resolution.uq_resolution_receipt_admission_peb_txn IS
    'Stage B (Q-C, daae50b0): PEB admission replay-proofing — one canonical receipt per peb_transaction_id; mirrors idx_execution_admission_receipt_peb_tx of V132. Authority stays PEB-only (C2 Q3).';

-- ── 3. Append-only mirror for the canonical admission branch (V132 parity) ──
CREATE OR REPLACE FUNCTION resolution.forbid_canonical_admission_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'resolution.receipt admission rows are append-only (Stage B, V132 parity): % blocked on peb_transaction_id %',
        TG_OP, OLD.payload->>'peb_transaction_id'
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_admission_append_only ON resolution.receipt;
CREATE TRIGGER trg_canonical_admission_append_only
    BEFORE UPDATE OR DELETE ON resolution.receipt
    FOR EACH ROW
    WHEN (OLD.kind = 'admission')
    EXECUTE FUNCTION resolution.forbid_canonical_admission_mutation();

COMMENT ON FUNCTION resolution.forbid_canonical_admission_mutation() IS
    'Stage B (Q-C): canonical admission receipts are append-only (V132 parity); lifecycle rows unaffected (WHEN kind=admission).';

COMMIT;
