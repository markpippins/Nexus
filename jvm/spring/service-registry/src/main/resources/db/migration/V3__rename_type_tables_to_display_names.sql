-- =============================================================================
-- Migration: V3__rename_type_tables_to_display_names.sql
-- Schema:    registry
--
-- Purpose:
--   Rename UPPERCASE_UNDERSCORE type names to display-friendly Camel Case
--   with spaces across 4 type lookup tables:
--     - framework_type  (Category)
--     - library_type    (Library Categories)
--     - service_type    (Service / Service Type)
--     - operating_systems
--
--   The name column is used as a human-readable label throughout the UI,
--   but is also referenced in code via findByName() lookups.  This migration
--   must therefore be accompanied by Java and TypeScript string constant
--   updates (see V3 companion: code changes in
--   ExternalServiceRegistrationService, ServiceSyncService,
--   NebulaSeedController, service-mesh.model.ts).
--
--   Design decision (2026-07-11):
--   Using a PL/pgSQL helper avoids a repetitive ~80-row CASE expression.
--   The helper title-cases each underscore-delimited word while preserving
--   common acronyms (REST, API, UI, HTTP, CSS, 3D, ORM, ID, etc.) and
--   known brand-name uppercase patterns (JS, API, UI).
--
-- Idempotent:  YES — each UPDATE guards against already-applied by
--              checking the old name still exists.
-- Safe to re-run: YES
-- =============================================================================

BEGIN;

