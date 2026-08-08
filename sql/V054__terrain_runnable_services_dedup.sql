-- ═══════════════════════════════════════════════════════════════════════════
-- V054 — Deduplicate terrain.runnable_services + add idempotent upsert guard
-- ═══════════════════════════════════════════════════════════════════════════
-- Problem:
--   terrain.runnable_services had two rows for 'cascade' (ids 17 and 78).
--   The table is written by multiple registration paths — the Express
--   terrain-srv (POST /terrain/runnable-services, search_path=terrain,public)
--   and the Spring Boot terrain service (port 8084, used by terrain-mcp).
--   Neither path had a uniqueness guard, so a race or dual-path registration
--   produced the duplicate.
--
-- Fix (write-path agnostic — DB level, so every future writer is guarded):
--   1. Delete duplicate rows, keeping the LOWEST id per name (idempotent:
--      re-running deletes nothing once clean).
--   2. Add UNIQUE (name) via a DO-block guard (PostgreSQL does not support
--      IF NOT EXISTS on ADD CONSTRAINT).
--
-- Verified 2026-08-01:
--   - Only 'cascade' was duplicated (no other data blocks the constraint).
--   - No FK references to the removed rows (service_dependencies,
--     registry.service_identity_map both empty for ids 17/78).
--   - Registrations upsert by exact name (WHERE name = $1), so the unique
--     constraint aligns with existing semantics.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Dedup: keep lowest id per name, remove the rest ─────────────────────
-- Idempotent: after the first run no duplicate (name) pairs remain.
DELETE FROM terrain.runnable_services rs
USING terrain.runnable_services rs2
WHERE rs.id > rs2.id
  AND rs.name = rs2.name;

-- ── 2. Idempotent upsert guard: UNIQUE (name) ──────────────────────────────
-- Blocks any future duplicate-name registration from ANY write path
-- (terrain-srv Express, Spring Boot terrain service, terrain-mcp, direct SQL).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'terrain.runnable_services'::regclass
          AND conname = 'runnable_services_name_key'
    ) THEN
        ALTER TABLE terrain.runnable_services ADD CONSTRAINT runnable_services_name_key UNIQUE (name);
    END IF;
END $$;
