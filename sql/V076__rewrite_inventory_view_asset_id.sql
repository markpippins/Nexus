-- ═══════════════════════════════════════════════════════════════════════
--  V076 — A4: rewrite v_system_inventory to join via asset_id
--
--  Decision ref: 5d66278d (architect, 2026-08-08)
--  Depends on: V075 (asset_id columns + backfill)
--
--  Replaces the V070 view that joined via nebula.system_external_ids
--  with a new version that joins through asset_relation + asset_id.
--
--  The terrain-anchored view now:
--    1. Starts from terrain.runnable_services (anchor, unchanged)
--    2. Finds parent systems via asset_relation (service-asset MEMBER_OF
--       system-asset) — replaces the system_external_ids junction join
--    3. Registry bridge stays via service_identity_map (not dropped until V078)
--
--  Columns dropped from the view (were junction-specific):
--    - terrain_match_method, terrain_match_confidence, role_in_system
--    These remain available in system_external_ids_history (append-only)
--    for historical audit.
--
--  The registry-only companion view is similarly rewritten.
--
--  Idempotent: CREATE OR REPLACE VIEW.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Terrain-anchored inventory (one row per terrain service) ──
--    Joins through asset_relation (MEMBER_OF) instead of system_external_ids.
CREATE OR REPLACE VIEW nebula.v_system_inventory AS
SELECT
    ns.id                        AS nebula_system_id,
    ns.name                      AS nebula_system,
    ns.path                      AS nebula_path,
    ns.description               AS nebula_description,

    NULL::text                   AS terrain_match_method,
    NULL::numeric(3,2)           AS terrain_match_confidence,
    NULL::text                   AS role_in_system,

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

FROM terrain.runnable_services trs

-- Find the system that owns this service via asset_relation
-- (system-asset OWNS service-asset → reverse: service-asset MEMBER_OF system-asset)
JOIN semantics.asset_relation ar
    ON ar.to_asset_id = trs.asset_id
   AND ar.relation_type = 'owns'
   AND ar.expired_at IS NULL

JOIN nebula.systems ns
    ON ns.asset_id = ar.from_asset_id

-- Registry via shared asset_id (identity_map replaced by canonical_asset sharing)
-- Safe identity_map pairs now share the same canonical_asset UUID.
LEFT JOIN registry.services rs
    ON rs.asset_id = trs.asset_id;

COMMENT ON VIEW nebula.v_system_inventory IS
'Unified inventory terrain-anchored: one row per (nebula.system, terrain.service).
 Joins through asset_relation (V076 rewrite — replaces system_external_ids).
 Registry data via shared asset_id (identity_map replaced by canonical_asset sharing).
 Terrain services without a system owner (no asset_relation row) are excluded —
 those are the "unmapped" services that need manual system assignment.' ;


-- ── Registry-only inventory (no terrain counterpart) ──
CREATE OR REPLACE VIEW nebula.v_system_inventory_registry_only AS
SELECT
    ns.id                        AS nebula_system_id,
    ns.name                      AS nebula_system,
    ns.path                      AS nebula_path,
    ns.description               AS nebula_description,

    NULL::text                   AS terrain_match_method,
    NULL::numeric(3,2)           AS terrain_match_confidence,
    NULL::text                   AS role_in_system,

    NULL::bigint                 AS terrain_service_id,
    NULL::text                   AS terrain_service,
    NULL::integer                AS terrain_port,
    NULL::text                   AS workspace_path,
    NULL::text                   AS health_check_url,
    NULL::text                   AS terrain_status,
    NULL::text                   AS startup_script,
    NULL::text                   AS build_command,
    NULL::boolean                AS is_internal,

    rs.id                        AS registry_service_id,
    rs.name                      AS registry_service,
    rs.default_port              AS registry_port,
    rs.status                    AS registry_status,
    rs.description               AS registry_description,
    rs.version                   AS registry_version,
    rs.repository_url            AS repository_url,
    rs.api_base_path             AS api_base_path

FROM registry.services rs

-- Find the system that owns this registry service via asset_relation
JOIN semantics.asset_relation ar
    ON ar.to_asset_id = rs.asset_id
   AND ar.relation_type = 'owns'
   AND ar.expired_at IS NULL

JOIN nebula.systems ns
    ON ns.asset_id = ar.from_asset_id

-- Exclude services that share an asset_id with a terrain service
-- (were in a safe identity_map pair — now same canonical_asset)
WHERE rs.asset_id NOT IN (
    SELECT trs.asset_id
    FROM terrain.runnable_services trs
    WHERE trs.asset_id IS NOT NULL
);

COMMENT ON VIEW nebula.v_system_inventory_registry_only IS
'Registry-only inventory: services in registry with no terrain counterpart.
 Joins through asset_relation (V076 rewrite).
 Excludes services sharing an asset_id with a terrain counterpart (appear in v_system_inventory).' ;

COMMIT;
