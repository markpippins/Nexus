-- Migration 053: Allow tester role in agent_records_history
--
-- Role-creation walkthrough (b80f0fdb): tester is the full-surface
-- demonstration role; it must persist records through POST /api/agent-records.
-- Same pattern as migrations 049/050/051/052. Idempotent (drop + recreate).

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
            'auditor', 'dba', 'epistemologist', 'operator',
            'sysadmin', 'DBA',
            'tester'
        ]::text[])
    );

COMMIT;
