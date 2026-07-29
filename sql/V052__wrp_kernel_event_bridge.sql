-- ── V052: WRP Kernel Event Bridge ───────────────────────────────────
--
-- Registers WorkRequest Pipeline (WRP) kernel event types in
-- wind.event_types and creates a PG trigger that bridges
-- conduit.work_request_events → wind.events.
--
-- This ensures every WRP state transition is visible to the Wind
-- event-driven workflow system, regardless of which code path
-- produced it (same-transaction, no silent data loss).

-- ── 1. Register WRP event types ─────────────────────────────────────

-- These event types are registered without workflow bindings.
-- Workflows can be bound later when we define upstream pipelines
-- that react to WRP events.

INSERT INTO wind.event_types (event_type, description, enabled)
VALUES
  ('wr.submitted', 'WorkRequest submitted (DRAFT → VALIDATED)', true),
  ('wr.validated', 'WorkRequest validated (VALIDATED → QUEUED)', true),
  ('wr.queued',    'WorkRequest queued (QUEUED → CLAIMED)', true),
  ('wr.claimed',   'WorkRequest claimed by worker', true),
  ('wr.acked',     'WorkRequest acknowledged (CLAIMED → ACKED)', true),
  ('wr.settled',   'WorkRequest settled successfully', true),
  ('wr.rejected',  'WorkRequest rejected', true),
  ('wr.failed',    'WorkRequest failed', true),
  ('wr.noop',      'WorkRequest no-op (ACKED → NOOP)', true),
  ('wr.deferred',  'WorkRequest deferred (QUEUED → DEFERRED)', true)
ON CONFLICT (event_type) DO NOTHING;

-- ── 2. PG trigger: conduit.work_request_events → wind.events ────────

-- This trigger fires on INSERT into conduit.work_request_events and
-- creates a corresponding row in wind.events, ensuring the Wind event
-- system sees every WRP state transition.

CREATE OR REPLACE FUNCTION wind.wrp_event_bridge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wind.events (event_type, subject, payload, source)
  VALUES (
    NEW.type,
    'nexus.wind.v1.events.' || NEW.type,
    jsonb_build_object(
      'wr_id', NEW.wr_id,
      'event_type', NEW.type,
      'worker_id', NEW.worker_id,
      'created_at', NEW.created_at
    ),
    'conduit/wrp-bridge'
  );
  RETURN NEW;
END;
$$;

-- Drop trigger first for idempotency
DROP TRIGGER IF EXISTS trg_wrp_event_bridge ON conduit.work_request_events;

CREATE TRIGGER trg_wrp_event_bridge
  AFTER INSERT ON conduit.work_request_events
  FOR EACH ROW
  EXECUTE FUNCTION wind.wrp_event_bridge();
