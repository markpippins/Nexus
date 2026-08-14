-- V103: D-T19-3 — kernel.event_type gains 'receipt.failed'
--
-- Ruling 275f7490 (Architect, binding under I2): receipt failure must land in
-- the DB as its own event_type (`receipt.failed`, matching the `<domain>.<verb>`
-- convention alongside `receipt.issued` / `work_request.failed`) instead of
-- riding `transition.rejected`. This eliminates the collision with ticket-expiry
-- `transition.rejected` so consumers disambiguate on event_type alone — no
-- payload sniffing.
--
-- This value is consumed by the conduit receipt-failure emission path
-- (db_adapter._emit_receipt_failure) and flows through trg_notify_transition
-- onto the canonical NATS channel nexus.kernel.v1.transition.receipt.failed
-- (matching nats_publisher.FAILURE_EVENTS["receipt"]).
--
-- PG 17 note: ALTER TYPE ... ADD VALUE is permitted inside a transaction but the
-- new value is unusable until commit — V103 must commit before the subscriber
-- rollout (restart cascade-kernel-subscriber + cascade-admission-subscriber).

BEGIN;

ALTER TYPE kernel.event_type ADD VALUE IF NOT EXISTS 'receipt.failed';

COMMIT;
