-- populate_system_external_ids.sql
-- Populates nebula.system_external_ids with keys from all schemas
-- and matches terrain services → nebula.systems via workspace_path patterns.
--
-- Step 1–5: Insert all external IDs from each schema (system_id = NULL initially).
-- Step 6: UPDATE system_id where terrain.workspace_path matches nebula.systems.path.
--
-- Run with: psql ... -f this_file.sql  (auto-commit, no explicit BEGIN)

-- ============================================================
-- Step 1: terrain.runnable_services (68 rows)
-- ============================================================
INSERT INTO nebula.system_external_ids_history
    (system_id, source_schema, source_table, source_id, match_confidence, match_method, notes)
SELECT
    NULL,                                    -- matched in Step 6
    'terrain',
    'runnable_services',
    id::text,
    1.0,
    'direct_insert',
    'name: ' || COALESCE(name, '')
FROM terrain.runnable_services
WHERE active_flag = true;

-- ============================================================
-- Step 2: registry.services (65 rows)
-- ============================================================
INSERT INTO nebula.system_external_ids_history
    (system_id, source_schema, source_table, source_id, match_confidence, match_method, notes)
SELECT
    NULL,
    'registry',
    'services',
    id::text,
    1.0,
    'direct_insert',
    'name: ' || COALESCE(name, '') || ', status: ' || COALESCE(status, '')
FROM registry.services
WHERE active_flag = true;

-- ============================================================
-- Step 3: registry.systems (7 rows)
-- ============================================================
INSERT INTO nebula.system_external_ids_history
    (system_id, source_schema, source_table, source_id, match_confidence, match_method, notes)
SELECT
    NULL,
    'registry',
    'systems',
    id::text,
    1.0,
    'direct_insert',
    'name: ' || COALESCE(name, '')
FROM registry.systems
WHERE active_flag = true;

-- ============================================================
-- Step 4: semantics.canonical_asset
-- ============================================================
INSERT INTO nebula.system_external_ids_history
    (system_id, source_schema, source_table, source_id, match_confidence, match_method, notes)
SELECT
    NULL,
    'semantics',
    'canonical_asset',
    id::text,
    1.0,
    'direct_insert',
    'asset_kind: ' || COALESCE(asset_kind, '') || ', canonical_asset_id: ' || COALESCE(canonical_asset_id, '')
FROM semantics.canonical_asset
WHERE expired_at IS NULL;

-- ============================================================
-- Step 5: conduit.plans (uses `id` text PK; table currently empty)
-- ============================================================
INSERT INTO nebula.system_external_ids_history
    (system_id, source_schema, source_table, source_id, match_confidence, match_method, notes)
SELECT
    NULL,
    'conduit',
    'plans',
    id,
    1.0,
    'direct_insert',
    'title: ' || COALESCE(title, '')
FROM conduit.plans
WHERE deleted = 0;

-- ============================================================
-- Step 6: Match terrain services → nebula.systems via workspace_path patterns
-- ============================================================

-- 6a. Nexus Kernel: kernel-srv
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Nexus Kernel'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Nexus Kernel'
  AND trs.workspace_path LIKE '%kernel-srv%';

-- 6b. Cascade (Event System): cascade*, cascade-srv, cascade-ui, cascade-*-subscriber, cascade-event-bridge, cascade-pg-bridge
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Cascade'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Cascade (Event System)'
  AND (trs.workspace_path LIKE '%/cascade%' OR trs.name LIKE 'cascade%');

-- 6c. PEB: peb-kernel, peb-srv, peb-ui
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → PEB'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Persistent Engineering Brain (PEB)'
  AND (trs.workspace_path LIKE '%/peb-%' OR trs.name LIKE 'peb-%');

-- 6d. WRP: conduit-mcp, conduit-srv, conduit-ui, wrp-bridge-daemon
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → WRP'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Work Request Pipeline (WRP)'
  AND (trs.workspace_path LIKE '%/conduit%' OR trs.name LIKE 'wrp-%' OR trs.name LIKE 'conduit-%');

-- 6e. Vision / LOSM: vision-srv-py, vision-ui, losm-host
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Vision/LOSM'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Vision / LOSM'
  AND (trs.workspace_path LIKE '%/vision%' OR trs.name LIKE 'vision-%' OR trs.name LIKE 'losm-%');

