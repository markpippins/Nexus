-- Migration 050: Allow devops role in agent_records_history
--
-- The DevOps role (devops) was created as an expansion of engineer with
-- sysadmin concerns (system scripts, containers, migrations, systems
-- administration). It must be able to persist records through
-- POST /api/agent-records, so add devops to the allowed role set
-- (same pattern as migration 049 for engineer-ii).
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
            'analyst', 'inspector', 'engineer', 'engineer-ii', 'devops',
            'auditor', 'dba', 'epistemologist', 'operator'
        ]::text[])
    );

COMMIT;
