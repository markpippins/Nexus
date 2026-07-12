# Service-Registry Schema Migration — 2026-07-11

## Overview

Coordinated migration across PostgreSQL schema, Java backend (Spring Boot), TypeSpec models,
and Angular frontend. Renamed legacy entity names (`Host`, `HostType`, `FrameworkCategory`,
`LibraryCategory`, `ServiceLibrary`) to their modern equivalents (`Server`, `ServerType`,
`FrameworkType`, `LibraryType`, dropped `ServiceLibrary`), backfilled missing metadata,
and hardened the database with primary key constraints.

---

## 1. Database Changes (Registry Schema)

### 1.1 Table Renames

| Old Name | New Name |
|----------|----------|
| `categories` | `framework_type` |
| `library_categories` | `library_type` |
| `library` | `libraries` |
| `environment_types` | `environment_type` |
| `service_types` | `service_type` |
| `service_config_types` | `service_config_type` |

### 1.2 Tables Dropped

| Table | Reason |
|-------|--------|
| `hosts` | Replaced by `servers` entity |
| `host_type` | Replaced by `server_type` entity |
| `service_libraries` | Many-to-many join table no longer needed |

### 1.3 Tables Created

| Table | Purpose |
|-------|---------|
| `servers` | Replacement for `hosts` |
| `server_type` | Lookup table for server types (PHYSICAL, VIRTUAL, CONTAINER, CLOUD) |
| `framework_type` | Renamed from `categories` |
| `library_type` | Renamed from `library_categories` |

### 1.4 Columns Added

| Table | Column | Type |
|-------|--------|------|
| `framework_type` | `description` | `varchar(1000)` |
| `framework_type` | `created_at` | `timestamp` |
| `framework_type` | `updated_at` | `timestamp` |
| `server_type` | `created_at` | `timestamp` |
| `server_type` | `updated_at` | `timestamp` |
| `service_type` | `created_at` | `timestamp` |
| `service_type` | `updated_at` | `timestamp` |

### 1.5 View Created

`registry.categories` — UNION ALL of all 7 type tables with a `type` discriminator column:

```sql
SELECT ... FROM registry.framework_type       WHERE type = 'framework_type'
UNION ALL SELECT ... FROM registry.server_type         WHERE type = 'server_type'
UNION ALL SELECT ... FROM registry.library_type        WHERE type = 'library_type'
UNION ALL SELECT ... FROM registry.environment_type    WHERE type = 'environment_type'
UNION ALL SELECT ... FROM registry.service_type        WHERE type = 'service_type'
UNION ALL SELECT ... FROM registry.service_config_type WHERE type = 'service_config_type'
UNION ALL SELECT ... FROM registry.operating_systems   WHERE type = 'operating_systems'
```

### 1.6 Primary Key Constraints Added

| Table | Constraint |
|-------|-----------|
| `registry.framework_type` | `PRIMARY KEY (id)` |
| `registry.service_type` | `PRIMARY KEY (id)` |

These tables were created without PK constraints during the initial schema migration,
allowing duplicate IDs. Both were hardened.

### 1.7 Duplicate ID Fixes

| Table | ID | Name | Action |
|-------|----|------|--------|
| `registry.framework_type` | 2 | `JAVA_QUARKUS` | Reassigned to id=51 (was sharing id=2 with `OTHER`) |
| `registry.service_type` | 2 | `GRAPHQL_API` | Reassigned to id=12 (was sharing id=2 with `REST_API`) |
| `registry.service_type` | 2 | `REST_API` | Deleted duplicate (id=1 is canonical) |

Identity sequences were reset: `framework_type → 51`, `service_type → 12`.

---

## 2. Data Backfill

### 2.1 Descriptions Backfilled

| Table | Rows | Description Template |
|-------|------|---------------------|
| `framework_type` | 51 | `"Spring Framework - Enterprise Java ..."`, `"Quarkus - Supersonic Subatomic Java ..."`, etc. |
| `operating_systems` | 6 | `"Linux - Open-source Unix-like operating system ..."`, `"Windows - Microsoft ..."`, etc. |

### 2.2 Timestamps Backfilled

All 7 type tables had `created_at` / `updated_at` set via `COALESCE(col, NOW())`:

