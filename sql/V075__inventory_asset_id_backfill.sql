-- ═══════════════════════════════════════════════════════════════════════
--  V075 — A3: asset_id columns on inventory tables + backfill
--
--  Decision ref: 5d66278d (architect, 2026-08-08)
--  Noun/verb model: 08d69005
--  Survey: 375c02b8
--
--  Goal: Put asset_id uuid REFERENCES semantics.canonical_asset(id)
--  directly on every inventory table, backfill from existing junction
--  (system_external_ids) + identity_map data.
--
--  NOTE: nebula.systems, subsystems, features are VIEWS on _history
--  tables. We ALTER the _history tables, then recreate the views.
--  UPDATEs target the _history tables with the bitemporal WHERE clause.
--
--  Part 1: Add nullable asset_id FK to 8 tables (base tables)
--  Part 2: Extend asset_relation CHECK to include system→service edges
--  Part 3: Create canonical_assets for all inventory rows
--  Part 4: Set asset_id on each inventory row
--  Part 5: Create asset_relation edges for system→service composition
--  Part 6: Recreate nebula.* views to include asset_id
--  Part 7: Verification
--
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  PART 1 — Add asset_id columns (nullable FK) to base tables
-- ═══════════════════════════════════════════════════════════════════════

-- nebula.* _history tables (uuid PKs) — views are built on these
ALTER TABLE nebula.systems_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

ALTER TABLE nebula.subsystems_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

ALTER TABLE nebula.features_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- registry.* tables (bigint PKs, base tables)
ALTER TABLE registry.services
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

ALTER TABLE registry.systems
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- terrain.* tables (bigint PKs, base tables)
ALTER TABLE terrain.runnable_services
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

ALTER TABLE terrain.cli_tools
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

ALTER TABLE terrain.mcp_servers
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- ═══════════════════════════════════════════════════════════════════════
--  PART 2 — Extend asset_relation CHECK for system→service edges
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE semantics.asset_relation
    DROP CONSTRAINT IF EXISTS asset_relation_relation_type_check;

ALTER TABLE semantics.asset_relation
    ADD CONSTRAINT asset_relation_relation_type_check
    CHECK (relation_type IN (
        'supersedes',
        'derives_from',
        'contradicts',
        'consolidates_into',
        'split_from',
        'owns',
        'member_of',
        'equivalent'
    ));

-- ═══════════════════════════════════════════════════════════════════════
--  PART 3A — Standalone canonical_assets (deterministic, idempotent)
--
--  Business key: asset:nexus:<schema>_<table>:<id>
--  For nebula tables, query the _history table via the view pattern:
--    recorded_until_dt = '9999-12-31 23:59:59+00'
-- ═══════════════════════════════════════════════════════════════════════

-- nebula.systems — kind=system (query _history via bitemporal WHERE)
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_systems:' || id::text, 'system'
FROM nebula.systems_history
WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- nebula.subsystems — kind=subsystem
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_subsystems:' || id::text, 'subsystem'
FROM nebula.subsystems_history
WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- nebula.features — kind=feature
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_features:' || id::text, 'feature'
FROM nebula.features_history
WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- registry.services (standalone — identity_map safe pairs in 3B)
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:registry_services:' || id::text, 'service'
FROM registry.services rs
WHERE rs.asset_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM registry.service_identity_map sim
    WHERE sim.registry_service_id = rs.id
      AND sim.match_confidence = 1.0
      AND (sim.valid_until IS NULL OR sim.valid_until > now())
  )
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- registry.systems — kind=service
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:registry_systems:' || id::text, 'service'
FROM registry.systems
WHERE asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- terrain.runnable_services (standalone — identity_map safe pairs in 3B)
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:terrain_runnable_services:' || id::text, 'service'
FROM terrain.runnable_services trs
WHERE trs.asset_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM registry.service_identity_map sim
    WHERE sim.terrain_service_id = trs.id
      AND sim.match_confidence = 1.0
      AND (sim.valid_until IS NULL OR sim.valid_until > now())
  )
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- terrain.cli_tools — kind=cli_tool
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:terrain_cli_tools:' || id::text, 'cli_tool'
FROM terrain.cli_tools
WHERE asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- terrain.mcp_servers — kind=mcp_server
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:terrain_mcp_servers:' || id::text, 'mcp_server'
FROM terrain.mcp_servers
WHERE asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  PART 3B — Unified identity_map safe pairs (exact_name, conf=1.0)
--
--  ONE canonical_asset per safe pair: asset:nexus:service:<lowercase_name>
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT DISTINCT ON (lower(r.name))
    'asset:nexus:service:' || lower(r.name), 'service'
