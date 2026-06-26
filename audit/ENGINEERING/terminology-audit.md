# Terminology Audit: Host Profile / Registry Server / Host Server

**Date:** 2026-05-30  
**Scope:** Documentation, `angular/nexus-console/`, `jvm/spring/`, `adonisjs/`

## Three Concepts — One Confusion

| # | Concept | Actual Meaning |
|---|---------|---------------|
| **A** | Service Registry (port 8085) | The central Spring Boot app at `jvm/spring/service-registry/` — service registration, heartbeats, discovery |
| **B** | Registry Server Profile (config) | A connection-configuration record (stored in IndexedDB → topology-server) with the URL and metadata for connecting *to* a service-registry |
| **C** | Host / Server (deployment target) | A physical/virtual machine where services are deployed — JPA entity `Host` in the service-registry, table `servers` |

Concept B is the source of confusion: it's called "Host Profile" / "Host Server" / "Host Server Profile" / "Registry Server" in different places, but it's **none of those** — it's a connection profile for a service-registry instance.

---

## Documentation

### nexus/

- **README.md:241,265,267** —
  Calls the service-registry "Host Server" throughout. Lists `http://localhost:8085` as "Host Server (register)" and "Host Server (query)".
  **Resolution:** Replace "Host Server" with "Service Registry" in headings, diagrams, and URL labels.
  **Impact:** README terminology corrected; no code changes.

- **ARCHITECTURE.md:61** —
  "Auto-registration with host-server" in the service discovery flow. Means "service-registry".
  **Resolution:** Change to "Auto-registration with service-registry".
  **Impact:** Single word fix in architecture doc.

### nexus/angular/nexus-console/

- **blueprint.md:7,15,17,80,84,97,134+** —
  "Active Host Profile Selection", "HostProfile Model", "HostProfileService", "HostServerProvider", "host-server" used for registry server concepts throughout.
  **Resolution:** Replace "HostProfile" → "RegistryServerProfile", "HostServerProvider" → "RegistryServerProvider" in documentation.
  **Impact:** Documentation-only; no code changes.