| Table | Rows | Status |
|-------|------|--------|
| `framework_type` | 51 | ✅ |
| `server_type` | 5 | ✅ |
| `library_type` | 21 | ✅ |
| `service_type` | 11 | ✅ |
| `service_config_type` | 0 | ✅ (empty) |
| `environment_type` | 5 | ✅ |
| `operating_systems` | 6 | ✅ |

### 2.3 View Bug Fix

The `registry.categories` view had `NULL::timestamp` hardcoded for `operating_systems.created_at`
and `updated_at`. Fixed via `CREATE OR REPLACE VIEW` to use the actual table columns.

---

## 3. Java Backend Changes

### 3.1 Entity Renames

| Old Class | New Class | Table |
|-----------|-----------|-------|
| `Host.java` | `Server.java` | `servers` |
| `HostType.java` | `ServerType.java` | `server_type` |
| `FrameworkCategory.java` | `FrameworkType.java` | `framework_type` |
| `LibraryCategory.java` | `LibraryType.java` | `library_type` |

### 3.2 Entities Deleted

| Entity | Reason |
|--------|--------|
| `Host.java` | Replaced by `Server.java` |
| `HostType.java` | Replaced by `ServerType.java` |
| `FrameworkCategory.java` | Replaced by `FrameworkType.java` |
| `LibraryCategory.java` | Replaced by `LibraryType.java` |
| `ServiceLibrary.java` | Feature removed (join table dropped) |

### 3.3 Controllers Created / Renamed

| Controller | Endpoint |
|------------|----------|
| `ServerController` | `GET/POST/PUT/DELETE /api/v1/servers` |
| `ServerTypeController` | `GET/POST/PUT/DELETE /api/v1/server-types` |
| `FrameworkTypeController` | `GET/POST/PUT/DELETE /api/v1/framework-categories` |
| `LibraryTypeController` | `GET/POST/PUT/DELETE /api/v1/library-categories` |
| `DeploymentController` | Rewritten (dropped PATCH /status, /health endpoints) |

### 3.4 Entity Field Updates

| Entity | Change |
|--------|--------|
| `Deployment.java` | `Host host` → `Server server`, getter/setter updated |
| `EnvironmentType.java` | `@Table(name = "environment_type")`, `servers` relationship type updated |
| `OperatingSystem.java` | `servers` relationship type updated |
| `Framework.java` | `FrameworkCategory category` → `FrameworkType category` |
| `Library.java` | `@Table(name = "libraries")`, `LibraryCategory category` → `LibraryType category`, removed `Set<ServiceLibrary>` field |
| `ServiceType.java` | Added `created_at` / `updated_at` timestamp fields |
| `ServiceConfigType.java` | `@Table(name = "service_config_type")` |

### 3.5 Service / Config Updates

| File | Changes |
|------|---------|
| `DataInitializer.java` | Rewritten — seeds `Server`/`ServerType` instead of `Host`/`HostType`, uses `FrameworkType`/`LibraryType` repositories |
| `ServicesConsoleClient.java` | Rewritten — all `getHosts()` → `getServers()`, `getCategories()` → `getFrameworkTypes()` |
| `CacheWarmingService.java` | Rewritten — uses new entity names throughout |
| `NebulaSeedController.java` | Rewritten — uses `Server` instead of `Host` |

### 3.6 Test Updates

| File | Changes |
|------|---------|
| `DeploymentControllerTest.java` | `Host` → `Server`, removed 4 tests for dropped PATCH endpoints |

---

## 4. TypeSpec Model Updates

**File**: `nexus/typespec/v1/service-registry/spring/models.tsp`
**File**: `nexus/typespec/v1/service-registry/spring/operations.tsp`

| Change | Details |
|--------|---------|
| `Host` model | Renamed to `Server` |
| `FrameworkCategory` model | Renamed to `FrameworkType` |
| `FrameworkCategoryCreate` | Renamed to `FrameworkTypeCreate` |
| `FrameworkCategoryUpdate` | Renamed to `FrameworkTypeUpdate` |
| `LibraryCategory` model | Renamed to `LibraryType` |
| `Deployment.host` field | Changed to `Deployment.server` |
| `FrameworkCategories` interface | Renamed to `FrameworkTypes` |

---

## 5. Angular Frontend Changes

### 5.1 Model Updates (`service-mesh.model.ts`)

| Old | New |
|-----|-----|
| `type FrameworkCategory` | `type FrameworkType` |
| `interface FrameworkCategoryEntity` | `interface FrameworkTypeEntity` |
| `interface LibraryCategory` | `interface LibraryType` |
| `Framework.category` type | `FrameworkTypeEntity` |
| `Library.category` type | `LibraryType` |
| `getFrameworkIcon` parameter | `FrameworkType \| string` |

