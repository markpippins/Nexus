-- Migration 052: Allow sysadmin + DBA roles in agent_records_history
--
-- Role-surface parity (b80f0fdb): sysadmin is a canonical agent role
-- (tackle.roles, harness agent file, assembly alias) and DBA is the
-- canonical (capitalized) role name in tackle.roles — the CHECK previously
-- only allowed the lowercase 'dba' variant, so records authored as role
-- 'DBA' were rejected. Same pattern as migrations 049/050/051.
--
-- NOTE: exact-case 'DBA' addition is the pending architect ratification
-- item for the canonical role allowlist (dba vs DBA case mismatch).
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
            'auditor', 'dba', 'epistemologist', 'operator',
            'sysadmin', 'DBA'
        ]::text[])
    );

COMMIT;