- **CRITICAL_REGRESSION_ANALYSIS.md:18,28,54-59** —
  References `HostServerRegistrationService.java` (doesn't exist), `HostServerProvider.fetchServices()`, "Host Server URL: http://localhost:8085".
  **Resolution:** Replace "Host Server URL" → "Service Registry URL", "HostServerProvider" → "RegistryServerProvider".
  **Impact:** Documentation-only analysis file.

- **SYSTEM_ARCHITECTURE_ANALYSIS.md:11,44,106-110,247** —
  "Spring Boot Host Server (spring/host-server)" refers to `jvm/spring/service-registry/`. Variable `hostServerUrl` mixed with concept A.
  **Resolution:** Replace references to match actual project path and concept.
  **Impact:** Documentation-only.

### nexus/jvm/spring/terrain/

- **README.md:27,29,35,64,68-72,79,94** —
  Section titled "Host Profiles" but content describes "service registry host configurations." Field `hostServerUrl` documented as "Service registry URL." API endpoints use `/api/v1/host-profiles`. Seed file named `host-profiles.json`.
  **Resolution:** Rename section to "Registry Server Profiles." Rename field to `registryServerUrl`. Rename endpoints to `/api/v1/registry-server-profiles`. Rename seed file to `registry-server-profiles.json`.
  **Impact:** API path change — frontend will need updated URLs. Seed file rename.

---

## Backend: terrain (`jvm/spring/terrain/`)

- **src/main/java/.../entity/HostProfile.java:7,19,20,35** —
  Class named `HostProfile`, table `host_profiles`, column `host_server_url`, field `hostServerUrl`. Entity conflates Concept B (registry connection: `hostServerUrl`) with Concept C (deployment host attributes: `hostname`, `ipAddress`, `cpuCores`, `memoryMb`, `diskGb`, `region`, `cloudProvider`, `operatingSystem`).
  **Resolution:** Rename class to `RegistryServerProfile`, table to `registry_server_profiles`, column to `registry_server_url`. Split deployment-host attributes into a separate `DeploymentHost` entity or move to service-registry's existing `Host` entity.
  **Impact:** Database migration required (rename table + column). All controllers, repositories, and seeders referencing this entity must be updated. Frontend API URLs change.

- **src/main/java/.../controller/HostProfileController.java:15,17,49** —
  Class named `HostProfileController`, path `/api/v1/host-profiles`, method `setHostServerUrl()`.
  **Resolution:** Rename class to `RegistryServerProfileController`, path to `/api/v1/registry-server-profiles`.
  **Impact:** Frontend API calls break — need URL update.

- **src/main/java/.../repository/HostProfileRepository.java:8** —
  `HostProfileRepository extends JpaRepository<HostProfile, Long>`.
  **Resolution:** Rename to `RegistryServerProfileRepository`.
  **Impact:** Controller and seeder references break — need recompilation.

- **src/main/java/.../config/TopologyDataInitializer.java:4,6,20,24,34,49,55** —
  Imports and references `HostProfile`, `HostProfileRepository`, `hostProfileRepository`, `seedHostProfiles`, `host-profiles.json`.
  **Resolution:** Rename all to RegistryServerProfile equivalents, rename seed JSON file.
  **Impact:** Compilation break until all references updated.

- **src/main/resources/config/host-profiles.json** —
  File name uses "host" for registry server config.
  **Resolution:** Rename to `registry-server-profiles.json`.
  **Impact:** File rename — TopologyDataInitializer reference must match.

- **src/main/resources/application.properties** —
  No host-related terms. No changes needed.

---

## Backend: service-registry (`jvm/spring/service-registry/`)

- **src/main/java/.../entity/Host.java:6-7** —
  Class named `Host` but table is `servers`. This is Concept C (deployment target) — class name and table name disagree.
  **Resolution:** Either rename class to `Server` to match table, or rename table to `hosts` to match class. Prefer renaming class to `Server` since "host" is fundamentally confusing in this codebase.
  **Impact:** All references to `Host` class must be updated (controller, repository, services). Database migration to rename table (or not, if only class is renamed and `@Table` annotation adjusted).

- **src/main/java/.../controller/HostController.java:6-7** —
  Class named `HostController` but mapped to `/api/v1/servers`. Class name and path disagree.
  **Resolution:** Rename class to `ServerController` to match path.
  **Impact:** Bean name changes — any `@Qualifier` or `@Service` references need update.

---

## Backend: broker services (`jvm/spring/service-broker/`, `jvm/quarkus/`, `jvm/helidon/`, `adonisjs/`)

- **jvm/spring/service-broker/broker-gateway/.../ServiceRegistryRegistrationService.java:35,116,130,171** —
  Field `hostServerUrl` injected from `service.registry.url` (correct config property, wrong java field name).
  **Resolution:** Rename field to `serviceRegistryUrl`. Config property unchanged.
  **Impact:** Local variable rename — no external API change.

- **jvm/spring/service-broker/broker-gateway/.../service/ServiceDiscoveryClientImpl.java:18,22,33,54** —
  Field `hostServerUrl` injected from `service.registry.url`.
  **Resolution:** Rename field to `serviceRegistryUrl`.
  **Impact:** Local rename only.

- **jvm/spring/service-broker/broker-service/.../ServiceRegistryHeartbeatClient.java:48,116,121,149** —
  Field `hostServerUrl`, log message correctly says "service-registry" but variable name is wrong.
  **Resolution:** Rename field to `serviceRegistryUrl`.
  **Impact:** Local rename only.

- **jvm/quarkus/broker-gateway/.../ServiceRegistryRegistrationService.java:35** —
  Field `hostServerUrl`. Same pattern as Spring version.
  **Resolution:** Rename field to `serviceRegistryUrl`.
  **Impact:** Local rename only.

- **jvm/helidon/user-access-service/.../RegistryClientService.java:36** —
  Field `hostServerUrl`. Class is correctly named `RegistryClientService` but field name is wrong.
  **Resolution:** Rename field to `registryServerUrl`.
  **Impact:** Local rename only.

- **adonisjs/broker-gateway-proxy/app/services/host_server_client.ts:5,7,8,17** —
  Class `HostServerClient` communicates with the service-registry. Field `hostServerUrl`, env var `HOST_SERVER_URL`.
  **Resolution:** Rename class to `ServiceRegistryClient`, rename env var to `SERVICE_REGISTRY_URL`. Rename file to `service_registry_client.ts`.
  **Impact:** File rename + import updates in `start/host_server.ts`. Env variable change — `.env` file must be updated.

- **adonisjs/broker-gateway-proxy/start/host_server.ts:11,15** —
  Imports `HostServerClient` from `host_server_client`. File name uses "host_server".
  **Resolution:** Rename file to `service_registry_registration.ts`, update import.
  **Impact:** File rename + import update.

---

## Frontend: nexus-console (`angular/nexus-console/`)

### Models

- **src/models/host-profile.model.ts:1,4** —
  Interface `HostProfile` with field `hostServerUrl`. Interface name implies deployment host (Concept C) but contents are registry connection config (Concept B).
  **Resolution:** Rename to `RegistryServerProfile`, rename field to `registryServerUrl`.
  **Impact:** Every file importing `HostProfile` or accessing `.hostServerUrl` must be updated (~30 files).

- **src/models/file-system.model.ts:1** —
  `FileType` union includes `'host-server'` for registry server tree nodes.
  **Resolution:** Change to `'registry-server'`.
  **Impact:** All type checks for `'host-server'` must be updated to `'registry-server'`.

- **src/models/tree-node.model.ts:11** —
  `NodeType.HOST_SERVER = 'host-server'` enum value.
  **Resolution:** Rename to `REGISTRY_SERVER = 'registry-server'`.
  **Impact:** All references to `NodeType.HOST_SERVER` must be updated.

- **src/models/generic-tree.model.ts:2** —
  `GenericNodeType` has both `'host-server'` AND `'registry'` as distinct types, but they represent the same concept.
  **Resolution:** Remove `'host-server'`, keep `'registry'`. Or consolidate to `'registry-server'`.
  **Impact:** Consumers checking for `'host-server'` break — need to check `'registry'` or `'registry-server'` instead.

### Services

- **src/services/host-profile.service.ts:8,14,58,93** —
  Class `HostProfileService`, default `hostServerUrl: 'http://localhost:8085'`, methods `getAllHostProfiles`, `addHostProfile`, `updateHostProfile`, `deleteHostProfile`.
  **Resolution:** Rename class to `RegistryServerProfileService`. Rename field to `registryServerUrl`. Rename methods to `getAllRegistryServerProfiles`, etc.
  **Impact:** Every file injecting `HostProfileService` must be updated (~15 files).

- **src/services/db.service.ts:13,104-131,158,160,165,170,175** —
  IndexedDB store `HOST_PROFILES_STORE = 'host-profiles'`. Migration logic maps `profile.type === 'host'` to `HostProfile`. Methods named `getAllHostProfiles`, `addHostProfile`, etc.
  **Resolution:** Rename store to `REGISTRY_SERVER_PROFILES_STORE = 'registry-server-profiles'`. Rename methods.
  **Impact:** `HostProfileService` callers break. IndexedDB migration: existing `host-profiles` store must be migrated or users lose data.

- **src/services/registry-server-provider.service.ts:15,16,462,470,521,670** —
  Class is correctly named `RegistryServerProvider`. But it accesses `profile.hostServerUrl` (wrong field name).
  **Resolution:** After renaming `hostServerUrl` → `registryServerUrl` in the model, update field accesses.
  **Impact:** Automatic — follows the model rename.

- **src/services/service-mesh.service.ts:29,223,233,733** —
  Uses `HostProfile` type, accesses `profile.hostServerUrl`. Method `connectToProfile(profile: HostProfile)`.
  **Resolution:** After `HostProfile` → `RegistryServerProfile` rename, update type references.
  **Impact:** Automatic — follows the model rename.

- **src/services/component-registry.service.ts:35,38,42** —
  Injects `HostProfileService`, accesses `profiles[0].hostServerUrl`.
  **Resolution:** After service rename, update injection and field access.
  **Impact:** Automatic — follows the service and model renames.

- **src/services/generic-tree-service-provider.ts:17,125,148-153** —
  Injects `HostProfileService`. Variable `hostProfileNodes` mapped to type `'registry'`. Parent node is "Service Registries" (correct UI label).
  **Resolution:** Rename `hostProfileNodes` → `registryServerProfileNodes`.
  **Impact:** Local variable rename only.

- **src/services/image.service.ts:19,52-53** —
  Checks `item.type === 'host-server'` to use host-server icon image.
  **Resolution:** Change to `item.type === 'registry-server'`.
  **Impact:** Follows the `FileType` rename.

- **src/utils/tree-converter.util.ts:13-14** —
  Checks `node.type === 'host-server' || node.type === NodeType.HOST_SERVER`.
  **Resolution:** Change to `node.type === 'registry-server' || node.type === NodeType.REGISTRY_SERVER`.
  **Impact:** Follows the type/enum rename.

### Components

- **src/components/host-profiles-dialog/host-profiles-dialog.component.ts & .html:44,50,15,60,119,173,202-213,218,470,10,87,111,118** —
  Component named `HostProfilesDialogComponent`. HTML uses "Manage Host Servers" (title), "Add Host Server" (button), "Host Server URL" (label). This dialog manages service-registry connections.
  **Resolution:** Rename component to `RegistryServerProfilesDialogComponent`. Change HTML labels to "Manage Service Registries", "Add Service Registry", "Service Registry URL".
  **Impact:** Component selector `app-host-profiles-dialog` → `app-registry-server-profiles-dialog`. All templates referencing it break. `app.component.html` must be updated.

- **src/components/host-server-management/host-server-management.component.ts:7,98,30-31,88,89,104,105** —
  Component named `HostServerManagementComponent` but internally says "Service Registries" and "No Service Registries Configured" — the internal text is correct but the component name is wrong.
  **Resolution:** Rename component to `RegistryServerManagementComponent`. Keep internal text (already correct).
  **Impact:** Selector `app-host-server-management` → `app-registry-server-management`. `app.component.html` must be updated.

- **src/components/service-registry-editor/service-registry-editor.component.ts:44,49,10,28,87,111,118,148** —
  Component correctly named `ServiceRegistryEditorComponent`. But field accesses `hostServerUrl` (wrong).
  **Resolution:** After model rename, field access becomes `registryServerUrl`.
  **Impact:** Automatic — follows model rename.

- **src/app.component.ts:291-294,302,306,355,536,900-905,911-912,956,1014-1017,1250,1271,1311,1328-1330,2082-2087** —
  Mixed terminology: comments say "Host Server" but code checks "Service Registries". Variables `pane1HostServerProfileId`, `hostProfileNodes`, `hostProfileService`. Path for navigation uses `'Host Servers'` as folder name.
  **Resolution:** Rename variables `pane1HostServerProfileId` → `pane1RegistryServerProfileId`. Rename `hostProfileNodes` → `registryServerProfileNodes`. Change tree folder path from `['Host Servers']` to `['Service Registries']` (matching the UI label).
  **Impact:** All signal/computed references break and must be updated throughout the file. Path-based navigation logic must use the new path string.

- **src/app.component.html:223,225,242-247,320,322,339-344** —
  References `pane1HostServerProfileId`, `app-host-server-management`.
  **Resolution:** Update to renamed selectors and signal names.
  **Impact:** Follows component and signal renames.

---

## Rename Map (Consolidated)

| Current | Suggested | Scope |
|---------|----------|-------|
| `HostProfile` (entity/model/interface) | `RegistryServerProfile` | Backend + Frontend |
| `hostServerUrl` (field/variable) | `registryServerUrl` or `serviceRegistryUrl` | All |
| `HostProfileService` | `RegistryServerProfileService` | Frontend |
| `HostProfileController` | `RegistryServerProfileController` | Backend |
| `HostProfileRepository` | `RegistryServerProfileRepository` | Backend |
| `host_profiles` (DB table) | `registry_server_profiles` | Backend |
| `host_server_url` (DB column) | `registry_server_url` | Backend |
| `/api/v1/host-profiles` | `/api/v1/registry-server-profiles` | Backend |
| `host-profiles.json` | `registry-server-profiles.json` | Backend |
| `HOST_PROFILES_STORE` / `host-profiles` | `REGISTRY_SERVER_PROFILES_STORE` / `registry-server-profiles` | Frontend IndexedDB |
| `HostProfilesDialogComponent` | `RegistryServerProfilesDialogComponent` | Frontend |
| `HostServerManagementComponent` | `RegistryServerManagementComponent` | Frontend |
| `HOST_SERVER` (NodeType) | `REGISTRY_SERVER` | Frontend |
| `'host-server'` (FileType/GenericNodeType) | `'registry-server'` | Frontend |
| "Host Server" / "Host Servers" (UI labels) | "Service Registry" / "Service Registries" | Frontend |
| `HostServerClient` (AdonisJS) | `ServiceRegistryClient` | AdonisJS |
| `host_server_client.ts` | `service_registry_client.ts` | AdonisJS |
| `host_server.ts` | `service_registry_registration.ts` | AdonisJS |
| `HOST_SERVER_URL` (env var) | `SERVICE_REGISTRY_URL` | AdonisJS |
| `Host` (service-registry entity, Concept C) | `Server` (to match table `servers`) | Backend service-registry |
| `HostController` | `ServerController` | Backend service-registry |

---

## What NOT to rename

The `Host.java` entity in the service-registry correctly represents Concept C — a physical/virtual host machine for deployments. It should not be conflated with the registry-profile rename. Its table is `servers` and its path is `/api/v1/servers`. Renaming it to `Server` would resolve the table-name/class-name disagreement without touching Concept B at all.

---

## Implementation Notes

1. **Database migration**: `host_profiles` → `registry_server_profiles` requires a DDL migration or a fresh start since the topology-server is new.
2. **IndexedDB migration**: The frontend `host-profiles` store would need a version bump in `DbService` with data migration logic, or users lose their configured profiles on update.
3. **API path change**: `/api/v1/host-profiles` → `/api/v1/registry-server-profiles` breaks the frontend until updated. Consider keeping the old path as an alias during transition.
4. **~375 individual occurrences** across ~40 files need updating. This should be done as an atomic change to avoid a broken intermediate state.
5. The `HostProfile` entity's conflation of Concept B + C fields should be addressed by splitting deployment-host attributes into a separate entity or into the service-registry's existing `Host` entity.


Key findings:
- hostServerUrl is the most pervasive wrong name — 25+ files use it for what is actually service.registry.url
- HostProfile name is wrong in 15 files — should be RegistryServerProfile, since it stores connection config for the service-registry, not deployment host metadata
- HostProfile entity has a split personality — it mixes registry connection fields (hostServerUrl) with deployment-host fields (hostname, cpuCores, diskGb, region) that belong to a completely different concept
- UI is inconsistent — the tree folder is labeled "Service Registries" (correct) but the dialog calls it "Host Servers" (wrong), the component is named HostServerManagementComponent but internally says "Service Registries"
- RegistryServerProvider is the one correct name — everything else should match it
