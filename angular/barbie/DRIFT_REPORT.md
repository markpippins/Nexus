# Barbie ↔ Backend API Drift Report

> **Date:** 2026-07-28 (updated)  
> **Scope:** Discrepancies between barbie's "live" mode REST API expectations and the actual Nexus backend APIs  
> **Goal:** Barbie is slated to replace the nexus-console Service Mesh "console" view — this documents what needs to change before that's possible.  
> **Last change:** `/api/v1/registry/logs` and `/api/v1/registry/metrics` endpoints created (commit `8bb4664`) — Section 6 resolved.

---

## 1. URL Path Prefix — 🔴 CRITICAL

Barbie routes **everything** under `/api/v1/registry/*`. The real backend only puts **systems and registration** endpoints under that prefix — services, frameworks, deployments, servers, and libraries are flat under `/api/v1/*`.

| Entity | Barbie expects | Real backend |
|---|---|---|
| Services | `GET /api/v1/registry/services` | `GET /api/v1/services` |
| Frameworks | `GET /api/v1/registry/frameworks` | `GET /api/v1/frameworks` |
| Deployments | `GET /api/v1/registry/deployments` | `GET /api/v1/deployments` |
| Servers | `GET /api/v1/registry/servers` | `GET /api/v1/servers` |
| Libraries | `GET /api/v1/registry/libraries` | `GET /api/v1/libraries` |
| Systems | `GET /api/v1/registry/systems` | `GET /api/v1/registry/systems` ✅ MATCH |
| Lookups | `GET /api/v1/registry/:type` | `GET /api/v1/service-types`, `/api/v1/server-types` (flat) |
| Register | `POST /api/v1/registry/register` | `POST /api/v1/registry/register` ✅ MATCH |
| Heartbeat | `POST /api/v1/registry/heartbeat/:name` | `POST /api/v1/registry/heartbeat/:name` ✅ MATCH |
| Deregister | `POST /api/v1/registry/deregister/:name/graceful` | Used by `heartbeat-sidecar.py` ✅ MATCH |

**Fix:** Split barbie's `currentBaseUrl` into two — default `/api/v1/registry` for systems/registration, and `/api/v1` for services/frameworks/deployments/servers/libraries/lookups. Or (ideally) route everything through a single `baseUrl` and drop the `/registry` prefix from non-registry entity calls.

---

## 2. ID Type — 🔴 CRITICAL

| | Barbie | Backend |
|---|---|---|
| **ID type** | `string` (`"svc-01"`, `"srv-01"`, `"dep-01"`) | `number` (integer PKs) |

Every `getById`, `update`, `delete` call that passes an ID will fail because the backend expects integers and barbie sends strings. The mock data uses prefixed string IDs (`svc-mock-01`) that have no real equivalent.

**Fix:** Change all ID fields in `types.ts` from `string` to `number`, and update mock data to use numeric IDs.

---

## 3. Response Shape — 🟡 MEDIUM

| Aspect | Barbie expects | Backend returns |
|---|---|---|
| **Pagination meta field** | `totalItems`, `totalPages` | `total`, `last_page`, `per_page` |
| **Array wrapping** | Always `{ data: [...], meta: {...} }` | Sometimes raw array (systems), sometimes wrapped |
| **Systems endpoint** | PaginatedResponse | Raw `Array<System>` (no pagination wrapper) |

Barbie's `PaginatedResponse<T>` interface:
```typescript
{ data: T[]; meta: { page: number; size: number; totalItems: number; totalPages: number } }
```

Backend's `PagedResponse<T>`:
```typescript
{ data: T[]; meta: { page: number; per_page: number; total: number; last_page: number } }
```

**Fix:** Either change barbie to use `per_page`/`total`/`last_page`, or add a normalization layer in `api.ts` that remaps the backend shape to barbie's expected shape. Also handle the raw-array case for systems.

---

## 4. Entity Shape Mismatches — 🔴 CRITICAL

### Services

