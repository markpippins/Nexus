-- ═══════════════════════════════════════════════════════════════════════
--  V090 — registry service asset-linking (T01 drift fix, ratified)
--
--  Decision ref: 3d8769e8 (architect, 2026-08-09) — options 2 + 3 ratified:
--    • option 3 (drift fix): link assets on registration + add the missing
--      owns edges for knowledge-srv / terrain-srv.
--  Thread:       Nebula Data Analysis — 8207e3b6 (reply 471eeb70, feasibility)
--
--  What this does:
--    1. `semantics.ensure_registered_service_asset(service_id, system_name)`
--       — idempotent helper that creates the service's canonical_asset
--       (key `asset:nexus:registry_services:<id>`, kind `service`), sets
--       registry.services.asset_id, and wires an `owns` edge from the named
--       nebula system's asset to the service asset.
--    2. `AFTER INSERT` trigger on registry.services — every future API
--       registration (POST /api/v1/registry/register, Java service-registry)
--       is auto asset-linked to the default `Services` system. Registration
--       path is Java-only (pguser is superuser), so no application change is
--       required — the trigger covers all insert paths.
--    3. Backfill — the 4 API-registered orphans found in T01 verification:
--         • conduit-srv (id 64)      → Work Request Pipeline (WRP)
--         • conduit-ui-legacy (id 65) → Work Request Pipeline (WRP)
--         • voyager-adapter (id 63)  → Services
--         • slash-command-mcp (id 62) → asset only (status ARCHIVED)
--       plus the 2 missing owns edges:
--         • knowledge-srv (109) → Knowledge Graph
--         • terrain-srv (111)   → JVM Services
--
--  Idempotent: canonical_asset insert is guarded by the partial unique index
--  (canonical_asset_id WHERE expired_at IS NULL); asset_relation inserts use
--  the active-edge unique index (from, to, relation WHERE expired_at IS NULL).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Helper function (idempotent)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION semantics.ensure_registered_service_asset(
    p_service_id bigint,
    p_system_name text DEFAULT 'Services'
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_id        uuid;
    v_system_asset_id uuid;
    v_canonical_key   text;
BEGIN
    v_canonical_key := 'asset:nexus:registry_services:' || p_service_id::text;

    -- (a) ensure the canonical asset for this registry service exists
    INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
    VALUES (v_canonical_key, 'service')
    ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

    SELECT id INTO v_asset_id
    FROM semantics.canonical_asset
    WHERE canonical_asset_id = v_canonical_key
      AND expired_at IS NULL;

    IF v_asset_id IS NULL THEN
        RAISE EXCEPTION 'failed to create canonical asset for registry service %', p_service_id;
    END IF;

    -- (b) link the registry row to the asset
    UPDATE registry.services
       SET asset_id = v_asset_id
     WHERE id = p_service_id;

    -- (c) wire the owns edge from the named nebula system (if it exists)
    SELECT ns.asset_id INTO v_system_asset_id
    FROM nebula.systems ns
    JOIN semantics.canonical_asset ca ON ca.id = ns.asset_id
    WHERE ns.name = p_system_name
      AND ca.canonical_asset_id = 'asset:nexus:nebula_systems:' || ns.id::text
    LIMIT 1;

    IF v_system_asset_id IS NOT NULL THEN
        INSERT INTO semantics.asset_relation
            (from_asset_id, to_asset_id, relation_type, decided_by, effective_at)
        VALUES (v_system_asset_id, v_asset_id, 'owns', 'architect', now())
        ON CONFLICT (from_asset_id, to_asset_id, relation_type)
            WHERE expired_at IS NULL DO NOTHING;
    END IF;

    RETURN v_asset_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  2. BEFORE INSERT trigger — auto asset-link every future registration.
--     BEFORE (not AFTER) so NEW.asset_id is set before the row is written:
--     the identity id is already assigned, the extra UPDATE is avoided, and
--     INSERT ... RETURNING (and the Java register() response) carries the
--     real asset_id on the first call instead of NULL.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION semantics.registry_service_asset_link_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_id uuid;
BEGIN
    v_asset_id := semantics.ensure_registered_service_asset(NEW.id, 'Services');
    NEW.asset_id := v_asset_id;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_registry_service_asset_link ON registry.services;
CREATE TRIGGER trg_registry_service_asset_link
    BEFORE INSERT ON registry.services
    FOR EACH ROW
    EXECUTE FUNCTION semantics.registry_service_asset_link_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  3. Backfill — the 4 API-registered orphans (T01 verification finding)
-- ═══════════════════════════════════════════════════════════════════════

SELECT semantics.ensure_registered_service_asset(64, 'Work Request Pipeline (WRP)');
SELECT semantics.ensure_registered_service_asset(65, 'Work Request Pipeline (WRP)');
SELECT semantics.ensure_registered_service_asset(63, 'Services');
-- slash-command-mcp is ARCHIVED — link the asset, but no owns edge.
SELECT semantics.ensure_registered_service_asset(62, NULL);

-- ═══════════════════════════════════════════════════════════════════════
--  4. Backfill — missing owns edges for real services (also ratified)
-- ═══════════════════════════════════════════════════════════════════════

SELECT semantics.ensure_registered_service_asset(109, 'Knowledge Graph');
SELECT semantics.ensure_registered_service_asset(111, 'JVM Services');

-- ═══════════════════════════════════════════════════════════════════════
--  5. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_orphans       integer;
    v_linked        integer;
    v_knowledge     integer;
    v_terrain_srv   integer;
    v_wrp           integer;
    v_voyager       integer;
BEGIN
    SELECT count(*) INTO v_orphans FROM registry.services WHERE asset_id IS NULL;
    SELECT count(*) INTO v_linked
    FROM registry.services rs JOIN semantics.asset_relation ar
      ON ar.to_asset_id = rs.asset_id AND ar.relation_type = 'owns' AND ar.expired_at IS NULL
    WHERE rs.id IN (62,63,64,65,109,111);
    SELECT count(*) INTO v_knowledge
    FROM semantics.asset_relation ar
    WHERE ar.to_asset_id = (SELECT asset_id FROM registry.services WHERE id = 109)
      AND ar.relation_type = 'owns' AND ar.expired_at IS NULL;
    SELECT count(*) INTO v_terrain_srv
    FROM semantics.asset_relation ar
    WHERE ar.to_asset_id = (SELECT asset_id FROM registry.services WHERE id = 111)
      AND ar.relation_type = 'owns' AND ar.expired_at IS NULL;
    SELECT count(*) INTO v_wrp
    FROM semantics.asset_relation ar
    WHERE ar.to_asset_id IN (SELECT asset_id FROM registry.services WHERE id IN (64,65))
      AND ar.relation_type = 'owns' AND ar.expired_at IS NULL;
    SELECT count(*) INTO v_voyager
    FROM semantics.asset_relation ar
    WHERE ar.to_asset_id = (SELECT asset_id FROM registry.services WHERE id = 63)
      AND ar.relation_type = 'owns' AND ar.expired_at IS NULL;

    RAISE NOTICE 'V090 applied — % orphans remain, % of 6 targets have owns edges (knowledge=% terrain-srv=% wrp=% voyager=%), trigger trg_registry_service_asset_link live.',
        v_orphans, v_linked, v_knowledge, v_terrain_srv, v_wrp, v_voyager;
END $$;

COMMIT;
