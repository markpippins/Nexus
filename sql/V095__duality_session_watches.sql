-- V095: Duality interactive session infrastructure
--
-- 1. duality.session_watches — registers which Assembly threads are
--    managed by interactive turn subscribers (one row per role per thread).
-- 2. trg_comment_created — AFTER INSERT on assembly.comments emits
--    'assembly.comment.created' via pg_notify so the cascade
--    kernel_subscriber bridges it to NATS.

-- ── 1. Session watches ─────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS duality;

CREATE TABLE duality.session_watches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL,             -- Assembly thread being watched
  forum_slug      TEXT NOT NULL DEFAULT 'duality-sessions',
  role            TEXT NOT NULL,             -- role that should respond
  lease_id        UUID,                      -- active role_lease for this role
  max_turns       INT NOT NULL DEFAULT 20,
  turn_count      INT NOT NULL DEFAULT 0,
  idle_timeout_ms INT NOT NULL DEFAULT 300000, -- 5 min
  last_activity   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'paused', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One watch row per (thread_id, role) pair
  CONSTRAINT uq_session_watch_thread_role UNIQUE (thread_id, role)
);

CREATE INDEX idx_session_watches_thread ON duality.session_watches (thread_id);
CREATE INDEX idx_session_watches_status  ON duality.session_watches (status);

-- ── 2. Comment-created NOTIFY trigger ───────────────────────────────

CREATE OR REPLACE FUNCTION duality.notify_comment_created()
RETURNS trigger AS $$
DECLARE
  thread_forum_slug TEXT;
BEGIN
  -- Resolve the post's forum so the subscriber can filter by forum
  -- without an extra query. assembly.posts.forum_uuid → assembly.forums.id.
  SELECT f.slug INTO thread_forum_slug
    FROM assembly.posts p
    JOIN assembly.forums f ON f.id = p.forum_uuid
   WHERE p.id = NEW.post_id;

  PERFORM pg_notify('kernel_transition',
    json_build_object(
      'event_type', 'assembly.comment.created',
      'aggregate_id', NEW.id,
      'payload', json_build_object(
        'thread_id',   NEW.post_id,
        'comment_id',  NEW.id,
        'forum_slug',  thread_forum_slug,
        'role',        NEW.role,
        'posted_by_id',NEW.posted_by_id,
        'parent_id',   NEW.parent_id,
        'created_at',  NEW.created
      )
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create the trigger if it doesn't already exist (idempotent for
-- re-runs and fresh-DB bootstraps).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_comment_created'
       AND tgrelid = 'assembly.comments'::regclass
  ) THEN
    CREATE TRIGGER trg_comment_created
      AFTER INSERT ON assembly.comments
      FOR EACH ROW EXECUTE FUNCTION duality.notify_comment_created();
  END IF;
END;
$$;
