-- =============================================================================
-- Migration: V1__backfill_type_descriptions.sql
-- Schema:    registry
--
-- Purpose:
--   Fix data quality issues on registry type lookup tables created during
--   the schema migration (categories→framework_type rename, Host→Server
--   rename, etc.):
--     1. Reassign duplicate primary keys (JAVA_QUARKUS, GRAPHQL_API)
--     2. Backfill descriptions and timestamps on all 7 type tables
--     3. Add primary key constraints to prevent future duplicates
--     4. Fix categories view to expose operating_systems timestamps
--
-- Idempotent:  YES — all UPDATEs use COALESCE + WHERE IS NULL guards.
--              ALTER TABLE ... ADD PRIMARY KEY is no-op if PK exists.
--              CREATE OR REPLACE VIEW is no-op if view already correct.
-- Safe to re-run: YES — already-populated rows are skipped.
--
-- Run via psql:
--   psql -h localhost -U pguser -d nexus -f V1__backfill_type_descriptions.sql
--
-- If using Flyway:
--   Place in src/main/resources/db/migration/ and Flyway will apply
--   automatically on Spring Boot startup.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. Fix duplicate IDs
--    The migration created framework_type and service_type without primary
--    key constraints, allowing duplicate IDs to be inserted.
-- =============================================================================

-- Reassign JAVA_QUARKUS from duplicate id=2 to id=51 (next after None at 50)
UPDATE registry.framework_type SET id = 51
WHERE id = 2 AND name = 'JAVA_QUARKUS';

-- Remove the duplicate REST_API row at id=2 (id=1 is canonical)
DELETE FROM registry.service_type
WHERE id = 2 AND name = 'REST_API';

-- Reassign GRAPHQL_API from duplicate id=2 to id=12 (next after None at 11)
UPDATE registry.service_type SET id = 12
WHERE id = 2 AND name = 'GRAPHQL_API';

