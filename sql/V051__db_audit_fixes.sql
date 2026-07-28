-- V051: Database Audit Fixes
--
-- Addresses all 15 DB test failures:
-- 1. Attach conduit triggers (enforce_state_transition, update_work_request_state, notify_work_request_event)
-- 2. Replace old conduit functions with fixed versions (migration 033)
-- 3. Create conduit.check_projection_drift()
-- 4. Backfill conduit.work_request_state from existing events
-- 5. Create vision.receipt_governance_trigger() + trigger
-- 6. Add vision.receipts.type CHECK constraint
-- 7. Add execution.receipts.type CHECK constraint
-- 8. Add execution.receipts immutability guard trigger
-- 9. Fix notify_open_question_event NULL-safe comparison

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. REPLACE conduit.enforce_state_transition() — fixed NULL logic
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conduit.enforce_state_transition()
RETURNS TRIGGER AS $TRIG$
BEGIN
  -- Only STATE.TRANSITION_COMMITTED may carry a new_state payload key.
  -- Any other event type that includes new_state is a state-mutation
  -- attempt disguised as a non-state event — reject unconditionally.
  IF NEW.event_type != 'STATE.TRANSITION_COMMITTED'
     AND NEW.payload ? 'new_state'
  THEN
    RAISE EXCEPTION
      'STATE_MUTATION_FORBIDDEN: event type % must not carry payload.new_state; '
      'only STATE.TRANSITION_COMMITTED may mutate state',
      NEW.event_type;
  END IF;
  RETURN NEW;
END;
$TRIG$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  2. REPLACE conduit.update_work_request_state() — full transition logic
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conduit.update_work_request_state()
RETURNS TRIGGER AS $$
DECLARE
  v_new_state TEXT;
  v_allowed TEXT[];
  v_current_state TEXT;
  v_ir_stage TEXT;
  v_ir_version INTEGER;
