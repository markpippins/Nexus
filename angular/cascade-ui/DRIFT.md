# DRIFT.md — cascade-ui Client vs cascade-srv API Mismatches

**Date:** 2026-07-23
**Compared:** `src/app/cascade.service.ts` ↔ `nexus/typescript/cascade-srv/src/routes.ts`
**Status:** 1 medium, 8 correct endpoints

---

## Global Observations

| Axis | Client | Backend |
|---|---|---|
| Base URL | `http://localhost:3106/cascade` | Express mounts at `/cascade` on port 3106 ✅ |
| HTTP library | Angular `HttpClient` (Observables) | Express `Router` (direct JSON) |
| Response types | Typed interfaces (`CascadeEvent`, `EventsResponse`, etc.) | Raw PostgreSQL `Row[]` (`Record<string, any>`) |

---

## Endpoint-by-Endpoint Drift

### `GET /events` — List Events

| Aspect | Client (`getEvents()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/events` | `/events` | ✅ |
| Query params | `type`, `source`, `aggregate_id`, `limit`, `offset` | `type`, `source`, `aggregate_id`, `aggregate_type`, `correlation_id`, `since`, `until`, `limit` (default:50, max:200), `offset` (default:0) | ❌ Client missing: `aggregate_type`, `correlation_id`, `since`, `until` |
| Response wrapper | `EventsResponse { events: CascadeEvent[], total, limit, offset }` | `{ events: Row[], total, limit, offset }` | ✅ Structure matches |
| `limit` default | Not specified by client | `50` | ⚠️ Client doesn't enforce defaults — relies on caller |

### `GET /events/:id` — Single Event

| Aspect | Client (`getEvent()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/events/{id}` | `/events/:id` | ✅ |
| Response | `CascadeEvent` | `Row` (single pg row) | ✅ Shape matches |

### `GET /events/:id/lineage` — Event Causation Chain

| Aspect | Client (`getEventLineage()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/events/{id}/lineage` | `/events/:id/lineage` | ✅ |
| Query params | `maxDepth` (passed) | `maxDepth` (default:10, max:20) | ✅ |
| Response | `LineageChainResponse { anchor, chain: ChainEvent[], depth }` | `{ anchor, chain: Row[], depth }` | ✅ Structure matches |

### `GET /events/:id/children` — Child Events

| Aspect | Client (`getEventChildren()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/events/{id}/children` | `/events/:id/children` | ✅ |
| Response | `ChildrenResponse { parent: string, children: ChildEvent[] }` | `{ parent: string, children: Row[] }` | ✅ |

### `GET /lineage` — Graph Lineage

| Aspect | Client (`getLineageGraph()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/lineage` | `/lineage` | ✅ |
| Query params | `root`, `maxDepth` | `root` (or `anchor`), `maxDepth` (default:5, max:15), `edgeType` (default:'caused_by') | ❌ Client missing: `edgeType` param |
| Response | `LineageResponse { root, direction, nodes, edges, truncated }` | `{ root, direction: 'forward'\|'backward', nodes: Object[], edges: Object[], truncated: boolean }` | ✅ Structure matches |

### `GET /analytics` — Analytics

| Aspect | Client (`getAnalytics()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/analytics` | `/analytics` | ✅ |
| Query params | `range` | `range` (e.g. '1h','24h','7d','30d'; default:'24h'), `granularity` ('minute','hour','day'; default:'hour') | ❌ Client missing: `granularity` param |
| Response | `AnalyticsResponse { range, granularity, totalEvents, throughput[], timeline[], pipelineFunnel, topSources[] }` | `{ range, granularity, totalEvents, throughput: Object[], timeline: Object[], pipelineFunnel: Object, topSources: Object[] }` | ✅ Structure matches |

### `GET /subscribers` — Subscribers

| Aspect | Client (`getSubscribers()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/subscribers` | `/subscribers` | ✅ |
| Response | `SubscribersResponse { subscribers: Subscriber[] }` | `{ subscribers: Object[] }` | ✅ Structure matches |

### `GET /assessments` — Assessments

| Aspect | Client (`getAssessments()`) | Backend | Verdict |
|---|---|---|---|
| Path | `/assessments` | `/assessments` | ✅ |
| Query params | `outcome`, `event_id`, `limit`, `offset` | `outcome`, `event_id`, `limit` (default:50, max:200), `offset` (default:0) | ✅ |
| Response | `AssessmentsResponse { assessments: Assessment[], total, limit, offset }` | `{ assessments: Object[], total, limit, offset }` | ✅ |

---

## Medium

### M1 — Missing Endpoints in Client

The backend exposes 3 endpoints that the client does not call:

| Endpoint | Purpose | Client Impact |
|---|---|---|
| `GET /subscribers/:pattern` | Single subscriber detail | Subscriber detail view would show partial data |
| `PATCH /subscribers/:pattern` | Update subscriber (e.g., `enabled`) | No UI for toggling subscriber state |
| `GET /health` | Service health check | No health indicator in UI |

**Remediation:** Add `getSubscriber(pattern)`, `updateSubscriber(pattern, enabled)`, and `getHealth()` methods. Low priority since these don't break existing functionality.

---

## Correct Endpoints (no changes needed)

| Method | Verdict |
|---|---|
| `getEvents()` | ✅ Structure and field names align |
| `getEvent()` | ✅ Single event matches |
| `getEventLineage()` | ✅ Chain structure matches |
| `getEventChildren()` | ✅ Parent/children structure matches |
| `getLineageGraph()` | ✅ Graph structure matches (missing `edgeType` is low-impact) |
| `getAnalytics()` | ✅ Analytics structure matches (missing `granularity` is low-impact) |
| `getSubscribers()` | ✅ Subscriber structure matches |
| `getAssessments()` | ✅ Assessment structure and pagination match |

---

## Type Drift (`cascade.service.ts`)

No critical field-level drifts detected. All client interfaces are structurally compatible with the backend's raw row responses. The main risk is that `Row[]` from PostgreSQL can contain snake_case columns that the client's camelCase interfaces may not map directly — but since `cascade-srv` likely returns camelCase (common Express/TS convention), this is likely fine.

---

## Summary

| Priority | Area | Changes |
|---|---|---|
| **Low** | Missing params | Add `aggregate_type`, `correlation_id`, `since`, `until` to `getEvents()` |
| **Low** | Missing endpoints | Add `getSubscriber()`, `updateSubscriber()`, `getHealth()` |
| **None** | Type drift | No field-level mismatches detected |