| Barbie `Service` | Backend `ServiceInstance` |
|---|---|
| `status: HealthStatus` (`'healthy' \| 'degraded'`) | `status: ServiceStatus` (`'ACTIVE' \| 'DEPRECATED' \| 'ARCHIVED'`) |
| `frameworkName: string` (flat) | `framework: Framework` (nested object with `id`, `name`, `category`, `language`) |
| `systemName: string` (flat) | Not present — system linkage is separate |
| `serverHostname: string` (flat) | Not present on ServiceInstance |
| `rps`, `latencyMs`, `errorRate`, `uptimePercent` | Not present — these are runtime metrics, not entity fields |
| `hostedServices: string[]` | Exists as separate endpoint `/api/v1/registry/services/with-hosted` |
| `endpoint: string` | Not present on ServiceInstance |

### Servers

| Barbie `Server` | Backend `Server` |
|---|---|
| `cpuUsage`, `memoryUsage`, `diskUsage` (runtime %) | `cpuCores`, `memory`, `disk` (spec strings) |
| `activePodsCount`, `lastPing` | Not present |
| `serverType: string` | `serverTypeId: number` (FK to lookup) |
| `operatingSystem: string` | `operatingSystemId: number` (FK to lookup) |
| `datacenterRegion: string` | `region: string` |
| `id: string` | `id: number` |

### Deployments

| Barbie `Deployment` | Backend `Deployment` |
|---|---|
| `serviceName: string` (flat) | `service: ServiceInstance` (nested) |
| `clusterName`, `commitHash`, `replicasReady`, `replicasTarget` | Not present |
| `deployedBy`, `deployedAt` | Not present |
| `status: HealthStatus` | `status: DeploymentStatus` + `healthStatus: HealthStatus` |

### Frameworks

| Barbie `Framework` | Backend `Framework` |
|---|---|
| `category: string` (flat) | `category: FrameworkTypeEntity` (nested `{ id, name }`) |
| `language: string` (flat) | `language: FrameworkLanguage` (nested `{ id, name }`) |

**Fix:** Barbie needs a normalization/mapping layer that transforms backend shapes into its expected types. This is the largest change — essentially rewriting `types.ts` to match the real data model, then updating all components to handle nested objects instead of flat strings.

---

## 5. Status Value Mismatches — 🟡 MEDIUM

Barbie uses **lowercase health-status strings** everywhere:

| Barbie | Backend |
|---|---|
| `'healthy'` | `'HEALTHY'` (HealthStatus) / `'ACTIVE'` (ServiceStatus) / `'RUNNING'` (DeploymentStatus) |
| `'degraded'` | `'DEGRADED'` |
| `'critical'` | No equivalent — maps to `'UNHEALTHY'` |
| `'offline'` | `'INACTIVE'` / `'STOPPED'` / `'DECOMMISSIONED'` |

Backend uses **three different enums**: `HealthStatus`, `ServiceStatus`, `DeploymentStatus`, `ServerStatus` — each with different value sets and different semantics.

**Fix:** Barbie's components use string comparisons like `s.status === 'healthy'` extensively. These all need updating to use the correct uppercase enum values, and the status badge logic needs to map between the three backend enums.

---

## 6. Endpoints Barbie Expects That Don't Exist — 🟢 LOW (was 🔴 CRITICAL, then 🟡 MEDIUM)

| Barbie endpoint | Exists? | Notes |
|---|---|---|
| `GET /api/v1/registry/aggregate` | ✅ | Created in commit `b969126`. Returns totals, health breakdown, topology nodes/edges. |
| `GET /api/v1/registry/logs/:type/:id` | ✅ | Created in commit `8bb4664`. Returns 30 simulated log entries with levels, messages, and trace IDs. |
| `GET /api/v1/registry/metrics/:type/:id` | ✅ | Created in commit `8bb4664`. Returns 16-point simulated time-series (CPU, memory, latency, error rate, RPS) over a 15-minute window. |

