-- Migration 047: Allow DBA/auditor/epistemologist/operator roles in agent_records
--
-- W3 closure: the DBA role could not write continuity records through the
-- canonical POST /api/agent-records path because nebula.agent_records_history
-- carried a role CHECK constraint listing only 8 roles. Align the constraint
-- with the canonical role set (tackle.role_memory: analyst, architect, auditor,
-- builder, critic, dba, engineer, epistemologist, inspector, operator, planner,
-- reviewer) so every legitimate role can persist records.
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
            'analyst', 'inspector', 'engineer',
            'auditor', 'dba', 'epistemologist', 'operator'
        ]::text[])
    );

COMMIT;