-- =============================================================================
-- 1. framework_type — descriptions + timestamps
-- =============================================================================
UPDATE registry.framework_type SET
  description = CASE name
    WHEN 'JAVA_SPRING'          THEN 'Spring Framework - Enterprise Java with dependency injection, aspect-oriented programming, and comprehensive ecosystem'
    WHEN 'JAVA_QUARKUS'         THEN 'Quarkus - Supersonic Subatomic Java, tailored for GraalVM and container-native deployments'
    WHEN 'JAVA_MICRONAUT'       THEN 'Micronaut - A modern, JVM-based framework for building lightweight microservices and serverless applications'
    WHEN 'JAVA_HELIDON'         THEN 'Helidon - A set of Java libraries for building microservices, with both reactive (SE) and imperative (MP) programming models'
    WHEN 'NODE_NESTJS'          THEN 'NestJS - A progressive Node.js framework for building efficient, reliable, and scalable server-side applications'
    WHEN 'NODE_ADONISJS'        THEN 'AdonisJS - A full-featured Node.js framework with a focus on developer ergonomics and convention over configuration'
    WHEN 'NODE_MOLECULER'       THEN 'Moleculer - A fast and powerful microservices framework for Node.js with built-in service broker, load balancing, and circuit breakers'
    WHEN 'NODE_EXPRESS'         THEN 'Express.js - Fast, unopinionated, minimalist web framework for Node.js, the de facto standard for server-side JavaScript'
    WHEN 'NODE_FASTIFY'         THEN 'Fastify - Fast and low-overhead web framework for Node.js with schema-based validation and high performance'
    WHEN 'NODE_HONO'            THEN 'Hono - Ultralight web framework for Cloudflare Workers, Deno, and Bun with TypeScript-first design'
    WHEN 'NODE_KOA'             THEN 'Koa - Expressive HTTP middleware framework for Node.js using async functions, designed by the creators of Express'
    WHEN 'NODE_HAPI'            THEN 'hapi.js - A rich framework for building applications and services in Node.js with configuration-based approach'
    WHEN 'NODE_FEATHERS'        THEN 'Feathers - A real-time API framework for Node.js with service-oriented architecture and database adapters'
    WHEN 'NODE_TRPC'            THEN 'tRPC - End-to-end typesafe APIs made easy, auto-completing API calls between server and client without code generation'
    WHEN 'PYTHON_FASTAPI'       THEN 'FastAPI - Modern, high-performance Python web framework for building APIs with automatic OpenAPI documentation'
    WHEN 'PYTHON_DJANGO'        THEN 'Django - High-level Python web framework that encourages rapid development and clean, pragmatic design'
    WHEN 'PYTHON_FLASK'         THEN 'Flask - Lightweight Python web framework with simplicity and flexibility, ideal for microservices and prototyping'
    WHEN 'GO_GOA'               THEN 'Goa - Design-first API development framework for Go with code generation from a DSL'
    WHEN 'GO_FIBER'             THEN 'Fiber - Express-inspired web framework for Go built on top of Fasthttp, optimized for speed and low memory usage'
    WHEN 'FRONTEND_REACT'       THEN 'React - A declarative, component-based JavaScript library for building user interfaces, developed by Meta'
    WHEN 'FRONTEND_ANGULAR'     THEN 'Angular - A platform and framework for building single-page client applications with TypeScript, developed by Google'
    WHEN 'FRONTEND_VUE'         THEN 'Vue.js - The progressive JavaScript framework for building user interfaces with a focus on approachability and versatility'
    WHEN 'FRONTEND_SVELTE'      THEN 'Svelte - A radical new approach to building user interfaces that shifts work from runtime to compile time'
    WHEN 'FRONTEND_SOLID'       THEN 'Solid.js - A declarative JavaScript library for building user interfaces with fine-grained reactivity and no virtual DOM'
    WHEN 'FRONTEND_NEXTJS'      THEN 'Next.js - The React framework for production with server-side rendering, static generation, and API routes'
    WHEN 'FRONTEND_NUXT'        THEN 'Nuxt - An intuitive Vue framework for building universal applications with auto-imports and file-based routing'
    WHEN 'FRONTEND_REMIX'       THEN 'Remix - A full-stack web framework for React focused on web fundamentals, progressive enhancement, and nested routing'
    WHEN 'FRONTEND_ASTRO'       THEN 'Astro - An all-in-one web framework designed for speed with partial hydration and zero-JS-by-default output'
    WHEN 'FRONTEND_ANALOG'      THEN 'Analog - A full-stack meta-framework for building applications with Angular, inspired by Next.js and Nuxt'
    WHEN 'FRONTEND_EMBER'       THEN 'Ember.js - A productive, battle-tested JavaScript framework for building ambitious web applications'
    WHEN 'FRONTEND_PREACT'      THEN 'Preact - A fast 3kB alternative to React with the same modern API, providing the thinnest possible virtual DOM abstraction'
    WHEN 'DESKTOP_ELECTRON'     THEN 'Electron - A framework for building cross-platform desktop applications using JavaScript, HTML, and CSS'
    WHEN 'DESKTOP_TAURI'        THEN 'Tauri - A framework for building smaller, faster, and more secure desktop applications with a web frontend and a Rust backend'
    WHEN 'MOBILE_REACT_NATIVE'  THEN 'React Native - A framework for building native mobile applications using React, enabling code sharing across iOS and Android'
    WHEN 'MOBILE_EXPO'          THEN 'Expo - A platform for building universal native applications with React Native, providing a managed workflow and tooling'
    WHEN 'MOBILE_IONIC'         THEN 'Ionic - An open-source UI toolkit for building performant, high-quality mobile and desktop apps using web technologies'
    WHEN 'MOBILE_CAPACITOR'     THEN 'Capacitor - A cross-platform native runtime for building modern web apps that run natively on iOS, Android, and the web'
    WHEN 'MOBILE_NATIVESCRIPT'  THEN 'NativeScript - An open-source framework for building truly native mobile applications using JavaScript or TypeScript'
    WHEN 'ELIXIR_PHOENIX'       THEN 'Phoenix - A productive web framework for Elixir with real-time capabilities via channels, built on the Erlang VM'
    WHEN 'RUBY_RAILS'           THEN 'Ruby on Rails - A full-stack web framework optimized for programmer happiness and sustainable productivity'
    WHEN 'PHP_LARAVEL'          THEN 'Laravel - A web application framework for PHP with expressive, elegant syntax and a rich ecosystem of tools'
    WHEN 'RUNTIME_DENO'         THEN 'Deno - A secure runtime for JavaScript and TypeScript, using V8 and built in Rust, by the creator of Node.js'
    WHEN 'RUNTIME_BUN'          THEN 'Bun - An all-in-one JavaScript runtime and toolkit designed for speed, with a native bundler, test runner, and package manager'
    WHEN 'RUNTIME_NODE'         THEN 'Node.js - A JavaScript runtime built on Chrome V8 engine for building scalable network applications'
    WHEN 'RUST_ACTIX'           THEN 'Actix Web - A powerful, pragmatic, and extremely fast web framework for Rust with actor-based concurrency'
    WHEN 'DOTNET_ASPNET'        THEN 'ASP.NET Core - A cross-platform, high-performance framework for building modern, cloud-enabled applications'
    WHEN 'CMS_STRAPI'           THEN 'Strapi - An open-source headless CMS built with Node.js, fully customizable with a plugin system and admin panel'
    WHEN 'CMS_KEYSTONE'         THEN 'Keystone - A powerful headless CMS for Node.js built with GraphQL and React, with auto-generated admin UI'
    WHEN 'OTHER'                THEN 'Other frameworks not explicitly categorized - general purpose, legacy, or domain-specific frameworks'
    WHEN 'None'                 THEN 'No framework specified - placeholder for services not associated with any framework'
    ELSE 'Framework type - ' || name
  END,
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE description IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