### 5.2 Service Updates (`service-mesh.service.ts`)

| Change | Old | New |
|--------|-----|-----|
| API endpoint | `GET /api/v1/hosts` | `GET /api/v1/servers` |

### 5.3 Component Updates (`platform-management.component.ts`)

| Change | Details |
|--------|---------|
| Template `@case` | `'host-types'` → `'server-types'` (1 occurrence) |
| `loadData()` switch | `'host-types'` → `'server-types'` (1 occurrence) |
| `onAdd()` switch | `'host-types'` → `'server-types'` (1 occurrence) |
| `onEdit()` switch | `'host-types'` → `'server-types'` (1 occurrence) |
| `onDelete()` switch | `'host-types'` → `'server-types'` (1 occurrence) |
| Status info switch | `'host-types'` → `'server-types'` (1 occurrence) |
| Template deployment cell | `d.host?.hostname` → `d.server?.hostname` |

### 5.4 Dialog Updates

| Component | Renamed From | Renamed To |
|-----------|-------------|------------|
| `upsert-host-dialog/` | `UpsertHostDialogComponent` | `UpsertServerDialogComponent` |
| `upsert-server-dialog/` | File+selector renamed | — |

### 5.5 Feature Removed

| Component | Reason |
|-----------|--------|
| `service-libraries-dialog/` | `service_libraries` table dropped, feature no longer exists |
| `ServiceLibrary` interface/model | Feature removed |
| All `getServiceLibraries`/`addServiceLibrary`/`removeServiceLibrary` methods | Feature removed |

### 5.6 Other Cleanups

| File | Change |
|------|--------|
| `app.component.ts` | `validTypes` updated, `Host` import → `Server`, `createHost` → `createServer` |
| `service-mesh.model.ts` | `Deployment.host: any` → `Deployment.server: any`, `HostType` → `ServerType`, `HostEnvironment` → `EnvironmentType`, `HostStatus` → `ServerStatus`, `ServiceTreeNode` type union updated |
| `registry-server-provider.service.ts` | `deployment.host.hostname` → `deployment.server.hostname` |
| `platform-management.service.ts` | `Host` interface → `Server`, `getHosts` → `getServers`, endpoint paths updated, `DeploymentPayload.hostId` → `serverId` |

### 5.7 Backend: Unified Categories View

| File | Purpose |
|------|---------|
| `CategoriesView.java` | `@Immutable` JPA entity mapping `registry.categories` DB view with composite `@IdClass(CategoriesViewId)` |
| `CategoriesViewId.java` | Composite primary key (`id` + `type` discriminator) preventing Hibernate identity-map collisions across UNION ALL rows |
| `CategoriesViewRepository.java` | Spring Data JPA repository with `findByType` and `findByNameContainingIgnoreCaseAndType` |
| `CategoriesController.java` | `GET /api/v1/categories` with optional `?type=` and `?name=` query params, paginated |

### 5.8 Frontend: Unified Categories CRUD Screen

**New component** — `categories-view/categories-view.component.ts`:

| Feature | Detail |
|---------|--------|
| Type filter toolbar | Color-coded chips for each discriminator (Framework, Server, Library, Environment, Service, OS) with row counts |
| Per-type color badges | Blue (framework), Green (server), Purple (library), Yellow (environment), Orange (service), Cyan (OS) |
| Sortable table | Name, Type (badge), Description columns |
| Per-type edit dispatching | Emits `{item, type}` so the upsert dialog talks to the correct endpoint |

**Wiring in `platform-management.component.ts`:**

| Change | Detail |
|--------|--------|
| `@case('categories')` template | Replaced `<app-lookup-list>` with `<app-categories-view>` |
| `_categoriesEditType` signal | Overrides dialog type per edit (e.g. `'framework-categories'`, `'server-types'`) |
| `editLookupType` computed | Returns override or falls back to `managementType()` |
| `onCategoriesEdit()` | Sets edit type + selected item, opens dialog |
| `onCategoriesDelete()` | Calls `deleteLookup()` with correct endpoint type |
| `onLookupDialogClose()` | Resets `_categoriesEditType` |
| Dialog `[type]` binding | Changed from `managementType()` to `editLookupType()` |
| Status info | Added `'categories'` to display-type formatting |
| Dead code | Removed `'categories'` from `onDelete()` switch (now handled by `onCategoriesDelete`) |

