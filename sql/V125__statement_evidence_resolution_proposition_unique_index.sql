-- V125: Unique index on resolution_proposition evidence links
-- ============================================================
-- T24 Phase 3 (plan 0006) — close the V120 gap with a uniqueness
-- guard on the forward write path.
--
-- Prevents duplicate evidence_item→resolution_proposition links:
-- the same evidence_item cannot link to the same proposition twice
-- for the same statement_type. Idempotent re-runs of the
-- backfill script and forward-write epistemologist runs are
-- enforced at the database level.
--
-- Partial index: only applies to resolution_proposition rows
-- where expired_at IS NULL (standard soft-delete pattern).
--
-- Idempotent: safe to re-run (DROP ... IF EXISTS / CREATE).

BEGIN;

DROP INDEX IF EXISTS semantics.idx_statement_evidence_proposition_unique;

CREATE UNIQUE INDEX idx_statement_evidence_proposition_unique
  ON semantics.statement_evidence (evidence_item_id, statement_id)
  WHERE statement_type = 'resolution_proposition' AND expired_at IS NULL;

COMMIT;