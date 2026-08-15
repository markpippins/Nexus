-- Migration 051: Allow topologist role in agent_records_history
--
-- The Topologist role (topologist) was created as the interactive
-- representative of the terrain subsystem — verifying local docs match
-- actual service configuration and validating specs/plans/work requests
-- against live system capabilities. It must be able to persist records
-- through POST /api/agent-records, so add topologist to the allowed role
-- set (same pattern as migrations 049/050 for engineer-ii/devops).
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
            'topologist',
            'auditor', 'dba', 'epistemologist', 'operator'
        ]::text[])
    );

COMMIT;