**`platform-management.service.ts`:** Added optional `type`, `architecture`, `family` fields to `LookupItem` interface

### 5.9 Tree Nodes: Individual Type Removal

Removed 3 nodes from `getDataDictionaryNodes()` in `registry-server-provider.service.ts`:

| Removed Node | ID Pattern | Replaced By |
|--------------|------------|-------------|
| Service Types | `platform-dict-servicetypes-*` | Unified Categories view |
| Host Types | `platform-dict-servertypes-*` | Unified Categories view |
| Library Categories | `platform-dict-libcategories-*` | Unified Categories view |

All three type groups are now accessible through the single **Categories** tree node (`managementType: 'framework-categories'`), which renders the unified `CategoriesViewComponent` with its type filter toolbar.

---

## 6. Migration SQL File

**File**: `src/main/resources/db/migration/V1__backfill_type_descriptions.sql`

A comprehensive, idempotent Flyway-compatible migration covering:

| Section | Content |
|---------|---------|
| §0 | Fix duplicate IDs (JAVA_QUARKUS→51, GRAPHQL_API→12) |
| §1 | `framework_type` — 51 descriptions + timestamps |
| §2 | `server_type` — timestamps |
| §3 | `library_type` — timestamps |
| §4 | `service_type` — timestamps |
| §5 | `service_config_type` — timestamps |
| §6 | `environment_type` — timestamps |
| §7 | `operating_systems` — 6 descriptions + timestamps |
| §8 | Add PRIMARY KEY constraints + reset sequences |
| §9 | `CREATE OR REPLACE VIEW registry.categories` fixing OS timestamp exposure |

---

## 7. Verification Results

### 7.1 Builds

| Project | Command | Result |
|---------|---------|--------|
| Java service-registry | `mvn compile` | ✅ BUILD SUCCESS |
| Java service-registry | `mvn test` | ✅ 133 tests, 0 failures |
| Angular nexus-console | `ng build` | ✅ Build completed |

### 7.2 End-to-End API Test

All 6 type endpoints return HTTP 200 with complete `id`, `name`, `description`,
`activeFlag`, `createdAt`, `updatedAt`:

| Endpoint | Status | Items |
|----------|--------|-------|
| `GET /api/v1/framework-categories` | 200 ✅ | 51 |
| `GET /api/v1/server-types` | 200 ✅ | 5 |
| `GET /api/v1/library-categories` | 200 ✅ | 21 |
| `GET /api/v1/service-types` | 200 ✅ | 11 |
| `GET /api/v1/environments` | 200 ✅ | 5 |
| `GET /api/v1/operating-systems` | 200 ✅ | 6 |

### 7.3 Database Completeness

| Table | Rows | Description | created_at | updated_at |
|-------|:----:|:-----------:|:----------:|:----------:|
| `registry.framework_type` | 51 | ✅ | ✅ | ✅ |
| `registry.server_type` | 5 | ✅ | ✅ | ✅ |
| `registry.library_type` | 21 | ✅ | ✅ | ✅ |
| `registry.service_type` | 11 | ✅ | ✅ | ✅ |
| `registry.service_config_type` | 0 | ✅ (empty) | ✅ (empty) | ✅ (empty) |
| `registry.environment_type` | 5 | ✅ | ✅ | ✅ |
| `registry.operating_systems` | 6 | ✅ | ✅ | ✅ |

### 7.4 Stale Reference Audit

All live code in `nexus/` was checked for `FrameworkCategory`, `LibraryCategory`, `Host` (entity),
`HostType` references — none remain in active source files. Matches exist only in:
- `bak/` (backup files)
- `chats/` (conversation transcripts)

---

## 8. Known Remaining Scope

| Item | Location | Notes |
|------|----------|-------|
| `atomic-spring/configuration-manager/` | Separate Java project | Still uses old entity names (`FrameworkCategory`, `LibraryCategory`, `ServiceLibrary`) with `@Table(name = "categories")` etc. Not migrated. |
| `registry-server-provider.service.ts` display names | Angular | Tree node labels still say `'Hosts'` and `'Host Types'` — cosmetic only |
| `service-mesh.service.ts` internal naming | Angular | `_hosts` signal and `fetchHosts()` method name still reference `host` — cosmetic, method is internal |
