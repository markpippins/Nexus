-- ═══════════════════════════════════════════════════════════════════════
--  Migration — Address TTS NATS Bridge
--
--  Bridges conduit.work_request_events onto the kernel_transition_committed
--  NOTIFY channel so kernel_subscriber publishes them to NATS.
--  The Address TTS service (and any other NATS subscriber) consumes from NATS.
--
--  Depends on: conduit.work_request_events table (migration 016)
--  Owned by:   address-tts subsystem (not conduit)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Bridge: notify kernel_subscriber on new work request events.
-- Merges core envelope keys with the full event payload so kernel_subscriber
-- can publish a CanonicalEnvelope to NATS, and downstream subscribers (TTS,
-- monitoring, etc.) can extract event data directly.
CREATE OR REPLACE FUNCTION conduit.notify_work_request_event()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('kernel_transition_committed', (
        jsonb_build_object(
            'event_id', NEW.event_id,
            'event_type', NEW.event_type,
            'timestamp', NEW.occurred_at,
            'aggregate_type', 'work_request',
            'aggregate_id', NEW.work_request_id,
            'actor', NEW.actor_id,
            'work_request_id', NEW.work_request_id
        ) || NEW.payload
    )::text);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_wr_event ON conduit.work_request_events;
CREATE TRIGGER trg_notify_wr_event
    AFTER INSERT ON conduit.work_request_events
    FOR EACH ROW EXECUTE FUNCTION conduit.notify_work_request_event();

COMMENT ON FUNCTION conduit.notify_work_request_event() IS
    'Bridges conduit.work_request_events onto the kernel_transition_committed
     NOTIFY channel so kernel_subscriber publishes them to NATS.
     Owned by address-tts, not conduit.';

COMMIT;
