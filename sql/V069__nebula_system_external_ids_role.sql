-- V069__nebula_system_external_ids_role.sql
-- Adds role_in_system column to nebula.system_external_ids_history
-- so it can fully replace registry.system_services.
--
-- registry.system_services columns:
--   system_id (bigint)  →  nebula.system_external_ids.system_id
--   service_id (bigint) →  nebula.system_external_ids.source_id (source_schema='registry', source_table='services')
--   role_in_system       →  NEW: nebula.system_external_ids.role_in_system
--   active_flag / created_at  → covered by bitemporal valid_from/valid_until

BEGIN;

ALTER TABLE nebula.system_external_ids_history
    ADD COLUMN IF NOT EXISTS role_in_system text;

COMMENT ON COLUMN nebula.system_external_ids_history.role_in_system IS
'Role of the external entity within the nebula.system (e.g., orchestrator, store, messaging, api).
 Replaces registry.system_services.role_in_system.';

-- Recreate view to include the new column
DROP VIEW IF EXISTS nebula.system_external_ids;

CREATE VIEW nebula.system_external_ids AS
SELECT
    id, system_id, source_schema, source_table, source_id,
    match_confidence, match_method,
    role_in_system,
    notes,
    recorded_on_dt, recorded_until_dt,
    valid_from, valid_until
FROM nebula.system_external_ids_history
WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

COMMIT;
