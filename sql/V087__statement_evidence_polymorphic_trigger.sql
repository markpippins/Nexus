-- V087: Polymorphic resolution trigger for statement_evidence.statement_id
-- T04 3B follow-up (thread: fe2d976d)
-- Before insert or update, verifies statement_id exists in the table
-- named by statement_type. Rejects dangling refs.
--
-- statement_type → table mapping:
--   source_observation           → semantics.source_observation
--   agent_record                 → nebula.agent_records (view)
--   work_request                 → nebula.work_requests OR conduit.work_requests
--   implementation_plan          → nebula.implementation_plans
--   harvest_candidate            → nebula.harvest_candidates (view)
--   representation_relationship  → semantics.representation_relationship
--   concept_relationship         → semantics.concept_relationship

BEGIN;

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
        ELSE
            -- statement_type CHECK constraint already guards this path,
            -- but defense in depth
            RAISE EXCEPTION 'Unknown statement_type: %', NEW.statement_type;
    END CASE;

    IF NOT found THEN
        RAISE EXCEPTION 'Polymorphic resolution failed: no row in % with id %',
            NEW.statement_type, NEW.statement_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_statement_evidence_check_statement
  BEFORE INSERT OR UPDATE ON semantics.statement_evidence
  FOR EACH ROW
  EXECUTE FUNCTION semantics.check_statement_id();

COMMIT;
