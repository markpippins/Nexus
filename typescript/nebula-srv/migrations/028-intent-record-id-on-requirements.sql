-- 028-intent-record-id-on-requirements.sql
-- Add intent_record_id column to nebula.requirements for provenance linking:
--   requirement → intent_record → harvest_candidate → harvest
--
-- Previously only candidate_id existed, requiring an indirect join through
-- harvest_candidates to find the intent_record. This makes it first-class.

ALTER TABLE nebula.requirements
  ADD COLUMN IF NOT EXISTS intent_record_id uuid;

COMMENT ON COLUMN nebula.requirements.intent_record_id IS
  'The intent_record that this requirement was promoted from. Direct link for provenance: requirement → intent_record → candidate → harvest.';
