-- V051: Drop resolution column from open_questions
--
-- The resolution column held single-answer text before the multi-role
-- deliberation system (open_question_answers table, V050) was introduced.
-- All remaining resolution data has been migrated to open_question_answers
-- and all code dependencies on this column have been eliminated.
--
-- Prerequisites:
--   - V050 (open_question_answers table + migration from legacy data)
--   - All application code no longer SELECTs or references o.resolution

BEGIN;

ALTER TABLE nebula.open_questions
  DROP COLUMN IF EXISTS resolution;

COMMIT;