**Fix (updated):** All three endpoints now exist. Logs and metrics return simulated data — no persistent log/metrics store yet, but the API contract is satisfied. Wire barbie's `getLogs()` and `getMetrics()` to call these directly.

---

## 7. Endpoints Backend Provides That Barbie Is Missing — 🟢 LOW (nice-to-have)

| Backend endpoint | Used by Console for |
|---|---|
| `GET /api/v1/status` | Real-time service health polling |
| `GET /api/v1/status/stream` | SSE health stream |
| `GET /api/v1/services/:id/dependencies` | Service dependency graph |
| `GET /api/v1/deployments/service/:id` | Deployment-per-service view |
| `POST /api/v1/deployments/:id/start` | Operational control |
| `POST /api/v1/deployments/:id/stop` | Operational control |
| `GET /api/v1/visual-components` | Component palette for mesh |

These are operational endpoints the Service Mesh view uses but barbie doesn't call. Not blockers for initial integration, but needed for full feature parity.

---

## 8. Lookup Table Paths — 🟡 MEDIUM

| Barbie path | Backend path |
|---|---|
| `/api/v1/registry/server-types` | `/api/v1/server-types` |
| `/api/v1/registry/environments` | `/api/v1/environments` |
| `/api/v1/registry/operating-systems` | `/api/v1/operating-systems` |
| `/api/v1/registry/service-types` | `/api/v1/service-types` |
| `/api/v1/registry/framework-categories` | `/api/v1/framework-categories` |
| `/api/v1/registry/framework-languages` | `/api/v1/framework-languages` |
| `/api/v1/registry/library-categories` | `/api/v1/library-categories` |
| Not supported | `/api/v1/registry/systems/types` (returns raw array) |

**Fix:** Remove `/registry` prefix from lookup calls, and add support for flat lookup paths per `platform-management.service.ts`'s `getLookupEndpoint()` mapping.

---

## Summary

| # | Category | Severity | Description |
|---|---|---|---|
| 1 | URL prefix | 🔴 CRITICAL | `/api/v1/registry/*` vs `/api/v1/*` for non-system entities |
| 2 | ID type | 🔴 CRITICAL | `string` vs `number` |
| 3 | Response shape | 🟡 MEDIUM | Different pagination field names, raw-array edge cases |
| 4 | Entity shape | 🔴 CRITICAL | Flat strings vs nested objects, missing/extra fields across all entities |
| 5 | Status values | 🟡 MEDIUM | Lowercase `'healthy'` vs uppercase `'HEALTHY'`/`'ACTIVE'`/`'RUNNING'` |
| 6 | Missing backend endpoints | 🟢 LOW | All 3 endpoints resolved — `/aggregate`, `/logs`, `/metrics` now exist |
| 7 | Missing barbie features | 🟢 LOW | No `/status` polling, deployment ops, dependency graph |
| 8 | Lookup paths | 🟡 MEDIUM | Flat `/api/v1/*` vs barbie's `/api/v1/registry/*` |

**Total critical items:** 3  
**Total medium items:** 3  
**Total low items:** 2 (was 1 — logs/metrics resolved)

---

## Recommended Approach

1. **Create an adapter layer** in `src/lib/api.ts` that:
   - Normalizes URL paths (strip `/registry` for service/framework/deployment/server/library/lookup calls)
   - Maps backend response shapes → barbie's expected types
   - Handles ID type conversion (number → string if keeping string IDs, or migrate everything to number)
   - Normalizes pagination field names

2. **Rewrite `types.ts`** to match the real backend data model, then update all components.

3. **Call `getPlatformAggregate()` directly** — the real `/api/v1/registry/aggregate` endpoint now exists in `RegistryController`. Barbie can call it directly instead of computing the aggregate client-side. Note: `avgLatencyMs` and `totalRps` return `0` (runtime metrics not yet wired to Redis).

4. **`/logs` and `/metrics` are now available** — the endpoints exist in `RegistryController` (commit `8bb4664`). Barbie can call them directly in live mode, replacing the mock data.
