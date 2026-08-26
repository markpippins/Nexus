-- V130: duality.session_watches.closed_reason — structured close code (#8)
-- ========================================================================
-- f0706646 #8 (Session watch closure — guarded transitions instead of
-- free-text). The post-response coordinator already resolves a STRUCTURED
-- outcome (CLOSED_LEASE_*, CLOSED_TURNS, CLOSED_BY_AGENT, CLOSED_IDLE,
-- CLOSED_NATURAL); until now the only trace of "why" was a free-text reason
-- in the watch.status envelope and the log line.
--
-- This migration persists the reason as a controlled vocabulary on the
-- watch row itself so the closure is queryable and auditable without
-- parsing event payloads:
--
--   active | paused | closed | expired   (status — existing CHECK)
--   + closed_reason ∈ {lease_revoked, lease_exhausted, lease_expired,
--                      turns, agent, idle, natural}
--
-- The row is never rewritten after closure (unchanged semantics: the close
-- path sets status + closed_reason once, UPDATE ... WHERE status <> 'closed'
-- AND status <> 'expired' is not needed because the path is single-writer).
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'duality'
      AND table_name = 'session_watches'
      AND column_name = 'closed_reason'
  ) THEN
    ALTER TABLE duality.session_watches
      ADD COLUMN closed_reason TEXT
      CHECK (closed_reason IN ('lease_revoked', 'lease_exhausted',
                               'lease_expired', 'turns', 'agent', 'idle',
                               'natural'));
  END IF;
END;
$$;