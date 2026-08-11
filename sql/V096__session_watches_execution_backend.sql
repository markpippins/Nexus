-- V096: Add execution_backend to duality.session_watches
--
-- The subscriber dispatches agent invocation based on this column:
--   'operator' → operator service POST /chat (FreeBuff persistent session)
--   'harness'  → harness-srv POST /run-direct (OpenCode ephemeral execution)
--   'freebuff' → emit conversation.turn.requested (direct interactive, context already owned)
--
-- Defaults to 'operator' for backward compatibility with existing watches.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'duality'
      AND table_name = 'session_watches'
      AND column_name = 'execution_backend'
  ) THEN
    ALTER TABLE duality.session_watches
      ADD COLUMN execution_backend TEXT NOT NULL DEFAULT 'operator'
      CHECK (execution_backend IN ('operator', 'harness', 'freebuff'));
  END IF;
END;
$$;
