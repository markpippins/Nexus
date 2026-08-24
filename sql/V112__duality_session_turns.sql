-- V112: Duality turn/job state envelope (P0-1 item 3)
--
-- Server-side turn state so the UI stops inferring turn lifecycle from
-- comment count. One row per turn, keyed by turn_id; states transition
-- accepted → running → completed | failed | timed_out | cancelled.
--
-- Rows are NEVER deleted (bitemporal doctrine): each turn is a durable
-- envelope carrying its role, execution backend, subscriber/job id,
-- execution-plan version (the resolved model), and failure detail. The
-- *_at timestamp columns preserve the transition timeline in-place.

CREATE TABLE duality.session_turns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- turn_id
  thread_id             UUID NOT NULL,      -- Assembly thread the turn belongs to
  watch_id              UUID,               -- session_watches row that dispatched it
  role                  TEXT NOT NULL,      -- agent role that should respond
  execution_backend     TEXT NOT NULL DEFAULT 'operator'
                        CHECK (execution_backend IN ('operator', 'harness', 'freebuff')),
  state                 TEXT NOT NULL DEFAULT 'accepted'
                        CHECK (state IN ('accepted', 'running', 'completed',
                                         'failed', 'timed_out', 'cancelled')),
  request_comment_id    UUID,               -- the comment that triggered the turn
  response_comment_id   UUID,               -- the agent's reply comment (completed)
  subscriber_id         TEXT,               -- e.g. 'cascade-interactive-turn'
  job_id                TEXT,               -- harness job id (harness backend)
  execution_plan_version TEXT,              -- resolved model / config-bundle version
  failure_detail        TEXT,               -- stderr/reason when failed/timed_out

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  running_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  failed_at     TIMESTAMPTZ,
  timed_out_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ
);

CREATE INDEX idx_session_turns_thread
  ON duality.session_turns (thread_id, created_at DESC);
CREATE INDEX idx_session_turns_state
  ON duality.session_turns (state);
CREATE INDEX idx_session_turns_watch
  ON duality.session_turns (watch_id);
