-- V070__nebula_v_system_inventory.sql
-- Unified inventory view: single-query join across all three operational schemas.
--
--   nebula.systems  ←→  nebula.system_external_ids  ←→  terrain.runnable_services
--                                                     ←→  registry.services
--
-- Terrain-anchored: one row per (nebula.system, terrain.service) pair.
-- Registry data is looked up via the service_identity_map bridge (name match).
-- For registry-only rows (no terrain counterpart), use the companion view
-- nebula.v_system_inventory_registry_only (same columns, terrain cols NULL).
--
-- This is the primary query surface for T01 baseline freeze, schema
-- unification audits, and the eventual Phase 1–3 decommissioning of
-- registry.systems / registry.services.

BEGIN;

-- ── Terrain-anchored inventory (one row per terrain service) ──
CREATE OR REPLACE VIEW nebula.v_system_inventory AS
SELECT
    ns.id                        AS nebula_system_id,
    ns.name                      AS nebula_system,
    ns.path                      AS nebula_path,
    ns.description               AS nebula_description,

    eid_terrain.match_method     AS terrain_match_method,
    eid_terrain.match_confidence AS terrain_match_confidence,
    eid_terrain.role_in_system   AS role_in_system,

    trs.id                       AS terrain_service_id,
    trs.name                     AS terrain_service,
    trs.port                     AS terrain_port,
    trs.workspace_path           AS workspace_path,
    trs.health_check_url         AS health_check_url,
    trs.status                   AS terrain_status,
    trs.startup_script           AS startup_script,
    trs.build_command            AS build_command,
    trs.is_internal              AS is_internal,

    rs.id                        AS registry_service_id,
    rs.name                      AS registry_service,
    rs.default_port              AS registry_port,
    rs.status                    AS registry_status,
    rs.description               AS registry_description,
    rs.version                   AS registry_version,
    rs.repository_url            AS repository_url,
    rs.api_base_path             AS api_base_path

FROM nebula.systems ns
JOIN nebula.system_external_ids eid_terrain
    ON eid_terrain.system_id = ns.id
   AND eid_terrain.source_schema = 'terrain'
   AND eid_terrain.source_table = 'runnable_services'

JOIN terrain.runnable_services trs
    ON trs.id::text = eid_terrain.source_id

-- Registry via service_identity_map: if terrain service has a registry twin, pull it in
LEFT JOIN registry.service_identity_map sim
    ON sim.terrain_service_id = trs.id

LEFT JOIN registry.services rs
    ON rs.id = sim.registry_service_id;

COMMENT ON VIEW nebula.v_system_inventory IS
'Unified inventory terrain-anchored: one row per (nebula.system, terrain.service).
 Registry data via service_identity_map (name-matched). 68 rows total.
 Pair with v_system_inventory_registry_only for registry services lacking terrain.';


-- ── Registry-only inventory (no terrain counterpart) ──
CREATE OR REPLACE VIEW nebula.v_system_inventory_registry_only AS
SELECT
    ns.id                        AS nebula_system_id,
    ns.name                      AS nebula_system,
    ns.path                      AS nebula_path,
    ns.description               AS nebula_description,

    eid_registry.match_method     AS terrain_match_method,
    eid_registry.match_confidence AS terrain_match_confidence,
    eid_registry.role_in_system   AS role_in_system,

    NULL::bigint                  AS terrain_service_id,
    NULL::text                    AS terrain_service,
    NULL::integer                 AS terrain_port,
    NULL::text                    AS workspace_path,
    NULL::text                    AS health_check_url,
    NULL::text                    AS terrain_status,
    NULL::text                    AS startup_script,
    NULL::text                    AS build_command,
    NULL::boolean                 AS is_internal,

    rs.id                         AS registry_service_id,
    rs.name                       AS registry_service,
    rs.default_port               AS registry_port,
    rs.status                     AS registry_status,
    rs.description                AS registry_description,
    rs.version                    AS registry_version,
    rs.repository_url             AS repository_url,
    rs.api_base_path              AS api_base_path

FROM nebula.systems ns
JOIN nebula.system_external_ids eid_registry
    ON eid_registry.system_id = ns.id
   AND eid_registry.source_schema = 'registry'
   AND eid_registry.source_table = 'services'

JOIN registry.services rs
    ON rs.id::text = eid_registry.source_id

-- Exclude services that already appear in the main view (have a terrain twin)
WHERE rs.id NOT IN (
    SELECT sim.registry_service_id
    FROM registry.service_identity_map sim
);

COMMENT ON VIEW nebula.v_system_inventory_registry_only IS
'Registry-only inventory: services that exist in registry but have no terrain counterpart.
 Same columns as v_system_inventory, terrain columns always NULL.
 UNION ALL with v_system_inventory for a complete picture.';

COMMIT;