-- 6f. Knowledge Graph: nebula-srv, nebula-ui, nebula-mcp, nebula-control-plane, knowledge-srv
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Knowledge Graph'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Knowledge Graph'
  AND (trs.workspace_path LIKE '%/nebula-%' OR trs.workspace_path LIKE '%/knowledge-%' OR trs.name LIKE 'nebula-%');

-- 6g. Mildred: mildred-dam-api
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Mildred'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Mildred'
  AND (trs.name LIKE 'mildred-%');

-- 6h. Tackle: tackle-srv, tackle-ui, role-memory-srv
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Tackle'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Tackle (AI Configuration)'
  AND (trs.workspace_path LIKE '%/tackle%' OR trs.name LIKE 'tackle-%' OR trs.name LIKE 'role-memory-%');

-- 6i. Agent Runtime: execution-srv, wind-srv, execution-ui, wind-ui
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Agent Runtime'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Agent Runtime'
  AND (trs.workspace_path LIKE '%/execution-%' OR trs.workspace_path LIKE '%/wind-%'
       OR trs.name LIKE 'execution-%' OR trs.name LIKE 'wind-%');

-- 6j. UI (Angular apps): all angular/* UIs
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → UI'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'UI'
  AND trs.workspace_path LIKE '%/angular/%'
  AND eid.system_id IS NULL;   -- only catch UIs not already claimed by a specific system

-- 6k. JVM Services: all jvm/spring/* backends not already claimed
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → JVM Services'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'JVM Services'
  AND trs.workspace_path LIKE '%/jvm/%'
  AND eid.system_id IS NULL;

-- 6l. MCP Servers: all *-mcp
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → MCP Servers'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'MCP Servers'
  AND trs.name LIKE '%-mcp'
  AND eid.system_id IS NULL;

-- 6m. Services (catch-all for typescript/*-srv, python/*): everything still unclaimed
UPDATE nebula.system_external_ids_history eid
SET system_id = ns.id, match_method = 'path_match', notes = eid.notes || ' | → Services'
FROM nebula.systems ns, terrain.runnable_services trs
WHERE eid.source_schema = 'terrain'
  AND eid.source_table = 'runnable_services'
  AND eid.source_id = trs.id::text
  AND ns.name = 'Services'
  AND eid.system_id IS NULL;

-- ============================================================
-- Step 7: Also match registry.services to nebula.systems where
--         there's a service_identity_map bridge to terrain
-- ============================================================
UPDATE nebula.system_external_ids_history eid
SET system_id = subq.system_id,
    match_method = 'identity_map_bridge',
    notes = eid.notes || ' | → matched via service_identity_map'
FROM (
    SELECT DISTINCT eid2.id AS eid_id, eid_terrain.system_id
    FROM registry.service_identity_map sim
    JOIN nebula.system_external_ids_history eid2
        ON eid2.source_schema = 'registry'
       AND eid2.source_table = 'services'
       AND eid2.source_id = sim.registry_service_id::text
    JOIN nebula.system_external_ids_history eid_terrain
        ON eid_terrain.source_schema = 'terrain'
       AND eid_terrain.source_table = 'runnable_services'
       AND eid_terrain.source_id = sim.terrain_service_id::text
    WHERE eid_terrain.system_id IS NOT NULL
      AND eid2.system_id IS NULL
) subq
WHERE eid.id = subq.eid_id;

-- ============================================================
-- Summary
-- ============================================================
SELECT 'terrain: ' || count(*)::text AS cnt FROM nebula.system_external_ids
WHERE source_schema = 'terrain' AND source_table = 'runnable_services'
UNION ALL
SELECT 'registry.services: ' || count(*)::text FROM nebula.system_external_ids
WHERE source_schema = 'registry' AND source_table = 'services'
UNION ALL
SELECT 'registry.systems: ' || count(*)::text FROM nebula.system_external_ids
WHERE source_schema = 'registry' AND source_table = 'systems'
UNION ALL
SELECT 'semantics: ' || count(*)::text FROM nebula.system_external_ids
WHERE source_schema = 'semantics'
UNION ALL
SELECT 'conduit: ' || count(*)::text FROM nebula.system_external_ids
WHERE source_schema = 'conduit'
UNION ALL
SELECT 'total: ' || count(*)::text FROM nebula.system_external_ids
UNION ALL
SELECT 'matched to nebula.system: ' || count(*)::text FROM nebula.system_external_ids
WHERE system_id IS NOT NULL
UNION ALL
SELECT 'unmatched: ' || count(*)::text FROM nebula.system_external_ids
WHERE system_id IS NULL;
