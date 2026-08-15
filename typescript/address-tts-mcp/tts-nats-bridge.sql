-- ═══════════════════════════════════════════════════════════════════════
--  Migration — Address TTS NATS Bridge  (RETIRED — D-T19-1)
--
--  This file previously bridged conduit.work_request_events onto the
--  'kernel_transition_committed' NOTIFY channel via
--  conduit.notify_work_request_event() so kernel_subscriber published them
--  to NATS.
--
--  RETIRED by D-T19-1 (Architect decision): kernel.transition_event →
--  kernel.trg_notify_transition → NATS nexus.kernel.v1.transition.* is the
--  single canonical envelope source for WorkRequest events. The legacy path
--  here notified the SAME channel WITHOUT correlation_id / causation_id, so
--  kernel_subscriber self-correlated a redundant ghost envelope (WR_*)
--  beside the correct work_request.* envelope.
--
--  This file is kept as a historical artifact and now performs a DROP-only
--  teardown so re-running it cannot resurrect the retired bridge. The
--  canonical teardown lives in nexus/sql/V097__retire_legacy_conduit_notify.sql.
--
--  Owned by:   address-tts subsystem (not conduit) — now superseded by kernel.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_notify_wr_event ON conduit.work_request_events;

DROP FUNCTION IF EXISTS conduit.notify_work_request_event();

COMMIT;
