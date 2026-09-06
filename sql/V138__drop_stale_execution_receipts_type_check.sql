-- V138: drop stale legacy execution.receipts type CHECK (plan 0016 FINDING #3)
--
-- Background: the artifact-critique edge (plan 0016) routes CRITIQUE /
-- CRITIQUE_PASS / CRITIQUE_REJECT receipts for real plans into
-- execution.receipts (the kernel's resolve_request_for_receipt path). The
-- correct type constraint `chk_execution_receipts_type` (added in V051)
-- includes the critique family, but a STALE legacy constraint
-- `receipts_type_check` (from an earlier schema) also exists on the same
-- column and does NOT include CRITIQUE/CRITIQUE_PASS/CRITIQUE_REJECT.
--
-- Because PostgreSQL enforces all CHECK constraints (AND semantics), the
-- stale constraint rejects CRITIQUE inserts with:
--   psycopg2.errors.CheckViolation: ... violates check constraint
--   "receipts_type_check"
--   Failing row: (..., CRITIQUE, critic, ...)
--
-- This blocks the artifact-critique flow for real plans in production and
-- thereby blocks re-enabling the automatic ticket-dispatch timers.
--
-- Fix: drop the stale legacy constraint, leaving the correct
-- `chk_execution_receipts_type` (which includes the critique family). If a
-- fresh DB somehow only ever had the legacy constraint, we also defensively
-- recreate the correct one.
--
-- R9 note: schema change. MUST be replicated to vanadium (host `vanadium`,
-- db `nexus`, user `pguser`, port 5432 — the canonical live replica target;
-- barium 192.168.1.212 is unreachable on disk-full + forensics hold) AFTER
-- the DBA applies it locally — per AGENTS.md R9, never assume replication;
-- confirm with the operator.

-- 1. Drop the stale legacy constraint (no-op if already gone).
ALTER TABLE execution.receipts
  DROP CONSTRAINT IF EXISTS receipts_type_check;

-- 2. Ensure the correct constraint is present (idempotent; no-op if V051
--    already added it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'execution.receipts'::regclass
      AND conname = 'chk_execution_receipts_type'
  ) THEN
    ALTER TABLE execution.receipts
      ADD CONSTRAINT chk_execution_receipts_type
      CHECK (type IN (
        'ABANDONED', 'API_LIMIT', 'BLOCK', 'CANCELLED', 'CCNF_EXECUTION',
        'CRITIQUE', 'CRITIQUE_PASS', 'CRITIQUE_REJECT', 'EXECUTION_COMPLETE',
        'HOLD', 'IMPLEMENTATION', 'PLANNING', 'PLAN_BLOCK', 'PLAN_CREATE',
        'PROPOSED', 'REQUEUED', 'REVIEW', 'REVIEW_PASS', 'REVIEW_REJECT'
      ));
  END IF;
END
$$;