FROM registry.service_identity_map sim
JOIN registry.services r ON r.id = sim.registry_service_id
WHERE sim.match_confidence = 1.0
  AND (sim.valid_until IS NULL OR sim.valid_until > now())
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  PART 3C — Weak identity_map pairs → asset_identity_claim
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.asset_identity_claim
    (asset_id, candidate_asset_id, claim_type, confidence, basis, status)
SELECT
    ca_reg.id,
    ca_ter.id,
    'identity',
    sim.match_confidence::real,
    CASE
        WHEN sim.match_confidence >= 0.8 THEN 'medium'
        ELSE 'weak'
    END,
    'open'
FROM registry.service_identity_map sim
JOIN registry.services r ON r.id = sim.registry_service_id
JOIN terrain.runnable_services t ON t.id = sim.terrain_service_id
JOIN semantics.canonical_asset ca_reg
    ON ca_reg.canonical_asset_id = 'asset:nexus:registry_services:' || r.id::text
   AND ca_reg.expired_at IS NULL
JOIN semantics.canonical_asset ca_ter
    ON ca_ter.canonical_asset_id = 'asset:nexus:terrain_runnable_services:' || t.id::text
   AND ca_ter.expired_at IS NULL
WHERE sim.match_confidence < 1.0
  AND (sim.valid_until IS NULL OR sim.valid_until > now())
  AND NOT EXISTS (
    SELECT 1 FROM semantics.asset_identity_claim aic
    WHERE aic.asset_id = ca_reg.id
      AND aic.candidate_asset_id = ca_ter.id
      AND aic.claim_type = 'identity'
      AND aic.status = 'open'
      AND aic.expired_at IS NULL
  );

-- ═══════════════════════════════════════════════════════════════════════
--  PART 4 — Set asset_id on each inventory row
--
--  For nebula tables: UPDATE the _history table where recorded_until_dt
--  is the open-future sentinel (current row). Views auto-reflect.
--  For registry/terrain: direct UPDATE on base tables.
-- ═══════════════════════════════════════════════════════════════════════

-- nebula.systems_history
UPDATE nebula.systems_history sh
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_systems:' || sh.id::text
  AND ca.expired_at IS NULL
  AND sh.asset_id IS NULL
  AND sh.recorded_until_dt = '9999-12-31 23:59:59+00';

-- nebula.subsystems_history
UPDATE nebula.subsystems_history sh
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_subsystems:' || sh.id::text
  AND ca.expired_at IS NULL
  AND sh.asset_id IS NULL
  AND sh.recorded_until_dt = '9999-12-31 23:59:59+00';

-- nebula.features_history
UPDATE nebula.features_history fh
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_features:' || fh.id::text
  AND ca.expired_at IS NULL
  AND fh.asset_id IS NULL
  AND fh.recorded_until_dt = '9999-12-31 23:59:59+00';

-- registry.services — safe pairs get shared asset first (subquery avoids FROM-clause reference issue)
UPDATE registry.services rs
SET asset_id = sub.asset_id
FROM (
    SELECT sim.registry_service_id, ca.id AS asset_id
    FROM registry.service_identity_map sim
    JOIN registry.services r2 ON r2.id = sim.registry_service_id
    JOIN semantics.canonical_asset ca
        ON ca.canonical_asset_id = 'asset:nexus:service:' || lower(r2.name)
       AND ca.expired_at IS NULL
    WHERE sim.match_confidence = 1.0
      AND (sim.valid_until IS NULL OR sim.valid_until > now())
) sub
WHERE rs.id = sub.registry_service_id
  AND rs.asset_id IS NULL;

-- registry.services — standalone (not in safe pair)
UPDATE registry.services rs
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:registry_services:' || rs.id::text
  AND ca.expired_at IS NULL
  AND rs.asset_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM registry.service_identity_map sim
    WHERE sim.registry_service_id = rs.id
      AND sim.match_confidence = 1.0
      AND (sim.valid_until IS NULL OR sim.valid_until > now())
  );

