-- V067__nebula_system_external_ids.sql
-- Junction table: maps nebula.systems → external schema IDs
-- (terrain, registry, semantics, conduit, …) with bitemporal versioning.
--
--   nebula.systems         ← this junction     → terrain.runnable_services
--                                                → registry.services  
--                                                → semantics.canonical_asset
--                                                → conduit plans
--                                                → … (schema_name + source_table are freeform)
--
-- Follows the existing nebula pattern: _history base table + VIEW
-- that projects the current row (recorded_until_dt = '9999-12-31').

BEGIN;

-- ── Base (history) table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nebula.system_external_ids_history (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id           uuid NOT NULL,
    source_schema       text NOT NULL,             -- e.g. 'terrain', 'registry', 'semantics'
    source_table        text NOT NULL,             -- e.g. 'runnable_services', 'services', 'canonical_asset'
    source_id           text NOT NULL,             -- opaque ID (bigint, uuid → text for generality)
    match_confidence    numeric(3,2) NOT NULL DEFAULT 1.00
                        CHECK (match_confidence >= 0 AND match_confidence <= 1.00),
    match_method        text NOT NULL DEFAULT 'manual'
                        CHECK (match_method IN ('exact_name','fuzzy_name','port_match','workspace_path','admission','manual')),
    notes               text,

    -- Bitemporal (matches nebula systems_history convention)
    recorded_on_dt      timestamptz NOT NULL DEFAULT now(),
    recorded_until_dt   timestamptz NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    valid_from          timestamptz NOT NULL DEFAULT now(),
    valid_until         timestamptz NOT NULL DEFAULT '9999-12-31 23:59:59+00'
);

COMMENT ON TABLE nebula.system_external_ids_history IS
'Bridge: one nebula.system_id → zero-or-more external schema IDs.
 Populated from ARCHITECTURE.md during T01 baseline freeze, then
 maintained as services/artifacts evolve.';

COMMENT ON COLUMN nebula.system_external_ids_history.source_schema IS
'PostgreSQL schema name where the external ID lives (terrain, registry, semantics, conduit, …)';

COMMENT ON COLUMN nebula.system_external_ids_history.source_table IS
'Table name within source_schema (runnable_services, services, canonical_asset, implementation_plans, …)';

COMMENT ON COLUMN nebula.system_external_ids_history.source_id IS
'Opaque ID — text to support both bigint serials and UUIDs without union-type complexity';

-- ── Bitemporal VIEW (current rows only) ───────────────────────────
CREATE OR REPLACE VIEW nebula.system_external_ids AS
SELECT
    id,
    system_id,
    source_schema,
    source_table,
    source_id,
    match_confidence,
    match_method,
    notes,
    recorded_on_dt,
    recorded_until_dt,
    valid_from,
    valid_until
FROM nebula.system_external_ids_history
WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

-- ── Unique index: one active mapping per (system, schema, table) ──
--    Prevents duplicate links to the same external row,
--    while allowing multiple schemas per system.
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_external_id_active
    ON nebula.system_external_ids_history (system_id, source_schema, source_table, source_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

-- ── Lookup indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_system_external_ids_schema
    ON nebula.system_external_ids_history (source_schema, source_table)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_system_external_ids_source
    ON nebula.system_external_ids_history (source_schema, source_table, source_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

COMMIT;
