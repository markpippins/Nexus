-- V5: Remove duplicate type-table rows that still have old UPPERCASE names
--
-- The seed process created duplicate rows for each type concept — one with
-- a Proper Case name and one with an UPPERCASE_UNDERSCORE name. The V3/V4
-- migrations renamed the original rows but the duplicate uppercase rows
-- remained (at higher IDs) since they were not FK-referenced.
--
-- The registry.categories view is a UNION ALL of the type tables, so
-- these duplicates appeared as separate entries in the categories UI.
--
-- The delete conditions use a pattern-based approach rather than hardcoded
-- IDs, making this idempotent: it targets names that are either
-- underscore-separated uppercase (e.g. JAVA_SPRING) or single-word
-- uppercase without non-letter characters (e.g. PHYSICAL, LINUX), while
-- preserving legitimate names like "ASP.NET" (has a dot), "REST API"
-- (has a space), and "NONE".
--
-- All foreign keys were checked — no rows reference these duplicates.

BEGIN;

-- ------------------------------------------------------------------
-- framework_type
-- Matches: JAVA_SPRING, NODE_NESTJS, ... OTHER
-- Excludes: ASP.NET (has dot), REST (single word, but correct)
-- ------------------------------------------------------------------
DELETE FROM registry.framework_type
WHERE (name ~ '_[A-Z]' OR (name = UPPER(name) AND name !~ '[^A-Z]'))
  AND name != 'NONE';

-- ------------------------------------------------------------------
-- service_type
-- Matches: REST_API, GRAPHQL_API, ... BACKGROUND_JOB
-- Excludes: REST API (has space), gRPC Service (has lowercase)
-- ------------------------------------------------------------------
DELETE FROM registry.service_type
WHERE (name ~ '_[A-Z]' OR (name = UPPER(name) AND name !~ '[^A-Z]'))
  AND name != 'NONE';

-- ------------------------------------------------------------------
-- server_type
-- Matches: PHYSICAL, VIRTUAL, CONTAINER, CLOUD
-- ------------------------------------------------------------------
DELETE FROM registry.server_type
WHERE (name ~ '_[A-Z]' OR (name = UPPER(name) AND name !~ '[^A-Z]'))
  AND name != 'NONE';

-- ------------------------------------------------------------------
-- environment_type
-- Matches: DEVELOPMENT, STAGING, PRODUCTION, TEST
-- ------------------------------------------------------------------
DELETE FROM registry.environment_type
WHERE (name ~ '_[A-Z]' OR (name = UPPER(name) AND name !~ '[^A-Z]'))
  AND name != 'NONE';

-- ------------------------------------------------------------------
-- operating_systems
-- Matches: LINUX, WINDOWS, MACOS, ANDROID, IOS
-- ------------------------------------------------------------------
DELETE FROM registry.operating_systems
WHERE (name ~ '_[A-Z]' OR (name = UPPER(name) AND name !~ '[^A-Z]'))
  AND name != 'NONE';

COMMIT;