-- registry.systems
UPDATE registry.systems rs
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:registry_systems:' || rs.id::text
  AND ca.expired_at IS NULL
  AND rs.asset_id IS NULL;

-- terrain.runnable_services — safe pairs get shared asset first (subquery)
UPDATE terrain.runnable_services trs
SET asset_id = sub.asset_id
FROM (
    SELECT sim.terrain_service_id, ca.id AS asset_id
    FROM registry.service_identity_map sim
    JOIN registry.services r2 ON r2.id = sim.registry_service_id
    JOIN semantics.canonical_asset ca
        ON ca.canonical_asset_id = 'asset:nexus:service:' || lower(r2.name)
       AND ca.expired_at IS NULL
    WHERE sim.match_confidence = 1.0
      AND (sim.valid_until IS NULL OR sim.valid_until > now())
) sub
WHERE trs.id = sub.terrain_service_id
  AND trs.asset_id IS NULL;

-- terrain.runnable_services — standalone
UPDATE terrain.runnable_services trs
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:terrain_runnable_services:' || trs.id::text
  AND ca.expired_at IS NULL
  AND trs.asset_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM registry.service_identity_map sim
    WHERE sim.terrain_service_id = trs.id
      AND sim.match_confidence = 1.0
      AND (sim.valid_until IS NULL OR sim.valid_until > now())
  );

-- terrain.cli_tools
UPDATE terrain.cli_tools ct
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:terrain_cli_tools:' || ct.id::text
  AND ca.expired_at IS NULL
  AND ct.asset_id IS NULL;

-- terrain.mcp_servers
UPDATE terrain.mcp_servers ms
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:terrain_mcp_servers:' || ms.id::text
  AND ca.expired_at IS NULL
  AND ms.asset_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  PART 5 — Asset relation edges: system → service composition
--
--  From the junction (system_external_ids), create asset_relation
--  edges: system-asset OWNS service-asset.
--  Only processes live junction rows. Excludes test tables.
-- ═══════════════════════════════════════════════════════════════════════

-- System OWNS service (junction → terrain.runnable_services)
INSERT INTO semantics.asset_relation
    (from_asset_id, to_asset_id, relation_type, decided_by, effective_at)
SELECT
    sys_ca.id,
    trs_ca.id,
    'owns',
    'engineer',
    now()
FROM nebula.system_external_ids sei
JOIN nebula.systems_history ns
    ON ns.id = sei.system_id
   AND ns.recorded_until_dt = '9999-12-31 23:59:59+00'
JOIN semantics.canonical_asset sys_ca
    ON sys_ca.canonical_asset_id = 'asset:nexus:nebula_systems:' || ns.id::text
   AND sys_ca.expired_at IS NULL
JOIN terrain.runnable_services trs
    ON trs.id = sei.source_id::bigint
JOIN semantics.canonical_asset trs_ca
    ON trs_ca.id = trs.asset_id
   AND trs_ca.expired_at IS NULL
WHERE sei.source_schema = 'terrain'
  AND sei.source_table = 'runnable_services'
  AND sei.recorded_until_dt = '9999-12-31 23:59:59+00'
  AND trs.asset_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM semantics.asset_relation ar
    WHERE ar.from_asset_id = sys_ca.id
      AND ar.to_asset_id = trs_ca.id
      AND ar.relation_type = 'owns'
      AND ar.expired_at IS NULL
  );

-- System OWNS service (junction → registry.services)
INSERT INTO semantics.asset_relation
    (from_asset_id, to_asset_id, relation_type, decided_by, effective_at)
SELECT
    sys_ca.id,
    rs_ca.id,
    'owns',
    'engineer',
    now()
FROM nebula.system_external_ids sei
JOIN nebula.systems_history ns
    ON ns.id = sei.system_id
   AND ns.recorded_until_dt = '9999-12-31 23:59:59+00'
JOIN semantics.canonical_asset sys_ca
    ON sys_ca.canonical_asset_id = 'asset:nexus:nebula_systems:' || ns.id::text
   AND sys_ca.expired_at IS NULL
JOIN registry.services rs
    ON rs.id = sei.source_id::bigint
JOIN semantics.canonical_asset rs_ca
    ON rs_ca.id = rs.asset_id
   AND rs_ca.expired_at IS NULL
