-- V113: Duality session event log + SSE substrate (P1 items 4-5)
--
-- Durable, append-only per-thread event stream backing the replayable SSE
-- endpoint GET /api/duality/sessions/:threadId/events?after=<seq>.
--
-- Each row is one typed envelope (turn.accepted, turn.started, thinking,
-- comment.created, turn.completed, turn.failed, turn.timed_out,
-- turn.cancelled, watch.status) with a monotonic sequence (BIGSERIAL) and
-- a UNIQUE event_key that serves as the durable deduplication key: writers
-- INSERT ... ON CONFLICT (event_key) DO NOTHING, so replay/duplicate
-- delivery (NATS + PG LISTEN ingresses, subscriber restart) cannot double-
-- emit. Rows are NEVER deleted — the log is the replayable history.
--
-- A trigger NOTIFYs the 'duality_session_events' channel on every insert,
-- so live SSE subscribers in assembly-srv get pushed without polling.

CREATE TABLE duality.session_events (
  seq          BIGSERIAL PRIMARY KEY,        -- monotonic; per-thread via index
  thread_id    UUID NOT NULL,                -- Assembly thread (session) the event belongs to
  turn_id      UUID,                         -- session_turns row when the event is turn-scoped
  watch_id     UUID,                         -- session_watches row when watch-scoped
  event_type   TEXT NOT NULL CHECK (event_type IN (
                 'turn.accepted', 'turn.started', 'thinking',
                 'comment.created', 'turn.completed', 'turn.failed',
                 'turn.timed_out', 'turn.cancelled', 'watch.status')),
  event_key    TEXT NOT NULL UNIQUE,         -- durable dedup key (idempotent writers)
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-thread replay ordering: (thread_id, seq) is the resume cursor.
CREATE INDEX idx_session_events_thread_seq
  ON duality.session_events (thread_id, seq);

-- ── Live push: NOTIFY every insert ─────────────────────────────────
CREATE OR REPLACE FUNCTION duality.session_events_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'duality_session_events',
    json_build_object('thread_id', NEW.thread_id::text, 'seq', NEW.seq)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_events_notify ON duality.session_events;
CREATE TRIGGER trg_session_events_notify
  AFTER INSERT ON duality.session_events
  FOR EACH ROW EXECUTE FUNCTION duality.session_events_notify();
