-- V071__system_external_ids_multi_role.sql
-- Drops the unique index on (system_id, source_schema, source_table, source_id)
-- so a service can have different roles in different nebula.systems.
--
-- Example: peb-kernel is "orchestrator" in PEB and "executor" in WRP.
-- Under the old unique constraint, only one role per service was allowed.
--
-- Replaces with a non-unique index for lookup performance.

BEGIN;

-- 1. Drop the unique index (created in V068)
DROP INDEX IF EXISTS nebula.uq_system_external_id_active;

-- 2. Non-unique replacement for lookup performance
CREATE INDEX IF NOT EXISTS idx_system_external_id_lookup
    ON nebula.system_external_ids_history (system_id, source_schema, source_table, source_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

-- 3. Backfill peb-kernel as "executor" in WRP
--    registry.system_services id=9 was skipped because peb-kernel already had
--    "orchestrator" in PEB under the old unique constraint.
INSERT INTO nebula.system_external_ids_history
    (system_id, source_schema, source_table, source_id,
     match_confidence, match_method, role_in_system, notes)
SELECT
    ns.id,
    'registry',
    'services',
    ss.service_id::text,
    1.0,
    'manual',
    ss.role_in_system,
    'name: peb-kernel (executor in WRP) — backfilled V071'
FROM registry.system_services ss
CROSS JOIN nebula.systems ns
WHERE ss.id = 9
  AND ns.name = 'Work Request Pipeline (WRP)';

COMMIT;
