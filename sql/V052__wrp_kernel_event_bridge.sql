-- ── V052: WRP Kernel Event Bridge ─────────────────────────────────
-- Registers WRP runtime events as wind.event_types and creates a PG
-- trigger that bridges conduit.work_request_events → wind.events.
--
-- This gives the Wind event-driven workflow engine real-time visibility
-- into WorkRequest lifecycle transitions.
--
-- Flow:
--   conduit-mcp.appendEvent() → INSERT INTO conduit.work_request_events
--     → trg_bridge_to_wind_events (trigger)
--       → INSERT INTO wind.events
--         → Wind event processor picks up → starts workflows
--
-- The trigger runs in the same transaction, so if wind.events insert
-- fails, the conduit event is rolled back too (no silent data loss).

-- ── 1. Register WRP kernel event types in wind.event_types ────────

INSERT INTO wind.event_types (event_type, description, workflow_id, dedup_key_template, enabled)
VALUES
  ('wr.submitted',  'WorkRequest submitted (DRAFT → VALIDATED)',  NULL, '$.wr_id', true),
  ('wr.validated',  'WorkRequest validated (VALIDATED → QUEUED)',  NULL, '$.wr_id', true),
  ('wr.queued',     'WorkRequest queued (QUEUED → CLAIMED)',      NULL, '$.wr_id', true),
  ('wr.claimed',    'WorkRequest claimed by worker',               NULL, '$.wr_id', true),
  ('wr.acked',      'WorkRequest acknowledged (CLAIMED → ACKED)', NULL, '$.wr_id', true),
  ('wr.settled',    'WorkRequest settled successfully',            NULL, '$.wr_id', true),
  ('wr.rejected',   'WorkRequest rejected',                        NULL, '$.wr_id', true),
  ('wr.failed',     'WorkRequest failed',                          NULL, '$.wr_id', true),
  ('wr.noop',       'WorkRequest no-op (ACKED → NOOP)',           NULL, '$.wr_id', true),
  ('wr.deferred',   'WorkRequest deferred (QUEUED → DEFERRED)',   NULL, '$.wr_id', true)
ON CONFLICT (event_type) DO NOTHING;

-- ── 2. Create cross-schema trigger function ───────────────────────
-- Bridges conduit.work_request_events → wind.events
-- Runs in the same transaction as the original insert.

CREATE OR REPLACE FUNCTION wind.trg_bridge_conduit_events()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_wr_id TEXT;
  v_wr_title TEXT;
  v_wind_event_type TEXT;
BEGIN
  -- Only bridge recognized WRP runtime events
  IF NEW.event_type NOT IN (
    'WR_SUBMITTED', 'WR_VALIDATED', 'WR_QUEUED',
    'WR_CLAIMED', 'WR_ACKED', 'WR_SETTLED',
    'WR_REJECTED', 'WR_FAILED', 'WR_NOOP', 'WR_DEFERRED'
  ) THEN
    RETURN NEW;
  END IF;

  -- Convert WR_UPPERCASE to wr.lowercase (strip WR_ prefix)
  v_wind_event_type := 'wr.' || lower(replace(NEW.event_type, 'WR_', ''));

  -- Get the work request identifier and title from vision schema
  -- (work_request_id in conduit.work_request_events stores the UUID
  --  that maps to vision.work_requests.work_request_uuid)
  SELECT wr.wr_id, wr.title INTO v_wr_id, v_wr_title
  FROM vision.work_requests wr
  WHERE wr.work_request_uuid = NEW.work_request_id::text;

  -- Insert into wind.events
  INSERT INTO wind.events (event_type, subject, payload, source, metadata)
  VALUES (
    v_wind_event_type,
    COALESCE(v_wr_id, NEW.work_request_id::text),
    jsonb_build_object(
      'wr_id', COALESCE(v_wr_id, NEW.work_request_id::text),
      'title', v_wr_title,
      'event_type', NEW.event_type,
      'event_id', NEW.event_id,
      'actor_type', NEW.actor_type,
      'actor_id', NEW.actor_id
    ) || COALESCE(NEW.payload, '{}'::jsonb),
    'conduit-runtime',
    jsonb_build_object(
      'conduit_event_type', NEW.event_type,
      'conduit_event_id', NEW.event_id,
      'conduit_work_request_id', NEW.work_request_id
    )
  );

  RETURN NEW;
END;
$$;

-- ── 3. Install the trigger on conduit.work_request_events ────────

DROP TRIGGER IF EXISTS trg_bridge_to_wind_events ON conduit.work_request_events;

CREATE TRIGGER trg_bridge_to_wind_events
  AFTER INSERT ON conduit.work_request_events
  FOR EACH ROW
  EXECUTE FUNCTION wind.trg_bridge_conduit_events();

-- ── 4. Verify the trigger is registered ──────────────────────────

DO $$
DECLARE
  trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'conduit'
      AND trigger_name = 'trg_bridge_to_wind_events'
      AND event_object_table = 'work_request_events'
  ) INTO trigger_exists;

  IF NOT trigger_exists THEN
    RAISE WARNING 'Trigger trg_bridge_to_wind_events was not registered on conduit.work_request_events';
  END IF;
END;
$$;
