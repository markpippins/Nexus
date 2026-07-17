-- =============================================================================
-- Migration: V4__rename_server_and_environment_types.sql
-- Schema:    registry
--
-- Purpose:
--   Rename UPPERCASE type names to display-friendly Proper Case in
--   server_type and environment_type tables.
--
-- Idempotent:  YES — each UPDATE checks the old name still exists.
-- Safe to re-run: YES
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. server_type
-- =============================================================================
UPDATE registry.server_type SET name = 'Physical' WHERE name = 'PHYSICAL';
UPDATE registry.server_type SET name = 'Virtual'  WHERE name = 'VIRTUAL';
UPDATE registry.server_type SET name = 'Container' WHERE name = 'CONTAINER';
UPDATE registry.server_type SET name = 'Cloud'     WHERE name = 'CLOUD';

-- =============================================================================
-- 2. environment_type
-- =============================================================================
UPDATE registry.environment_type SET name = 'Development' WHERE name = 'DEVELOPMENT';
UPDATE registry.environment_type SET name = 'Staging'     WHERE name = 'STAGING';
UPDATE registry.environment_type SET name = 'Production'  WHERE name = 'PRODUCTION';
UPDATE registry.environment_type SET name = 'Test'        WHERE name = 'TEST';

COMMIT;
