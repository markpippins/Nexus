# Terminology Audit: Server vs Host (Deployment Targets)

**Date:** 2026-05-31  
**Scope:** `jvm/spring/service-registry/`, `jvm/spring/service-broker/`, `angular/nexus-console/`

## Concept

**Deployment target** — the physical/virtual machine where services are deployed. This is Concept C from the host-terminology audit, distinct from the service-registry connection config (Concept B) that was resolved previously.

## The Core Inconsistency

The Java entity is named `Host` but everything around it — table names, API paths, UI labels, frontend models — uses "Server":

```
Host.java  (@Table "servers")  →  /api/v1/servers  →  getServers()  →  "Servers" tab  →  "Server Type"
```

There is also a secondary inconsistency within the frontend: `platform-management.service.ts` defines `interface Host`, while `service-mesh.model.ts` defines `interface Server` — two different models for the same backend entity.

---

### `jvm/spring/service-registry/`

- **entity/Host.java:24,26,33,39** —
  Class named `Host`, table named `servers` (`@Table(name = "servers")`). Join column `server_type_id` references `ServerType`. Field `hostname` is consistent with Host, but the table and FK names use "server."
  **Resolution:** Rename table to `hosts` to match class, or rename class to `Server` to match table.
  **Impact:** Database migration required if table is renamed. API paths and all consumers must be updated if class is renamed.

- **controller/HostController.java:24,26,38,53,61,84,110** —
  Class named `HostController`, path `/api/v1/servers`. Methods named `getServers()`, `createServer()`, `updateServer()`, `deleteServer()`. Log messages mix "server" and "host."
  **Resolution:** Either rename path to `/api/v1/hosts` (match Host entity) or rename class to `ServerController` (match servers path). Method names must align with the chosen convention.
  **Impact:** Frontend API calls break if path changes. Bean name changes if class renamed.

- **entity/ServerType.java:11,12** —
  `ServerType` entity with table `server_types`. Related to `Host` via FK `server_type_id`.
  **Resolution:** Rename to `HostType` if Host is the canonical term. Keep `ServerType` if Server becomes canonical.
  **Impact:** Database table rename, entity references throughout the codebase.

- **entity/Deployment.java:22,38,39,116,120,261,265** —
  Field `private Host server;` — type is `Host`, variable name is `server`. Column `server_id`. Methods `getServer()` returns `Host`, `setServer(Host server)` takes `Host`.
  **Resolution:** Rename field to `host`, column to `host_id`.
  **Impact:** Database column rename. References to `getServer()` in controller and service code.

- **repository/DeploymentRepository.java:17,18,38-39** —
  Methods `findByServer(Host server)`, `findByServer_Id(Long serverId)`, `findByServerId(Long serverId)`. Parameter types are `Host` but names use "server."
  **Resolution:** Rename to `findByHost`, `findByHostId`.
  **Impact:** All callers of these repository methods break.

- **repository/HostRepository.java:19,20** —
  Methods `findByType(ServerType serverType)`, `findByType_Id(Long serverTypeId)`. Parameter names use "server" for what is actually a lookup on Host.
  **Resolution:** Rename parameter variables to `hostType`/`hostTypeId`.
  **Impact:** Local rename only.

- **controller/DeploymentController.java:85,183** —
  Calls `deployment.getServer()`, `deployment.setServer()`. Methods named "Server" but operate on `Host`.
  **Resolution:** After `Deployment.server` → `Deployment.host` rename, update callers.
  **Impact:** Automatic — follows the Deployment entity rename.

- **service/DeploymentCacheService.java:29,109,125,235** —
  Redis key prefix `DEPLOYMENTS_BY_SERVER_PREFIX`, method `getDeploymentsByServerId(Long serverId)`.
  **Resolution:** Rename to `DEPLOYMENTS_BY_HOST_PREFIX`, `getDeploymentsByHostId`.
  **Impact:** Redis key changes — cache invalidation on deploy.

- **client/ServicesConsoleClient.java:171-182** —
  Comment acknowledges: `// --- Servers (Hosts) ---`. Methods `getServers()` returns `List<Host>`, `findServerByHostname(String hostname)` mixes both terms.
  **Resolution:** Rename to `getHosts()`, `findHostByHostname()`.
  **Impact:** Internal client only — callers within the same module.

- **config/DataInitializer.java:258,260,380** —
  Method `initializeHosts()` (correct), loads `servers.json` (inconsistent file name), logs "Hosts: " count.
  **Resolution:** Rename seed file to `hosts.json`.
  **Impact:** File rename only.

- **config/servers.json** —
  File name uses "servers" for Host seed data.
  **Resolution:** Rename to `hosts.json`.
  **Impact:** DataInitializer reference must match.

---

### `angular/nexus-console/`

