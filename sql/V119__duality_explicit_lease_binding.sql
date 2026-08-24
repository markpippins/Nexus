-- V119: Explicit Duality lease binding
--
-- Freebuff interactive turns are admitted only from a watch bound to the
-- exact ACTIVE interactive role lease selected by the UI. Persist the same
-- binding on each turn so NATS/SSE consumers and later PEB settlement can
-- trace the request to one authority envelope.

ALTER TABLE duality.session_turns
  ADD COLUMN IF NOT EXISTS lease_id UUID;

CREATE INDEX IF NOT EXISTS idx_session_turns_lease
  ON duality.session_turns (lease_id);
