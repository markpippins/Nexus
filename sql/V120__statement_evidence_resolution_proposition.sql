-- V120: statement_evidence.statement_type extended with guarded 'resolution_proposition'
-- =============================================================================
-- C1 of D-2026-08-23-A (condition precedent): extend statement_evidence with a
-- GUARDED resolution_proposition type before any T24 projection implementation.
--
-- Guarded = rows of this type must carry a trigger-enforced path to a
-- resolution.proposition row (no orphan resolution_proposition statements).
-- Mechanism chosen by DBA (record APPROVED C1, 2026-08-23): extend the existing
-- polymorphic BEFORE INSERT/UPDATE trigger check_statement_id() to resolve
-- statement_id against resolution.proposition. A plain FK cannot express a
-- cross-schema, single-type-conditional reference; this matches the V087/V116
-- polymorphic-resolution pattern and keeps one enforcement point for all types.
--
-- No backfill required (new writes only, per C1).
--
-- Idempotent: safe to run repeatedly (DROP ... IF EXISTS / CREATE OR REPLACE).

BEGIN;

-- ── 1. Extend the statement_type CHECK to admit resolution_proposition ──
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
      'execution_claim',
      'resolution_proposition'
    ));

-- ── 2. Guard: polymorphic resolution for the new type ─────────────────────────
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
        WHEN 'resolution_proposition' THEN
            SELECT EXISTS(SELECT 1 FROM resolution.proposition WHERE id = NEW.statement_id) INTO found;
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

COMMIT;