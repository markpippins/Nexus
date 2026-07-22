-- ═══════════════════════════════════════════════════════════════════════
--  Migration 033 — Conduit Schema Fixes
--
--  1. Fix enforce_state_transition() — the old trigger used NULL-safe
--     comparison that silently passed for events without new_state key.
--     Now rejects ANY non-COMMITTED event carrying payload.new_state.
--
--  2. Add check_projection_drift() — non-destructive drift detection
--     that computes expected state from event replay and compares with
--     live work_request_state projection.
--
--  Depends on: 016-event-sourcing-foundation.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. FIX enforce_state_transition()
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

DROP TRIGGER IF EXISTS trg_enforce_state_transition ON conduit.work_request_events;
CREATE TRIGGER trg_enforce_state_transition
BEFORE INSERT ON conduit.work_request_events
FOR EACH ROW
EXECUTE FUNCTION conduit.enforce_state_transition();

-- ═══════════════════════════════════════════════════════════════════════
--  2. ADD check_projection_drift()
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
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.routines
  WHERE routine_schema = 'conduit'
    AND routine_name IN ('enforce_state_transition', 'check_projection_drift');

  IF v_count != 2 THEN
    RAISE EXCEPTION 'Expected 2 functions, found %', v_count;
  END IF;

  RAISE NOTICE 'Migration 033 complete — conduit schema fixes applied';
  RAISE NOTICE '   enforce_state_transition() — fixed NULL logic bug';
  RAISE NOTICE '   check_projection_drift() — non-destructive drift detection';
END $$;

COMMIT;