- **services/platform-management.service.ts:8-23,269-325** —
  Interface `Host` with field `serverTypeId`. Methods `getServers()` returns `Host[]`, `createServer()` takes `Partial<Host>`. Comment acknowledges: `// Servers/Hosts CRUD`. The service talks to `/api/v1/servers` but uses `Host` type.
  **Resolution:** Choose one convention — either rename type to `Server` or rename methods to `getHosts()`/`createHost()`.
  **Impact:** All components importing `Host` or calling these methods must be updated.

- **models/service-mesh.model.ts:5,136-161,180,312,313,328,370** —
  COMPETING model: `interface Server` with `hostname`, `ipAddress`, `type: ServerType`. Comment: "Based on the Host Server API data model." Section "Server Models." Types `ServerType`, `ServerEnvironment`, `ServerStatus`. `Deployment.server: Server`. `totalServers`, `activeServers`.
  **Resolution:** Merge with `Host` into a single canonical model. This file uses "Server" while `platform-management.service.ts` uses "Host" — they represent the same concept.
  **Impact:** Every consumer of `Server` or `Host` must be aligned to the chosen name.

- **components/platform-management/platform-management.component.ts:355-422,560,574,654-665,690-691,855,901,941,981,1033-1041** —
  Tab case `'servers'`. Column "Hostname." Signal `rawServers = signal<Host[]>()` named "Servers." Variable `selectedServerForEdit: Host`. Methods `onServerDialogClose()`, `onServerSaved()`.
  **Resolution:** Align with the chosen canonical term (Host or Server).
  **Impact:** All signal names, method names, and template references must be updated.

- **components/platform-management/upsert-server-dialog/upsert-server-dialog.component.ts:7,16,28,40-41,131,137,154,202,249,259,266-267** —
  Directory named `upsert-server-dialog`. Dialog title "Edit/Add Server." Label "Hostname *" (consistent). Label "Server Type *" (inconsistent). Input `server = input<Host>()`. Class `UpsertServerDialogComponent`. Calls `updateServer()`, `createServer()`.
  **Resolution:** Align directory, class, dialog title, and form labels with chosen convention.
  **Impact:** File rename. All importers of this component break. UI text changes.

- **components/platform-management/upsert-deployment-dialog/upsert-deployment-dialog.component.ts:39-42,123,130,146,177,181,186,215** —
  Label "Server *" with dropdown showing `hostname`. Signal `servers = signal<Host[]>()`. Field `serverId`. Variable `hosts: Host[]` then assigned with `getServers()`.
  **Resolution:** Align field name and labels with chosen convention.
  **Impact:** Form field rename. Template must match.

- **services/service-mesh.service.ts:10,48,69,104,152,172-173,335,346,355,402,454,456** —
  Uses `Server` model from `service-mesh.model.ts`. Signal `_servers = signal<Server[]>()`. Method `fetchServers()`. URL `/api/v1/servers`. Summary keys `totalServers`, `activeServers`.
  **Resolution:** After the `Server`/`Host` model merge, update all references.
  **Impact:** Automatic — follows the model rename.

- **components/service-mesh/service-mesh.component.html:29-30** —
  Label "Total Servers." Summary field `totalServers`.
  **Resolution:** Update UI label to match chosen convention.
  **Impact:** UI text change only.

- **services/registry-server-provider.service.ts:181-188,397-403** —
  Tree nodes named "Servers" and "Server Types." Operation `manage-servers`.
  **Resolution:** Update tree node labels to match chosen convention.
  **Impact:** Tree node name change — path-based navigation may be affected.

---

## Quantified Summary

| Where | "Host" Usage | "Server" Usage | Conflict? |
|-------|:-----------:|:-------------:|:---------:|
| Java entity class | ✅ `Host.java` | ❌ | Class is Host |
| DB table | ❌ | ✅ `servers` | Table is servers |
| API path | ❌ | ✅ `/api/v1/servers` | Path is servers |
| API method names | ❌ | ✅ `getServers()` | Methods use Server |
| Java field names (Deployment) | ❌ | ✅ `server: Host` | Type vs name clash |
| Seed JSON file | ❌ | ✅ `servers.json` | File is servers |
| Frontend model (platform-mgmt) | ✅ `Host` | ❌ | One model uses Host |
| Frontend model (service-mesh) | ❌ | ✅ `Server` | Conflicting model |
| UI tab name | ❌ | ✅ "Servers" | Tab is Servers |
| UI dialog title | ❌ | ✅ "Edit/Add Server" | Dialog is Server |
| UI form labels | Mixed | Mixed | "Hostname" vs "Server Type" |
| Component directory name | ❌ | ✅ `upsert-server-dialog/` | Dir is server |
| Service mesh labels | ❌ | ✅ "Total Servers" | Label is Servers |
| Tree node labels | ❌ | ✅ "Servers", "Server Types" | Nodes are Server |

**The fix is to pick one canonical term.** Since the Java entity is `Host`, the table, path, methods, models, and UI should align to "Host." Concept C becomes: Host entity → `hosts` table → `/api/v1/hosts` → "Hosts" UI → HostType → "Add Host" → "Total Hosts." This is the direction with fewer changes since the entity class name drives the naming and the table/path would change to match it.
