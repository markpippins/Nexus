-- V097: Retire the legacy conduit notify path (D-T19-1)
--
-- D-T19-1 makes kernel.transition_event → kernel.trg_notify_transition → NATS
-- nexus.kernel.v1.transition.* the SINGLE canonical envelope source for
-- WorkRequest events. The legacy conduit.notify_work_request_event() path
-- (trigger trg_notify_wr_event on conduit.work_request_events) notified the
-- same 'kernel_transition_committed' channel WITHOUT correlation_id /
-- causation_id, so kernel_subscriber self-correlated a redundant ghost
-- envelope (WR_*) beside the correct work_request.* envelope.
--
-- This migration drops that trigger and function. The same WR event is still
-- delivered exactly once, correctly, by the kernel path. No information loss.

BEGIN;

DROP TRIGGER IF EXISTS trg_notify_wr_event ON conduit.work_request_events;

DROP FUNCTION IF EXISTS conduit.notify_work_request_event();

COMMIT;
