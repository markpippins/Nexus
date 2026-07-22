-- V038: Add candidate_id to open_questions
--
-- Allows the Planner to write blocking questions about candidates
-- (e.g., duplicate evidence) before they are promoted to requirements.
--
-- requirement_id remains nullable — questions can reference either
-- a candidate, a requirement, or neither (legacy records).

ALTER TABLE nebula.open_questions
    ADD COLUMN candidate_id uuid;

CREATE INDEX idx_open_questions_candidate
    ON nebula.open_questions (candidate_id)
    WHERE candidate_id IS NOT NULL;

COMMENT ON COLUMN nebula.open_questions.candidate_id
    IS 'References harvest_candidates.id. Set by Planner for pre-promotion blocking questions (duplicates, evidence).';