BEGIN
  IF NEW.event_type = 'WORKREQUEST.CREATED' THEN
    INSERT INTO conduit.work_request_state (
      work_request_id, current_state, last_event_id, updated_at
    ) VALUES (
      NEW.work_request_id, 'PROPOSED', NEW.event_id, NOW()
    )
    ON CONFLICT (work_request_id) DO UPDATE SET
      last_event_id = NEW.event_id,
      updated_at = NOW();

  ELSIF NEW.event_type = 'STATE.TRANSITION_COMMITTED' THEN
    v_new_state := NEW.payload->>'new_state';

    IF v_new_state IS NULL THEN
      RAISE EXCEPTION 'STATE.TRANSITION_COMMITTED event must include payload.new_state';
    END IF;

    SELECT current_state INTO v_current_state
    FROM conduit.work_request_state
    WHERE work_request_id = NEW.work_request_id;

    IF v_current_state IS NULL THEN
      RAISE EXCEPTION 'No state projection found for work_request_id %', NEW.work_request_id;
    END IF;

    v_allowed := conduit.allowed_transitions(v_current_state);

    IF NOT (v_new_state = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: % → % not allowed. Allowed: %',
        v_current_state, v_new_state, array_to_string(v_allowed, ', ');
    END IF;

    UPDATE conduit.work_request_state
    SET current_state = v_new_state,
        last_event_id = NEW.event_id,
        updated_at = NOW()
    WHERE work_request_id = NEW.work_request_id;

  ELSIF NEW.event_type = 'VISION.IR_PRODUCED' THEN
    v_ir_stage := NEW.payload->>'ir_stage';
    v_ir_version := (NEW.payload->>'ir_version')::INTEGER;

    UPDATE conduit.work_request_state
    SET vision_stage = COALESCE(v_ir_stage, vision_stage),
        vision_ir_version = COALESCE(v_ir_version, vision_ir_version),
        last_event_id = NEW.event_id,
        updated_at = NOW()
    WHERE work_request_id = NEW.work_request_id;

  ELSE
    UPDATE conduit.work_request_state
    SET last_event_id = NEW.event_id,
        updated_at = NOW()
    WHERE work_request_id = NEW.work_request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  3. ATTACH conduit triggers to work_request_events
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_enforce_state_transition ON conduit.work_request_events;
CREATE TRIGGER trg_enforce_state_transition
BEFORE INSERT ON conduit.work_request_events
FOR EACH ROW
EXECUTE FUNCTION conduit.enforce_state_transition();

DROP TRIGGER IF EXISTS trg_update_wr_state ON conduit.work_request_events;
CREATE TRIGGER trg_update_wr_state
AFTER INSERT ON conduit.work_request_events
FOR EACH ROW
EXECUTE FUNCTION conduit.update_work_request_state();

DROP TRIGGER IF EXISTS trg_notify_wr_event ON conduit.work_request_events;
CREATE TRIGGER trg_notify_wr_event
AFTER INSERT ON conduit.work_request_events
FOR EACH ROW
EXECUTE FUNCTION conduit.notify_work_request_event();

-- ═══════════════════════════════════════════════════════════════════════
--  4. CREATE conduit.check_projection_drift()
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conduit.check_projection_drift(p_wr_id UUID)
RETURNS TABLE (
  expected_state TEXT,
  expected_vision_stage TEXT,
  expected_vision_ir_version INTEGER,
  expected_last_event_id UUID,
  live_state TEXT,
  live_vision_stage TEXT,
  live_vision_ir_version INTEGER,
  live_last_event_id UUID,
  has_drift BOOLEAN
) AS $FUNC$
DECLARE
  v_event RECORD;
  v_state TEXT := 'PROPOSED';
  v_stage TEXT := NULL;
  v_ir_ver INTEGER := 0;
  v_last_event UUID := NULL;
  v_live RECORD;
BEGIN
  FOR v_event IN
    SELECT * FROM conduit.work_request_events
    WHERE work_request_id = p_wr_id
    ORDER BY sequence_number ASC
  LOOP
    IF v_event.event_type = 'WORKREQUEST.CREATED' THEN
      v_state := 'PROPOSED';
    END IF;
    IF v_event.event_type = 'STATE.TRANSITION_COMMITTED' THEN
      v_state := COALESCE(v_event.payload->>'new_state', v_state);
    END IF;
    IF v_event.event_type = 'VISION.IR_PRODUCED' THEN
      v_stage := v_event.payload->>'ir_stage';
      v_ir_ver := COALESCE((v_event.payload->>'ir_version')::integer, v_ir_ver);
    END IF;
    v_last_event := v_event.event_id;
  END LOOP;

  SELECT * INTO v_live
  FROM conduit.work_request_state
  WHERE work_request_id = p_wr_id;

  IF v_live IS NULL THEN
    expected_state := v_state;
    expected_vision_stage := v_stage;
    expected_vision_ir_version := v_ir_ver;
    expected_last_event_id := v_last_event;
    live_state := NULL;
    live_vision_stage := NULL;
    live_vision_ir_version := NULL;
    live_last_event_id := NULL;
    has_drift := TRUE;
  ELSE
    expected_state := v_state;
    expected_vision_stage := v_stage;
    expected_vision_ir_version := v_ir_ver;
    expected_last_event_id := v_last_event;
    live_state := v_live.current_state;
    live_vision_stage := v_live.vision_stage;
    live_vision_ir_version := v_live.vision_ir_version;
    live_last_event_id := v_live.last_event_id;
    has_drift := (
      v_state != v_live.current_state
      OR v_stage IS DISTINCT FROM v_live.vision_stage
      OR v_ir_ver != v_live.vision_ir_version
      OR v_last_event IS DISTINCT FROM v_live.last_event_id
    );
  END IF;

  RETURN NEXT;
END;
$FUNC$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  5. BACKFILL conduit.work_request_state from existing events
-- ═══════════════════════════════════════════════════════════════════════
-- Uses rebuild_all_projections() which truncates + replays all events.

SELECT conduit.rebuild_all_state_projections();

-- ═══════════════════════════════════════════════════════════════════════
--  6. CREATE vision.receipt_governance_trigger() + trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION vision.receipt_governance_trigger()
RETURNS TRIGGER AS $TRIG$
BEGIN
  INSERT INTO peb.governance_events (receipt_id, event_type, work_request_id, plan_id, agent_role, payload)
  VALUES (
    NEW.id,
    'receipt:' || NEW.type,
    NULL,
    NEW.plan_id,
    NEW.agent_role,
    jsonb_build_object(
      'session_id', NEW.session_id,
      'artifact_path', NEW.artifact_path,
      'summary', NEW.summary,
      'ticket_id', NEW.ticket_id,
      'tokens_used', NEW.tokens_used
    )
  )
  ON CONFLICT (receipt_id) DO NOTHING;
  RETURN NEW;
END;
$TRIG$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipt_governance ON vision.receipts;
CREATE TRIGGER trg_receipt_governance
AFTER INSERT ON vision.receipts
FOR EACH ROW
EXECUTE FUNCTION vision.receipt_governance_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  7. ADD vision.receipts.type CHECK constraint
-- ═══════════════════════════════════════════════════════════════════════
-- Vision receipts store conduit pipeline receipt types.

ALTER TABLE vision.receipts
  ADD CONSTRAINT chk_vision_receipts_type
  CHECK (type IN (
    'ABANDONED', 'API_LIMIT', 'BLOCK', 'CANCELLED', 'CCNF_EXECUTION',
    'CRITIQUE', 'CRITIQUE_PASS', 'CRITIQUE_REJECT', 'HOLD',
    'IMPLEMENTATION', 'PLANNING', 'PLAN_BLOCK', 'PLAN_CREATE',
    'PROPOSED', 'REQUEUED', 'REVIEW', 'REVIEW_PASS', 'REVIEW_REJECT'
  ));

-- ═══════════════════════════════════════════════════════════════════════
--  8. ADD execution.receipts.type CHECK constraint
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE execution.receipts
  ADD CONSTRAINT chk_execution_receipts_type
  CHECK (type IN (
    'ABANDONED', 'API_LIMIT', 'BLOCK', 'CANCELLED', 'CCNF_EXECUTION',
    'CRITIQUE', 'CRITIQUE_PASS', 'CRITIQUE_REJECT', 'EXECUTION_COMPLETE',
    'HOLD', 'IMPLEMENTATION', 'PLANNING', 'PLAN_BLOCK', 'PLAN_CREATE',
    'PROPOSED', 'REQUEUED', 'REVIEW', 'REVIEW_PASS', 'REVIEW_REJECT'
  ));

-- ═══════════════════════════════════════════════════════════════════════
--  9. ADD execution.receipts immutability guard trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION execution.receipts_immutable_guard()
RETURNS TRIGGER AS $TRIG$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE: execution.receipts cannot be updated or deleted';
  RETURN NULL;
END;
$TRIG$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipts_immutable ON execution.receipts;
CREATE TRIGGER trg_receipts_immutable
BEFORE UPDATE OR DELETE ON execution.receipts
FOR EACH ROW
EXECUTE FUNCTION execution.receipts_immutable_guard();

-- ═══════════════════════════════════════════════════════════════════════
--  10. FIX notify_open_question_event NULL-safe comparison
-- ═══════════════════════════════════════════════════════════════════════
-- Line 29: OLD.status != 'RESOLVED' is NULL-unsafe when OLD.status IS NULL.
-- Replace with IS DISTINCT FROM.

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

    -- Fire when status changes to RESOLVED (NULL-safe comparison)
    IF (NEW.status = 'RESOLVED' AND OLD.status IS DISTINCT FROM 'RESOLVED') THEN
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

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
  v_count INTEGER;
BEGIN
  -- Check conduit triggers attached
  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'conduit' AND NOT t.tgisinternal;

  IF v_count < 3 THEN
    RAISE EXCEPTION 'Expected >= 3 conduit triggers, found %', v_count;
  END IF;

  -- Check projection populated
  SELECT count(*) INTO v_count FROM conduit.work_request_state;
  IF v_count = 0 THEN
    RAISE WARNING 'conduit.work_request_state is still empty after backfill';
  END IF;

  -- Check vision governance trigger
  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_proc p ON t.tgfoid = p.oid
  WHERE n.nspname = 'vision' AND c.relname = 'receipts'
    AND p.proname = 'receipt_governance_trigger';

  IF v_count != 1 THEN
    RAISE EXCEPTION 'Expected 1 vision governance trigger, found %', v_count;
  END IF;

  -- Check execution immutability trigger
  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_proc p ON t.tgfoid = p.oid
  WHERE n.nspname = 'execution' AND c.relname = 'receipts'
    AND p.proname = 'receipts_immutable_guard';

  IF v_count != 1 THEN
    RAISE EXCEPTION 'Expected 1 execution immutability trigger, found %', v_count;
  END IF;

  RAISE NOTICE 'V051 complete — all DB audit fixes applied';
END $$;

COMMIT;