-- =============================================================================
-- 2. server_type — timestamps only (descriptions already populated)
-- =============================================================================
UPDATE registry.server_type SET
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR updated_at IS NULL;

-- =============================================================================
-- 3. library_type — timestamps only (descriptions already populated)
-- =============================================================================
UPDATE registry.library_type SET
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR updated_at IS NULL;

-- =============================================================================
-- 4. service_type — timestamps only (descriptions handled by the Java entity)
-- =============================================================================
UPDATE registry.service_type SET
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR updated_at IS NULL;

-- =============================================================================
-- 5. service_config_type — timestamps only
-- =============================================================================
UPDATE registry.service_config_type SET
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR updated_at IS NULL;

-- =============================================================================
-- 6. environment_type — timestamps only
-- =============================================================================
UPDATE registry.environment_type SET
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR updated_at IS NULL;

-- =============================================================================
-- 7. operating_systems — descriptions + timestamps
-- =============================================================================
UPDATE registry.operating_systems SET
  description = CASE name
    WHEN 'LINUX'   THEN 'Linux - Open-source Unix-like operating system kernel used on servers, desktops, and embedded systems'
    WHEN 'WINDOWS' THEN 'Windows - Microsoft graphical operating system family for personal computers and servers'
    WHEN 'MACOS'   THEN 'macOS - Apple graphical operating system for Macintosh computers'
    WHEN 'ANDROID' THEN 'Android - Google mobile operating system based on the Linux kernel'
    WHEN 'IOS'     THEN 'iOS - Apple mobile operating system for iPhone and iPad'
    WHEN 'None'    THEN 'No operating system specified - placeholder for unknown or unspecified OS'
  END,
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE description IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

-- =============================================================================
-- 8. Add primary key constraints if not already present
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'registry.framework_type'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE registry.framework_type ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'registry.service_type'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE registry.service_type ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Reset identity sequences to current max IDs
SELECT setval(pg_get_serial_sequence('registry.framework_type', 'id'), COALESCE(MAX(id), 1))
FROM registry.framework_type;
SELECT setval(pg_get_serial_sequence('registry.service_type', 'id'), COALESCE(MAX(id), 1))
FROM registry.service_type;

-- =============================================================================
-- 9. Fix categories view to expose operating_systems timestamps
--    The original view used NULL::timestamp for created_at/updated_at in the
--    operating_systems branch. Since the table now has real timestamps
--    (backfilled in section 7 above), replace NULL with actual columns.
-- =============================================================================
CREATE OR REPLACE VIEW registry.categories AS
 SELECT framework_type.id,
    framework_type.name,
    framework_type.description,
    framework_type.active_flag,
    framework_type.created_at,
    framework_type.updated_at,
    'framework_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.framework_type
UNION ALL
 SELECT server_type.id,
    server_type.name,
    server_type.description,
    server_type.active_flag,
    server_type.created_at,
    server_type.updated_at,
    'server_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.server_type
UNION ALL
 SELECT library_type.id,
    library_type.name,
    library_type.description,
    library_type.active_flag,
    library_type.created_at,
    library_type.updated_at,
    'library_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.library_type
UNION ALL
 SELECT environment_type.id,
    environment_type.name,
    environment_type.description,
    environment_type.active_flag,
    environment_type.created_at,
    environment_type.updated_at,
    'environment_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.environment_type
UNION ALL
 SELECT service_type.id,
    service_type.name,
    service_type.description,
    service_type.active_flag,
    service_type.created_at,
    service_type.updated_at,
    'service_type'::text AS type,
    service_type.default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.service_type
UNION ALL
 SELECT service_config_type.id,
    service_config_type.name,
    NULL::character varying AS description,
    service_config_type.active_flag,
    service_config_type.created_at,
    service_config_type.updated_at,
    'service_config_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.service_config_type
UNION ALL
 SELECT operating_systems.id,
    operating_systems.name,
    operating_systems.description,
    operating_systems.active_flag,
    operating_systems.created_at,
    operating_systems.updated_at,
    'operating_systems'::text AS type,
    NULL::bigint AS default_component_id,
    operating_systems.architecture,
    operating_systems.family,
    operating_systems.lts_flag,
    operating_systems.version

   FROM registry.operating_systems;

COMMIT;
