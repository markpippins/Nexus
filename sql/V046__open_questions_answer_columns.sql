-- V046: Add answered_by/answered_at columns to open_questions
--
-- Separates "answering" from "resolving" a question:
--   - Answer: record who answered and when, status stays OPEN
--   - Resolve: change status to RESOLVED, requires answer to exist

ALTER TABLE nebula.open_questions
  ADD COLUMN answered_by TEXT,
  ADD COLUMN answered_at TIMESTAMPTZ;

COMMENT ON COLUMN nebula.open_questions.answered_by IS 'Role that provided the answer (e.g. analyst). Set by PUT /open-questions/:id/answer.';
COMMENT ON COLUMN nebula.open_questions.answered_at IS 'Timestamp when the answer was recorded.';
