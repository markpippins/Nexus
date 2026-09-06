-- =============================================================================
-- V137: Expire orphaned statement_evidence rows referencing retired semantics.*
-- =============================================================================
-- V134 (semantics_retire_ontology_tables, commit 30221fc6) dropped the 9
-- duplicated ontology tables from nexus.semantics (owning_subsystem, concept,
-- concept_relationship, representation, representation_identity,
-- representation_relationship, identity_strategy, consumer_operation,
-- execution_claim) and repointed semantics.check_statement_id() to resolve
-- those statement types against resolution.*.
--
-- V134 Step 3 expired the legacy nebula/conduit-coupled statement types
-- (agent_record, work_request, implementation_plan, harvest_candidate) but did
-- NOT expire `representation_relationship` / `concept_relationship` rows —
-- those are in the kept SOL vocabulary, so they survived the type-Check.
-- However, V134's Phase 3 (external consumer redirect) was never completed
-- (handoff 5e2884db, 2026-09-01): the surviving statement_evidence rows still
-- reference the DROPPED semantics.* tables, and their statement_ids are not
-- present in resolution.*.
--
-- Live audit (2026-09-05, architect record 78764f7f): 88 ACTIVE rows are
-- orphaned — 51 representation_relationship + 37 concept_relationship — whose
-- statement_id does not resolve against resolution.representation_relationship
-- (3 rows) or resolution.concept_relationship (15 rows). They do not fail the
-- trigger on read (it fires only on write) but are dead references.
--
-- This migration expires exactly those orphaned rows (append-only soft delete,
-- matching V134's expiry pattern) so the survivor set is internally consistent
-- and the polymorphic junction no longer points at dropped tables.
--
-- Design decisions:
--   * Soft-delete (expired_at = now()), never hard-delete — append-only
--     philosophy; the rows remain as read-only history.
--   * Guarded by the SAME orphan predicate as the audit, so rows that DO
--     resolve against resolution.* (or are already expired) are never touched.
--   * Idempotent — re-running is a no-op (the orphaned rows are already
--     expired; the predicate only matches expired_at IS NULL).
--   * Disables the polymorphic trigger around the UPDATE because the retired
--     statement types are no longer recognized by check_statement_id(); it is
--     re-enabled immediately after (mirrors V134 Step 3).
--   * Preserves resolution_proposition rows (38, resolvable against
--     resolution.proposition) — not matched by this predicate.
-- =============================================================================

BEGIN;

-- ── 1. Pre-flight audit (fail loudly if the survivor set would be empty) ────
DO $$
DECLARE
    orphaned  integer;
    preservable integer;
BEGIN
    SELECT count(*) INTO orphaned
    FROM semantics.statement_evidence se
    WHERE se.expired_at IS NULL
      AND se.statement_type IN ('representation_relationship','concept_relationship','execution_claim')
      AND NOT EXISTS (SELECT 1 FROM resolution.representation_relationship r WHERE r.id = se.statement_id AND se.statement_type = 'representation_relationship')
      AND NOT EXISTS (SELECT 1 FROM resolution.concept_relationship r2 WHERE r2.id = se.statement_id AND se.statement_type = 'concept_relationship')
      AND NOT EXISTS (SELECT 1 FROM resolution.execution_claim e WHERE e.id = se.statement_id AND se.statement_type = 'execution_claim');

    SELECT count(*) INTO preservable
    FROM semantics.statement_evidence se
    WHERE se.expired_at IS NULL
      AND se.statement_type IN ('representation_relationship','concept_relationship','execution_claim')
      AND (
           (se.statement_type = 'representation_relationship' AND EXISTS (SELECT 1 FROM resolution.representation_relationship r WHERE r.id = se.statement_id))
        OR (se.statement_type = 'concept_relationship'        AND EXISTS (SELECT 1 FROM resolution.concept_relationship r2 WHERE r2.id = se.statement_id))
        OR (se.statement_type = 'execution_claim'             AND EXISTS (SELECT 1 FROM resolution.execution_claim e WHERE e.id = se.statement_id))
      );

    IF preservable > 0 THEN
        RAISE EXCEPTION 'V137 pre-flight FAILED — % resolvable active rows exist; refusing to expire (predicate too broad)', preservable;
    END IF;

    RAISE NOTICE 'V137 pre-flight OK: % orphaned rows to expire, % resolvable preserved', orphaned, preservable;
END $$;

-- ── 2. Expire the orphaned rows (trigger disabled around the UPDATE) ────────
ALTER TABLE semantics.statement_evidence
    DISABLE TRIGGER trg_statement_evidence_check_statement;

UPDATE semantics.statement_evidence se
   SET expired_at = now()
 WHERE se.expired_at IS NULL
   AND se.statement_type IN ('representation_relationship','concept_relationship','execution_claim')
   AND NOT EXISTS (SELECT 1 FROM resolution.representation_relationship r WHERE r.id = se.statement_id AND se.statement_type = 'representation_relationship')
   AND NOT EXISTS (SELECT 1 FROM resolution.concept_relationship r2 WHERE r2.id = se.statement_id AND se.statement_type = 'concept_relationship')
   AND NOT EXISTS (SELECT 1 FROM resolution.execution_claim e WHERE e.id = se.statement_id AND se.statement_type = 'execution_claim');

ALTER TABLE semantics.statement_evidence
    ENABLE TRIGGER trg_statement_evidence_check_statement;

-- ── 3. Post-condition: no active orphaned rows remain ──────────────────────
DO $$
DECLARE
    remaining integer;
BEGIN
    SELECT count(*) INTO remaining
    FROM semantics.statement_evidence se
    WHERE se.expired_at IS NULL
      AND se.statement_type IN ('representation_relationship','concept_relationship','execution_claim')
      AND NOT EXISTS (SELECT 1 FROM resolution.representation_relationship r WHERE r.id = se.statement_id AND se.statement_type = 'representation_relationship')
      AND NOT EXISTS (SELECT 1 FROM resolution.concept_relationship r2 WHERE r2.id = se.statement_id AND se.statement_type = 'concept_relationship')
      AND NOT EXISTS (SELECT 1 FROM resolution.execution_claim e WHERE e.id = se.statement_id AND se.statement_type = 'execution_claim');

    IF remaining > 0 THEN
        RAISE EXCEPTION 'V137 post-check FAILED — % active orphaned rows remain', remaining;
    END IF;

    RAISE NOTICE 'V137 OK: all active orphaned statement_evidence rows expired; trigger re-enabled';
END $$;

COMMIT;