-- =============================================================================
-- Helper: to_display_name('UPPERCASE_UNDERSCORE') → 'Camel Case With Spaces'
-- =============================================================================
CREATE OR REPLACE FUNCTION registry.to_display_name(raw text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    parts text[];
    i int;
    word text;
    result text := '';
    -- Words that should remain fully uppercase (acronyms)
    keep_upper text[] := ARRAY['REST','API','UI','HTTP','CSS','3D','ORM','ID','CMS'];
    -- Words that should remain lowercase (prepositions, stylized)
    keep_mixed text[] := ARRAY['iOS','macOS'];
    upper_word text;
BEGIN
    -- Split by underscore
    parts := string_to_array(raw, '_');

    FOR i IN 1 .. array_length(parts, 1) LOOP
        word := parts[i];

        -- Check if this is a known kept-uppercase word
        IF word = ANY(keep_upper) THEN
            word := word;
        -- Check if it's a brand-name compound like NestJS → NestJS, NextJS → NextJS, etc.
        ELSIF word ~ '(?i)^(Nest|Next|Adonis|Fast)JS$' THEN
            word := initcap(split_part(word, 'JS', 1)) || 'JS';
        ELSIF word ~ '(?i)^(Fast)API$' THEN
            word := initcap(split_part(word, 'API', 1)) || 'API';
        ELSIF word = 'tRPC' OR word = 'TRPC' THEN
            word := 'tRPC';
        ELSIF word = 'iOS' OR word = 'IOS' THEN
            word := 'iOS';
        ELSIF word = 'macOS' OR word = 'MACOS' THEN
            word := 'macOS';
        ELSIF word = 'gRPC' OR word = 'GRPC' THEN
            word := 'gRPC';
        ELSIF word = 'GraphQL' OR word = 'GRAPHQL' THEN
            word := 'GraphQL';
        ELSIF word = 'ASP' OR parts[i+1] = 'NET' THEN
            -- Handle "ASP_NET" → "ASP.NET"
            word := 'ASP';
            IF i < array_length(parts, 1) AND parts[i+1] = 'NET' THEN
                parts[i+1] := '.NET';
            END IF;
        ELSE
            -- Default: title-case (first letter upper, rest lower)
            word := initcap(lower(word));
        END IF;

        result := result || CASE WHEN i > 1 THEN ' ' ELSE '' END || word;
    END LOOP;

    RETURN result;
END;
$$;

-- =============================================================================
-- 1. framework_type (Category)
-- =============================================================================
UPDATE registry.framework_type
SET name = registry.to_display_name(name)
WHERE name = UPPER(name) AND name != 'None';

-- Fix known overrides that the generic function doesn't handle perfectly
UPDATE registry.framework_type SET name = 'Node NestJS' WHERE name = 'Node Nestjs';
UPDATE registry.framework_type SET name = 'Node AdonisJS' WHERE name = 'Node Adonisjs';
UPDATE registry.framework_type SET name = 'Node tRPC' WHERE name = 'Node Trpc';
UPDATE registry.framework_type SET name = 'Python FastAPI' WHERE name = 'Python Fastapi';
UPDATE registry.framework_type SET name = 'Frontend NextJS' WHERE name = 'Frontend Nextjs';
UPDATE registry.framework_type SET name = 'Frontend Svelte' WHERE name = 'Frontend Svelte';
UPDATE registry.framework_type SET name = 'Frontend Preact' WHERE name = 'Frontend Preact';
UPDATE registry.framework_type SET name = 'Ruby Rails' WHERE name = 'Ruby Rails';
UPDATE registry.framework_type SET name = 'Rust Actix' WHERE name = 'Rust Actix';
UPDATE registry.framework_type SET name = 'Desktop Tauri' WHERE name = 'Desktop Tauri';
UPDATE registry.framework_type SET name = 'Mobile Expo' WHERE name = 'Mobile Expo';
UPDATE registry.framework_type SET name = 'Elixir Phoenix' WHERE name = 'Elixir Phoenix';
UPDATE registry.framework_type SET name = 'PHP Laravel' WHERE name = 'Php Laravel';
UPDATE registry.framework_type SET name = 'Go Fiber' WHERE name = 'Go Fiber';
UPDATE registry.framework_type SET name = 'ASP.NET' WHERE name = 'Dotnet Aspnet';

-- =============================================================================
-- 2. library_type (Library Categories)
-- =============================================================================
UPDATE registry.library_type
SET name = registry.to_display_name(name)
WHERE name = UPPER(name) AND name != 'None';

-- Fix overrides for library_type
UPDATE registry.library_type SET name = 'UI Components' WHERE name = 'Ui Components';
UPDATE registry.library_type SET name = 'Data Visualization' WHERE name = 'Data Visualization';
UPDATE registry.library_type SET name = '3D Graphics' WHERE name = '3d Graphics';
UPDATE registry.library_type SET name = 'State Management' WHERE name = 'State Management';
UPDATE registry.library_type SET name = 'Form Validation' WHERE name = 'Form Validation';
UPDATE registry.library_type SET name = 'Date Time' WHERE name = 'Date Time';
UPDATE registry.library_type SET name = 'ORM Database' WHERE name = 'Orm Database';
UPDATE registry.library_type SET name = 'HTTP Client' WHERE name = 'Http Client';
UPDATE registry.library_type SET name = 'CSS Styling' WHERE name = 'Css Styling';
UPDATE registry.library_type SET name = 'Bundler Build' WHERE name = 'Bundler Build';
UPDATE registry.library_type SET name = 'Game Engine' WHERE name = 'Game Engine';

-- =============================================================================
-- 3. operating_systems
-- =============================================================================
UPDATE registry.operating_systems
SET name = registry.to_display_name(name)
WHERE name = UPPER(name) AND name != 'None';

-- Fix overrides for operating systems
UPDATE registry.operating_systems SET name = 'macOS' WHERE name = 'Macos';
UPDATE registry.operating_systems SET name = 'iOS' WHERE name = 'Ios';

-- =============================================================================
-- 4. service_type (Service / Service Type)
-- =============================================================================
UPDATE registry.service_type
SET name = registry.to_display_name(name)
WHERE name = UPPER(name) AND name != 'None';

-- Fix overrides for service type
UPDATE registry.service_type SET name = 'REST API' WHERE name = 'Rest Api';
UPDATE registry.service_type SET name = 'gRPC Service' WHERE name = 'Grpc Service';
UPDATE registry.service_type SET name = 'GraphQL API' WHERE name = 'Graphql Api';
UPDATE registry.service_type SET name = 'Web App' WHERE name = 'Web App';
UPDATE registry.service_type SET name = 'Background Job' WHERE name = 'Background Job';
UPDATE registry.service_type SET name = 'Message Queue' WHERE name = 'Message Queue';

-- =============================================================================
-- Clean up: drop helper function
-- =============================================================================
DROP FUNCTION IF EXISTS registry.to_display_name(text);

COMMIT;