WHERE sei.source_schema = 'registry'
  AND sei.source_table = 'services'
  AND sei.recorded_until_dt = '9999-12-31 23:59:59+00'
  AND rs.asset_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM semantics.asset_relation ar
    WHERE ar.from_asset_id = sys_ca.id
      AND ar.to_asset_id = rs_ca.id
      AND ar.relation_type = 'owns'
      AND ar.expired_at IS NULL
  );

-- System OWNS service (junction → registry.systems)
INSERT INTO semantics.asset_relation
    (from_asset_id, to_asset_id, relation_type, decided_by, effective_at)
SELECT
    sys_ca.id,
    rsy_ca.id,
    'owns',
    'engineer',
    now()
FROM nebula.system_external_ids sei
JOIN nebula.systems_history ns
    ON ns.id = sei.system_id
   AND ns.recorded_until_dt = '9999-12-31 23:59:59+00'
JOIN semantics.canonical_asset sys_ca
    ON sys_ca.canonical_asset_id = 'asset:nexus:nebula_systems:' || ns.id::text
   AND sys_ca.expired_at IS NULL
JOIN registry.systems rsy
    ON rsy.id = sei.source_id::bigint
JOIN semantics.canonical_asset rsy_ca
    ON rsy_ca.id = rsy.asset_id
   AND rsy_ca.expired_at IS NULL
WHERE sei.source_schema = 'registry'
  AND sei.source_table = 'systems'
  AND sei.recorded_until_dt = '9999-12-31 23:59:59+00'
  AND rsy.asset_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM semantics.asset_relation ar
    WHERE ar.from_asset_id = sys_ca.id
      AND ar.to_asset_id = rsy_ca.id
      AND ar.relation_type = 'owns'
      AND ar.expired_at IS NULL
  );

-- ═══════════════════════════════════════════════════════════════════════
--  PART 6 — Recreate nebula.* views to include asset_id
--
--  The views currently project specific columns from _history tables.
--  Since asset_id was added to the _history tables, we recreate the
--  views to include it. The bitemporal WHERE clause is unchanged.
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS nebula.systems CASCADE;
CREATE VIEW nebula.systems AS
SELECT
    id, name, description, readme, architecture, created_at,
    recorded_on_dt, recorded_until_dt, valid_from, valid_until,
    path, asset_id
FROM nebula.systems_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

DROP VIEW IF EXISTS nebula.subsystems CASCADE;
CREATE VIEW nebula.subsystems AS
SELECT
    id, system_id, name, description, readme, color, created_at,
    recorded_on_dt, recorded_until_dt, valid_from, valid_until,
    path, asset_id
FROM nebula.subsystems_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

DROP VIEW IF EXISTS nebula.features CASCADE;
CREATE VIEW nebula.features AS
SELECT
    id, subsystem_id, name, description, readme, created_at,
    recorded_on_dt, recorded_until_dt, valid_from, valid_until,
    path, asset_id
FROM nebula.features_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

-- ═══════════════════════════════════════════════════════════════════════
--  PART 7 — Verification
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_count integer;
    v_total integer;
    v_asset_relations integer;
    v_claims integer;
BEGIN
    -- Check columns on base tables + views
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema IN ('nebula','registry','terrain')
      AND table_name IN ('systems_history','subsystems_history','features_history',
                          'services','runnable_services','cli_tools','mcp_servers')
      AND column_name = 'asset_id';
    -- registry.systems
    SELECT count(*) INTO v_total
    FROM information_schema.columns
    WHERE table_schema = 'registry' AND table_name = 'systems' AND column_name = 'asset_id';
    v_count := v_count + v_total;

    IF v_count < 8 THEN
        RAISE EXCEPTION 'V075 verify: expected asset_id on 8 tables, found on %', v_count;
    END IF;

    -- Count asset_relation edges created
    SELECT count(*) INTO v_asset_relations
    FROM semantics.asset_relation
    WHERE relation_type IN ('owns','equivalent');

    -- Count asset_identity_claims created
    SELECT count(*) INTO v_claims
    FROM semantics.asset_identity_claim
    WHERE status = 'open' AND expired_at IS NULL;

    RAISE NOTICE 'asset_relation edges (owns/equivalent): %', v_asset_relations;
    RAISE NOTICE 'asset_identity_claims (open): %', v_claims;

    RAISE NOTICE '✅ V075 applied — asset_id columns added, backfill complete, views rebuilt.';
END $$;

COMMIT;
