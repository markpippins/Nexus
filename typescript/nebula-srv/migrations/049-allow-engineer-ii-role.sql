-- Migration 049: Allow engineer-ii role in agent_records_history
--
-- The Engineer II role (engineer-ii) was created in commit d4d9972 as a full
-- mirror of engineer, but the nebula.agent_records_history role CHECK
-- constraint (last aligned in migration 047) did not include engineer-ii —
-- so the role could not persist records through POST /api/agent-records.
-- Add engineer-ii to the allowed role set.
--
-- Idempotent (drop + recreate the CHECK).

BEGIN;

ALTER TABLE nebula.agent_records_history
    DROP CONSTRAINT IF EXISTS agent_records_role_check;

ALTER TABLE nebula.agent_records_history
    ADD CONSTRAINT agent_records_role_check
    CHECK (
        role = ''
        OR role = ANY (ARRAY[
            'architect', 'planner', 'builder', 'reviewer', 'critic',
            'analyst', 'inspector', 'engineer', 'engineer-ii',
            'auditor', 'dba', 'epistemologist', 'operator'
        ]::text[])
    );

COMMIT;
