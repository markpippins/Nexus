-- ═══════════════════════════════════════════════════════════════════════
--  Migration 016 — Event-Sourcing Foundation
--
--  Immutable event ledger, current-state projection, Vision IR artifact
--  store, state transition enforcement, and full replay capability.
--
--  Tables:
--    conduit.work_request_events   — append-only event ledger
--    conduit.work_request_state    — materialized projection
--    conduit.vision_ir_artifacts   — Vision IR artifact store
--
--  Depends on: conduit schema (plans, receipts, etc.)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. ENUMS
-- ═══════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE conduit.ledger_event_type AS ENUM (
    'WORKREQUEST.CREATED',
    'VISION.IR_PRODUCED',
    'STATE.TRANSITION_PROPOSED',
    'STATE.TRANSITION_APPROVED',
    'STATE.TRANSITION_COMMITTED',
    'EXECUTION.STARTED',
    'EXECUTION.COMPLETED',
    'EXECUTION.FAILED',
    'SYSTEM.CRON_TRIGGERED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE conduit.work_request_state_enum AS ENUM (
    'PROPOSED',
    'PLANNING',
    'PENDING',
    'IMPLEMENTING',
    'REVIEW',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE conduit.vision_ir_stage_enum AS ENUM (
    'PLAN_IR',
    'SPEC_IR',
    'EXECUTION_IR',
    'VALIDATION_IR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  2. EVENT LEDGER — work_request_events
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.work_request_events (
    event_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    work_request_id UUID        NOT NULL,
    event_type      TEXT        NOT NULL,
    event_version   INTEGER     NOT NULL DEFAULT 1,
    correlation_id  UUID,
    causation_id    UUID,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    actor_type      TEXT        NOT NULL DEFAULT 'system',
    actor_id        TEXT        NOT NULL DEFAULT '',
    sequence_number BIGSERIAL   NOT NULL,

    CONSTRAINT chk_event_type CHECK (event_type IN (
        'WORKREQUEST.CREATED',
        'VISION.IR_PRODUCED',
        'STATE.TRANSITION_PROPOSED',
        'STATE.TRANSITION_APPROVED',
        'STATE.TRANSITION_COMMITTED',
        'EXECUTION.STARTED',
        'EXECUTION.COMPLETED',
        'EXECUTION.FAILED',
        'SYSTEM.CRON_TRIGGERED'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wre_wr_seq
    ON conduit.work_request_events (work_request_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_wre_wr_occurred
    ON conduit.work_request_events (work_request_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_wre_event_type
    ON conduit.work_request_events (event_type);

CREATE INDEX IF NOT EXISTS idx_wre_correlation
    ON conduit.work_request_events (correlation_id);

CREATE INDEX IF NOT EXISTS idx_wre_payload_gin
    ON conduit.work_request_events USING GIN (payload);

COMMENT ON TABLE conduit.work_request_events IS
    'Immutable event ledger for WorkRequest lifecycle. Append-only.
     Every state change is recorded as an event with causal linkage.';

-- ═══════════════════════════════════════════════════════════════════════
--  3. STATE PROJECTION — work_request_state
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.work_request_state (
    work_request_id  UUID        PRIMARY KEY,
    current_state    TEXT        NOT NULL DEFAULT 'PROPOSED',
    vision_stage     TEXT,
    vision_ir_version INTEGER    NOT NULL DEFAULT 0,
    last_event_id    UUID,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_current_state CHECK (current_state IN (
        'PROPOSED', 'PLANNING', 'PENDING', 'IMPLEMENTING',
        'REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED'
    )),
    CONSTRAINT chk_vision_stage CHECK (vision_stage IS NULL OR vision_stage IN (
        'PLAN_IR', 'SPEC_IR', 'EXECUTION_IR', 'VALIDATION_IR'
    ))
);

CREATE INDEX IF NOT EXISTS idx_wrs_current_state
    ON conduit.work_request_state (current_state);

COMMENT ON TABLE conduit.work_request_state IS
    'Materialized projection of work_request_events. Maintained by
     trigger — only STATE.TRANSITION_COMMITTED events mutate current_state.';

-- ═══════════════════════════════════════════════════════════════════════
--  4. VISION IR ARTIFACTS — vision_ir_artifacts
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conduit.vision_ir_artifacts (
    artifact_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    work_request_id  UUID        NOT NULL,
    event_id         UUID        NOT NULL,
    ir_stage         TEXT        NOT NULL,
    ir_version       INTEGER     NOT NULL DEFAULT 1,
    artifact_type    TEXT        NOT NULL,
    content          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ir_stage CHECK (ir_stage IN (
        'PLAN_IR', 'SPEC_IR', 'EXECUTION_IR', 'VALIDATION_IR'
    ))
);

CREATE INDEX IF NOT EXISTS idx_vira_wr_stage_ver
    ON conduit.vision_ir_artifacts (work_request_id, ir_stage, ir_version);

CREATE INDEX IF NOT EXISTS idx_vira_ir_stage
    ON conduit.vision_ir_artifacts (ir_stage);

CREATE INDEX IF NOT EXISTS idx_vira_content_gin
    ON conduit.vision_ir_artifacts USING GIN (content);

COMMENT ON TABLE conduit.vision_ir_artifacts IS
    'Vision IR artifact store. Each artifact is linked to a WorkRequest
     event and tagged with its IR stage and version.';

-- ═══════════════════════════════════════════════════════════════════════
--  5. TRANSITION MATRIX — allowed state transitions
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conduit.allowed_transitions(from_state TEXT)
RETURNS TEXT[] AS $$
BEGIN
  RETURN CASE from_state
    WHEN 'PROPOSED'      THEN ARRAY['PLANNING', 'CANCELLED']
    WHEN 'PLANNING'      THEN ARRAY['PENDING', 'CANCELLED']
    WHEN 'PENDING'       THEN ARRAY['IMPLEMENTING', 'CANCELLED']
    WHEN 'IMPLEMENTING'  THEN ARRAY['REVIEW', 'FAILED', 'CANCELLED']
    WHEN 'REVIEW'        THEN ARRAY['COMPLETED', 'IMPLEMENTING', 'FAILED', 'CANCELLED']
    WHEN 'COMPLETED'     THEN ARRAY[]::TEXT[]
    WHEN 'FAILED'        THEN ARRAY[]::TEXT[]
    WHEN 'CANCELLED'     THEN ARRAY[]::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════
--  6. STATE PROJECTION UPDATER — trigger function
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

DROP TRIGGER IF EXISTS trg_update_wr_state ON conduit.work_request_events;
CREATE TRIGGER trg_update_wr_state
    AFTER INSERT ON conduit.work_request_events
    FOR EACH ROW EXECUTE FUNCTION conduit.update_work_request_state();

-- ═══════════════════════════════════════════════════════════════════════
--  7. REPLAY QUERIES
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conduit.replay_events(
  p_work_request_id UUID
)
RETURNS SETOF conduit.work_request_events AS $$
  SELECT *
  FROM conduit.work_request_events
  WHERE work_request_id = p_work_request_id
  ORDER BY sequence_number;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION conduit.replay_from_checkpoint(
  p_work_request_id UUID,
  p_checkpoint BIGINT
)
RETURNS SETOF conduit.work_request_events AS $$
  SELECT *
  FROM conduit.work_request_events
  WHERE work_request_id = p_work_request_id
    AND sequence_number > p_checkpoint
  ORDER BY sequence_number;
$$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════════════════
--  8. STATE REBUILD — replay all events for a work_request_id
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conduit.rebuild_state(
  p_work_request_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_event RECORD;
  v_current_state TEXT := 'PROPOSED';
  v_vision_stage TEXT := NULL;
  v_vision_ir_version INTEGER := 0;
  v_last_event_id UUID := NULL;
  v_new_state TEXT;
  v_allowed TEXT[];
BEGIN
  FOR v_event IN
    SELECT * FROM conduit.work_request_events
    WHERE work_request_id = p_work_request_id
    ORDER BY sequence_number
  LOOP
    v_last_event_id := v_event.event_id;

    IF v_event.event_type = 'WORKREQUEST.CREATED' THEN
      v_current_state := 'PROPOSED';

    ELSIF v_event.event_type = 'STATE.TRANSITION_COMMITTED' THEN
      v_new_state := v_event.payload->>'new_state';
      IF v_new_state IS NOT NULL THEN
        v_allowed := conduit.allowed_transitions(v_current_state);
        IF v_new_state = ANY(v_allowed) THEN
          v_current_state := v_new_state;
        END IF;
      END IF;

    ELSIF v_event.event_type = 'VISION.IR_PRODUCED' THEN
      IF v_event.payload ? 'ir_stage' THEN
        v_vision_stage := v_event.payload->>'ir_stage';
      END IF;
      IF v_event.payload ? 'ir_version' THEN
        v_vision_ir_version := (v_event.payload->>'ir_version')::INTEGER;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO conduit.work_request_state (
    work_request_id, current_state, vision_stage,
    vision_ir_version, last_event_id, updated_at
  ) VALUES (
    p_work_request_id, v_current_state, v_vision_stage,
    v_vision_ir_version, v_last_event_id, NOW()
  )
  ON CONFLICT (work_request_id) DO UPDATE SET
    current_state = EXCLUDED.current_state,
    vision_stage = EXCLUDED.vision_stage,
    vision_ir_version = EXCLUDED.vision_ir_version,
    last_event_id = EXCLUDED.last_event_id,
    updated_at = NOW();

  RETURN v_current_state;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  9. BATCH REBUILD — truncate + replay all
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conduit.rebuild_all_projections()
RETURNS INTEGER AS $$
DECLARE
  v_wr_id UUID;
  v_count INTEGER := 0;
BEGIN
  TRUNCATE conduit.work_request_state;

  FOR v_wr_id IN
    SELECT DISTINCT work_request_id
    FROM conduit.work_request_events
    ORDER BY work_request_id
  LOOP
    PERFORM conduit.rebuild_state(v_wr_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  10. PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA conduit TO pguser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA conduit TO pguser;

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'conduit'
    AND table_name IN ('work_request_events', 'work_request_state', 'vision_ir_artifacts');
  
  IF v_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 event-sourcing tables, found %', v_count;
  END IF;

  RAISE NOTICE 'Migration 016 complete — event-sourcing foundation created';
  RAISE NOTICE '   conduit.work_request_events (event ledger)';
  RAISE NOTICE '   conduit.work_request_state (projection)';
  RAISE NOTICE '   conduit.vision_ir_artifacts (IR store)';
END $$;

COMMIT;
