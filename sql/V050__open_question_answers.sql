-- V050: Open question answers — support multiple answers per question
-- for multi-role deliberation rounds.

BEGIN;

-- ── Answers table ──────────────────────────────────────────────────────
-- Each row is one contribution from one role to one question.
-- Multiple roles can answer the same question; the same role can answer
-- multiple times (iterative refinement).

CREATE TABLE IF NOT EXISTS nebula.open_question_answers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id     UUID NOT NULL REFERENCES nebula.open_questions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    answer          TEXT NOT NULL,
    confidence      TEXT DEFAULT 'MEDIUM',
    reasoning       TEXT,
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oqa_question
    ON nebula.open_question_answers (question_id);

CREATE INDEX IF NOT EXISTS idx_oqa_role
    ON nebula.open_question_answers (role);

CREATE INDEX IF NOT EXISTS idx_oqa_question_role
    ON nebula.open_question_answers (question_id, role);

-- ── Migrate existing single answers ────────────────────────────────────
-- If open_questions has an existing answer (answered_by IS NOT NULL),
-- seed it into open_question_answers.

INSERT INTO nebula.open_question_answers (question_id, role, answer, confidence, reasoning, answered_at)
SELECT
    oq.id,
    oq.answered_by,
    oq.resolution,
    'MEDIUM',
    NULL,
    COALESCE(oq.answered_at, oq.updated_at)
FROM nebula.open_questions oq
WHERE oq.answered_by IS NOT NULL
  AND oq.resolution IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM nebula.open_question_answers a
      WHERE a.question_id = oq.id AND a.role = oq.answered_by
  );

-- ── View: latest answer per question ───────────────────────────────────
-- Useful for queries that want the most recent contribution.

CREATE OR REPLACE VIEW nebula.v_latest_question_answer AS
SELECT DISTINCT ON (a.question_id)
    a.id,
    a.question_id,
    a.role,
    a.answer,
    a.confidence,
    a.reasoning,
    a.answered_at
FROM nebula.open_question_answers a
ORDER BY a.question_id, a.answered_at DESC;

-- ── View: answer count per question ────────────────────────────────────
-- Shows how many contributions each question has received.

CREATE OR REPLACE VIEW nebula.v_question_answer_counts AS
SELECT
    question_id,
    COUNT(*) AS answer_count,
    COUNT(DISTINCT role) AS role_count
FROM nebula.open_question_answers
GROUP BY question_id;

COMMIT;
