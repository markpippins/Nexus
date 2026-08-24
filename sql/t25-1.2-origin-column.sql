-- ============================================================================
-- T25 1.2 (R-A-2026-08-15-008, plan 1304) — registry.services origin column
--
-- Provenance marker: seed (declarative catalog) vs register (runtime-created
-- via POST /api/v1/registry/register). The 1.2 sync never overwrites catalog
-- metadata of origin='seed' rows; idempotent + reversible.
--
-- NOTE: the registry schema is ddl-auto=update managed (Flyway is NOT wired
-- for registry.services — the db/migration/V1..V9 files are not executed by
-- any runner). The Service entity carries the field; this script is the
-- guarded DDL + one-shot backfill applied manually:
--
--   psql -h localhost -U pguser -d nexus -f sql/t25-1.2-origin-column.sql
--
-- Guarded: safe to re-run (ADD COLUMN IF NOT EXISTS + conditional UPDATEs).
-- ============================================================================

ALTER TABLE registry.services ADD COLUMN IF NOT EXISTS origin VARCHAR(20);

-- Backfill: everything without an origin is a catalog/seed entry by default.
UPDATE registry.services SET origin = 'seed' WHERE origin IS NULL;

-- Backfill: entries that were runtime-registered (the only marker available
-- before this migration) get origin='register'. Match is exact and
-- intentionally narrow — never fuzzy on description.
UPDATE registry.services SET origin = 'register'
WHERE description = 'External service registered via API'
  AND origin = 'seed';
