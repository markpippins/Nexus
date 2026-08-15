-- Migration 042: open-question integrity and canonical answer history
-- Approved in Assembly To Do W2 on 2026-08-13.
-- Applied by DBA in a reviewable transaction after source cutover.
--
-- Note: requirements is a view over requirements_history. Its history table has
-- duplicate logical IDs across recorded revisions, so a direct FK from
-- open_questions_history.requirement_id cannot be created safely without a
-- separate stable requirement identity design. The migration documents that
-- discrepancy and adds the candidate FK, whose history IDs are unique.

BEGIN;

CREATE TABLE IF NOT EXISTS nebula.schema_version (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO nebula.schema_version (version, description)
VALUES (41, 'Baseline: nebula migrations 001-041 predate per-version ledger tracking')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE nebula.open_question_answers_history
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nebula'
      AND table_name = 'open_question_answers_history'
      AND column_name = 'as_of_dt'
  ) THEN
    ALTER TABLE nebula.open_question_answers_history
      RENAME COLUMN as_of_dt TO recorded_on_dt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nebula'
      AND table_name = 'open_question_answers_history'
      AND column_name = 'expiration_dt'
  ) THEN
    ALTER TABLE nebula.open_question_answers_history
      RENAME COLUMN expiration_dt TO recorded_until_dt;
  END IF;
END
$$;

-- Recreate the view so its public column names follow the system convention.
-- There are no dependent views or constraints in the live catalog at apply time.
DROP VIEW IF EXISTS nebula.open_question_answers;
CREATE VIEW nebula.open_question_answers AS
SELECT id,
       question_id,
       role,
       answer,
       confidence,
       reasoning,
       answered_at,
       version,
       valid_from,
       valid_until,
       recorded_on_dt,
       recorded_until_dt,
       metadata
  FROM nebula.open_question_answers_history
 WHERE now() >= valid_from
   AND now() < valid_until
   AND now() >= recorded_on_dt
   AND now() < recorded_until_dt;

-- Preserve the 495 historical answer facts without inventing answer content.
-- [CONTENT_LOST] is a marker, not reconstructed answer text; metadata carries
-- the machine-readable epistemic state and provenance of this backfill.
INSERT INTO nebula.open_question_answers_history
  (question_id, role, answer, confidence, reasoning, answered_at, version,
   valid_from, valid_until, recorded_on_dt, recorded_until_dt, metadata)
SELECT q.id,
       q.answered_by,
       '[CONTENT_LOST]',
       'UNKNOWN',
       NULL,
       q.answered_at,
       1,
       q.answered_at,
       '9999-12-31 00:00:00+00'::timestamptz,
       q.answered_at,
       '9999-12-31 00:00:00+00'::timestamptz,
       jsonb_build_object(
         'content_lost', true,
         'source', 'dba-backfill-2026-08-13',
         'reason', 'answered pointer existed without recoverable answer row'
       )
  FROM nebula.open_questions q
 WHERE q.answered_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM nebula.open_question_answers_history h
      WHERE h.question_id = q.id
   );

-- Five answer rows existed without the denormalized latest-answer pointer.
WITH latest AS (
  SELECT DISTINCT ON (question_id)
         question_id, role, answered_at
    FROM nebula.open_question_answers_history
   ORDER BY question_id, answered_at DESC, version DESC, id DESC
)
UPDATE nebula.open_questions_history q
   SET answered_by = latest.role,
       answered_at = latest.answered_at,
       updated_at = now()
  FROM latest
 WHERE q.id = latest.question_id
   AND q.answered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_open_questions_history_status
  ON nebula.open_questions_history (status);
CREATE INDEX IF NOT EXISTS idx_open_questions_history_requirement_id
  ON nebula.open_questions_history (requirement_id);
CREATE INDEX IF NOT EXISTS idx_open_questions_history_candidate_id
  ON nebula.open_questions_history (candidate_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'nebula.open_questions_history'::regclass
       AND conname = 'open_questions_candidate_id_fkey'
  ) THEN
    ALTER TABLE nebula.open_questions_history
      ADD CONSTRAINT open_questions_candidate_id_fkey
      FOREIGN KEY (candidate_id)
      REFERENCES nebula.harvest_candidates_history (id);
  END IF;
END
$$;

COMMENT ON COLUMN nebula.open_questions_history.requirement_id IS
  'Logical reference to nebula.requirements. No FK is installed because requirements_history has duplicate IDs across bitemporal revisions; see migration 042.';

-- The live junction contained only candidate/requirement links and every row
-- matched the corresponding direct column. Application reads/writes were cut
-- over before this drop.
DROP TABLE IF EXISTS nebula.open_question_entities;

-- Keep the answer writer aligned with the renamed temporal columns.
CREATE OR REPLACE FUNCTION nebula.record_answer(
  p_question_id uuid,
  p_role text,
  p_answer text,
  p_confidence text DEFAULT 'MEDIUM'::text,
  p_reasoning text DEFAULT NULL::text
)
RETURNS TABLE(
  out_id uuid,
  out_question_id uuid,
  out_role text,
  out_answer text,
  out_confidence text,
  out_reasoning text,
  out_version integer,
  out_answered_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  next_version integer;
BEGIN
  UPDATE nebula.open_question_answers_history
     SET valid_until = now(), recorded_until_dt = now()
   WHERE question_id = p_question_id
     AND role = p_role
     AND valid_until > now();

  SELECT COALESCE(MAX(version), 0) + 1
    INTO next_version
    FROM nebula.open_question_answers_history
   WHERE question_id = p_question_id
     AND role = p_role;

  RETURN QUERY
  INSERT INTO nebula.open_question_answers_history
    (question_id, role, answer, confidence, reasoning, version,
     valid_from, recorded_on_dt)
  VALUES
    (p_question_id, p_role, p_answer, p_confidence, p_reasoning, next_version,
     now(), now())
  RETURNING id, question_id, role, answer, confidence, reasoning, version, answered_at;

  UPDATE nebula.open_questions_history
     SET answered_by = p_role,
         answered_at = now()
   WHERE id = p_question_id;

  PERFORM pg_notify('open_question_answered', json_build_object(
    'event_type', 'question.answered',
    'question_id', p_question_id,
    'role', p_role,
    'version', next_version,
    'timestamp', now()
  )::text);
END;
$$;

INSERT INTO nebula.schema_version (version, description)
VALUES (42, 'W2 open-question integrity: answer backfill, temporal naming, indexes, candidate FK, junction retirement')
ON CONFLICT (version) DO NOTHING;

COMMIT;
