-- ═══════════════════════════════════════════════════════════════════════
--  Migration 042 — Observability pg_notify Triggers
--
--  Adds pg_notify triggers for PEB governance events and Vision lifecycle
--  events so the observability subscriber can bridge them to NATS.
--
--  1. PEB: notify_governance_event() — fires on peb.governance_events
--     Channel: peb_governance_event_created
--
--  2. Vision: lifecycle_events_insert_trigger() — REPLACE to add pg_notify
--     Channel: vision_lifecycle_event_created
--
--  Depends on: 001_create_vision_schema.sql (LOSM store), peb.governance_events
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. PEB — notify_governance_event()
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION peb.notify_governance_event()
RETURNS TRIGGER AS $TRIG$
BEGIN
    PERFORM pg_notify('peb_governance_event_created', (
        jsonb_build_object(
            'event_id',       NEW.id,
            'event_type',     NEW.event_type,
            'work_request_id', NEW.work_request_id,
            'plan_id',        NEW.plan_id,
            'agent_role',     NEW.agent_role,
            'timestamp',      NEW.created_at,
            'aggregate_type', 'governance',
            'aggregate_id',   NEW.receipt_id
        ) || NEW.payload
    )::text);

    RETURN NEW;
END;
$TRIG$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_governance_event ON peb.governance_events;
CREATE TRIGGER trg_notify_governance_event
    AFTER INSERT ON peb.governance_events
    FOR EACH ROW
    EXECUTE FUNCTION peb.notify_governance_event();

COMMENT ON FUNCTION peb.notify_governance_event() IS
    'Bridges peb.governance_events onto the peb_governance_event_created
     NOTIFY channel so obs_subscriber publishes them to NATS.';

-- ═══════════════════════════════════════════════════════════════════════
--  2. Vision — lifecycle_events_insert_trigger() with pg_notify
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION vision.lifecycle_events_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.lifecycle_events_id_seq'));

    INSERT INTO vision.lifecycle_events_history
        (id, event_id, wr_id, from_state, to_state, actor, reason, metadata, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.event_id, NEW.wr_id, NEW.from_state, NEW.to_state,
         NEW.actor, NEW.reason, NEW.metadata, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    -- Bridge onto NOTIFY channel for observability subscriber
    PERFORM pg_notify('vision_lifecycle_event_created', (
        jsonb_build_object(
            'event_id',       NEW.event_id,
            'wr_id',          NEW.wr_id,
            'from_state',     NEW.from_state,
            'to_state',       NEW.to_state,
            'actor',          NEW.actor,
            'reason',         NEW.reason,
            'timestamp',      COALESCE(NEW.created_at, NOW()),
            'aggregate_type', 'lifecycle',
            'aggregate_id',   NEW.wr_id
        )
    )::text);

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.routines
  WHERE routine_schema = 'peb'
    AND routine_name = 'notify_governance_event';

  IF v_count != 1 THEN
    RAISE EXCEPTION 'Expected peb.notify_governance_event, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.triggers
  WHERE trigger_schema = 'peb'
    AND trigger_name = 'trg_notify_governance_event';

  IF v_count != 1 THEN
    RAISE EXCEPTION 'Expected trg_notify_governance_event trigger, found %', v_count;
  END IF;

  RAISE NOTICE 'Migration 042 complete — observability pg_notify triggers applied';
  RAISE NOTICE '   peb.notify_governance_event() — channel: peb_governance_event_created';
  RAISE NOTICE '   vision.lifecycle_events_insert_trigger() — channel: vision_lifecycle_event_created';
END $$;

COMMIT;
