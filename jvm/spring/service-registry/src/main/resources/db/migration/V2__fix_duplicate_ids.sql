-- =============================================================================
-- Migration: V2__fix_duplicate_ids.sql
-- Schema:    registry
--
-- Purpose:
--   Fix data integrity issues that cause Hibernate to fail with
--   "Duplicate row was found and ASSERT was specified" or
--   "Unable to find ... with id" on findAll() queries:
--
--     1. frameworks:  id=2 assigned to both "Spring Boot" and "Quarkus"
--     2. services:    id=2 assigned to both "broker-gateway" and "user-service"
--     3. languages:   duplicate row for "Java" at id=2 (id=1 is canonical)
--     4. vendors:     duplicate row for "Unknown" at id=2 (id=1 is canonical)
--     5. services:    orphaned service_type_id=2 (row was deleted by V1)
--
-- Idempotent:  YES — all fixes check for existence before acting.
-- Safe to re-run: YES
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Fix frameworks — Quarkus has duplicate id=2
--    Spring Boot (id=2) is the canonical row. Move Quarkus to MAX(id)+1.
-- =============================================================================
DO $$
DECLARE
    next_id BIGINT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM registry.frameworks
        WHERE id = 2 AND name = 'Quarkus'
    ) THEN
        SELECT COALESCE(MAX(id), 0) + 1 INTO next_id FROM registry.frameworks;
        UPDATE registry.frameworks SET id = next_id
        WHERE id = 2 AND name = 'Quarkus';
        RAISE NOTICE 'Reassigned Quarkus in frameworks from id=2 to id=%', next_id;
    END IF;
END $$;

-- =============================================================================
-- 2. Fix services — user-service has duplicate id=2
--    broker-gateway (id=2) is the canonical row. Move user-service to MAX(id)+1.
-- =============================================================================
DO $$
DECLARE
    next_id BIGINT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM registry.services
        WHERE id = 2 AND name = 'user-service'
    ) THEN
        SELECT COALESCE(MAX(id), 0) + 1 INTO next_id FROM registry.services;
        UPDATE registry.services SET id = next_id
        WHERE id = 2 AND name = 'user-service';
        RAISE NOTICE 'Reassigned user-service in services from id=2 to id=%', next_id;
    END IF;
END $$;

-- =============================================================================
-- 3. Fix languages — remove duplicate "Java" row at id=2
--    (id=1 "Java" is canonical, id=2 "JavaScript" is also canonical)
-- =============================================================================
DELETE FROM registry.languages
WHERE id = 2 AND name = 'Java';

-- =============================================================================
-- 4. Fix vendors — remove duplicate "Unknown" row at id=2
--    (id=1 "Unknown" is canonical, id=2 "FOSS" is also canonical)
-- =============================================================================
DELETE FROM registry.vendors
WHERE id = 2 AND name = 'Unknown';

-- =============================================================================
-- 5. Fix services — orphaned service_type_id=2
--    V1__backfill_type_descriptions.sql deleted the duplicate REST_API row
--    at service_type.id=2, but services still referenced it.
--    broker-gateway (id=2) was referencing the deleted row; GATEWAY (id=7)
--    is the semantically correct type.
-- =============================================================================
UPDATE registry.services
SET service_type_id = 7
WHERE id = 2 AND name = 'broker-gateway' AND service_type_id = 2;

-- =============================================================================
-- 6. Reset identity sequences to current max IDs
-- =============================================================================
SELECT setval(pg_get_serial_sequence('registry.frameworks', 'id'), COALESCE(MAX(id), 1))
FROM registry.frameworks;

SELECT setval(pg_get_serial_sequence('registry.services', 'id'), COALESCE(MAX(id), 1))
FROM registry.services;

SELECT setval(pg_get_serial_sequence('registry.languages', 'id'), COALESCE(MAX(id), 1))
FROM registry.languages;

SELECT setval(pg_get_serial_sequence('registry.vendors', 'id'), COALESCE(MAX(id), 1))
FROM registry.vendors;

SELECT setval(pg_get_serial_sequence('registry.service_type', 'id'), COALESCE(MAX(id), 1))
FROM registry.service_type;

COMMIT;
