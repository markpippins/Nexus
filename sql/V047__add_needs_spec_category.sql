-- V047: Add NEEDS_SPEC category to open_questions
--
-- Enables Planner → Architect escalation:
-- 1. Planner reviews Analyst answer
-- 2. If work needed, creates question with category=NEEDS_SPEC
-- 3. Architect cron picks up NEEDS_SPEC questions
-- 4. Architect writes spec + implementation plan
-- 5. Architect resolves the NEEDS_SPEC question

ALTER TABLE nebula.open_questions
  DROP CONSTRAINT open_questions_category_check,
  ADD CONSTRAINT open_questions_category_check
    CHECK (category = ANY (ARRAY[
      'AMBIGUITY'::text,
      'MISSING_INFO'::text,
      'CONFLICT'::text,
      'SCOPE'::text,
      'DEPENDENCY'::text,
      'DUPLICATE_CANDIDATE'::text,
      'WORK_COMPLETED'::text,
      'NEEDS_SPEC'::text
    ]));
