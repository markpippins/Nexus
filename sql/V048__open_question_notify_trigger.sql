-- V048: pg_notify trigger for open_questions answer/resolve events
--
-- Fires pg_notify when:
-- 1. answered_by changes from NULL → non-NULL (question.answered)
-- 2. status changes to 'RESOLVED' (question.resolved)
--
-- The obs_subscriber listens for these notifications and publishes
-- them as CanonicalEnvelopes over NATS.

CREATE OR REPLACE FUNCTION nebula.notify_open_question_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Fire when answered_by changes (answer recorded)
  IF (TG_OP = 'UPDATE') THEN
    IF (NEW.answered_by IS NOT NULL AND OLD.answered_by IS NULL) THEN
      PERFORM pg_notify('open_question_answered', json_build_object(
        'event_type', 'question.answered',
        'question_id', NEW.id,
        'title', NEW.title,
        'category', NEW.category,
        'answered_by', NEW.answered_by,
        'requirement_id', NEW.requirement_id,
        'candidate_id', NEW.candidate_id,
        'timestamp', NOW()
      )::text);
    END IF;

    -- Fire when status changes to RESOLVED
    IF (NEW.status = 'RESOLVED' AND OLD.status != 'RESOLVED') THEN
      PERFORM pg_notify('open_question_resolved', json_build_object(
        'event_type', 'question.resolved',
        'question_id', NEW.id,
        'title', NEW.title,
        'category', NEW.category,
        'resolved_by', NEW.resolved_by,
        'requirement_id', NEW.requirement_id,
        'candidate_id', NEW.candidate_id,
        'timestamp', NOW()
      )::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_open_question_event
  AFTER UPDATE ON nebula.open_questions
  FOR EACH ROW
  EXECUTE FUNCTION nebula.notify_open_question_event();
