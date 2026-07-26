# Drift Report: Mock Backend vs Real REST API

**Generated:** 2026-07-25
**Scope:** `nexus/angular/conduit-ui/` (mock backend) vs `nexus/python/conduit/app/` (FastAPI Kernel Runtime)
**Port:** Mock operates in-memory (localStorage); Real API serves on **`:3103`**

---

## Executive Summary

The conduit-ui frontend and the Python Kernel Runtime API are built around **fundamentally different domain models**. The mock backend models a **pipeline workflow** (Harvest → Candidate → Intent → Requirement → Spec → Deliberation → Plan → WorkRequest), while the real API models a **deterministic state machine** (KernelDelta ingestion, state inspection, replay, identity graph, and DB-administration endpoints). There is **zero API surface overlap** between the two.

---

## 1. Architecture Difference

| Aspect | Mock Backend (conduit-ui) | Real API (Python conduit) |
|--------|--------------------------|--------------------------|
| **Storage** | `localStorage` seeded from `mockData.ts` | PostgreSQL (`conduit` schema) + in-memory engine |
| **Auth** | None | Optional `X-API-Key` header validation |
| **Metrics** | None | Prometheus (`/metrics`) |
| **Error Handling** | Throws JS Errors | Standardized `ErrorResponse` envelope with error codes |
| **Middleware** | None | CORS, auth, request timing metrics |
| **Persistence** | Volatile (browser storage) | Durable (PostgreSQL + delta log) |
| **State Model** | CRUD pipeline artifacts | Deterministic state machine via kernel deltas |

---

## 2. Endpoint Comparison

### 2.1 Endpoints Present in Both (Partial Overlap)

| Endpoint Concept | Mock Backend | Real API | Drift |
|-----------------|-------------|----------|-------|
| System Status | `GET /api/status` (server.ts) | `GET /state` + `GET /healthz` + `GET /readyz` | Mock returns hardcoded PG/wrp/mcp URLs; real API returns kernel version, plan/receipt/identity counts. **Different shape entirely.** |
| Health Check | `GET /api/healthz` (server.ts) | `GET /healthz` | Similar concept, different response shape. Mock: `{status, version}`. Real: `{status: "alive"}` |
| Plan Detail | `getPlans()` → localStorage | `GET /state/plan/{plan_num}` | Mock has `ImplementationPlan` with receipt chain + cost/token/budget fields. Real API computes plan state from kernel's WRP state machine. **No structural overlap.** |
| Receipt Data | Receipts embedded inside `ImplementationPlan` objects | `GET /state/receipt/{receipt_id}`, `GET /state/receipts-by-plan/{plan_num}`, `GET /api/receipts/{plan_id}` | Mock has 4 receipt fields (id, type, hash, prevHash). Real API stores receipts in `vision.receipts` table with metadata, token counts, etc. Real API has richer query surface. |

### 2.2 Endpoints Unique to the Mock Backend

These endpoints exist **only** in the conduit-ui mock (`apiService.ts` / `localStorage`):

| Endpoint | Description | Why No Real Equivalent |
|----------|-------------|----------------------|
| `getHarvests()` / `addHarvest()` | HTML transcript harvest CRUD | Harvest pipeline is in conduit-mcp (TypeScript), not the Python Kernel Runtime |
| `getCandidates()` / `addCandidate()` | Candidate item CRUD | Same — belongs to conduit-mcp's domain |
| `promoteCandidateToIntent()` | Candidate → Intent promotion | Orchestration step not exposed as a single REST endpoint |
| `getIntents()` / `promoteIntentToRequirement()` | Intent CRUD + promotion | Same |
| `getRequirements()` / `canonicalizeRequirement()` | Requirement CRUD + canonicalization | Same |
| `getCanonicalSpecs()` | System specification artifacts | Same |
| `getDeliberationAgendas()` / `createDeliberationAgenda()` | Deliberation agenda management | Same |
| `addDeliberationVote()` | Multi-agent consensus voting | Same |
| `promoteAgendaToPlan()` | Agenda → Plan promotion | Same |
| `updatePlanStatus()` | Plan lifecycle transitions | Real API determines plan status from receipt chain (WRP state machine) |
| `getWorkRequests()` / `dispatchWorkRequest()` / `completeWorkRequest()` | DCO work request lifecycle | Work request execution is handled by `executor_cloud.py` — not a REST API |
| `getKernelDeltas()` / `addKernelDelta()` | WRP Kernel delta event log | Real API uses `POST /delta` but with a very different payload structure |
| `getSystemNodes()` | System hierarchy tree | Not exposed as an API in Python conduit |
| `getModelChains()` / `updateModelChain()` | Per-role model chain configuration | Model config comes from tackle-mcp (port 3400), not conduit |

### 2.3 Endpoints Unique to the Real API

These endpoints exist **only** in the Python FastAPI Kernel Runtime:

| Endpoint | Description | Why No Mock Equivalent |
|----------|-------------|----------------------|
| `POST /delta` | Ingest a KernelDelta through reduce pipeline | Core kernel function — mock has no deterministic engine |
| `GET /delta/state` | Kernel state summary from delta perspective | Same |
| `GET /state` (view=summary/full) | Full kernel state inspection | Same |
| `GET /state/identity/{id}` | Resolve identity with graph edges | Identity graph is kernel-only concept |
| `GET /state/graph` | Cross-plan graph with pagination | Same |
| `GET /state/lineage` | Append-only lineage event log | Same |
| `GET /replay` | Reconstruct kernel state via KSRA | Same |
| `GET /replay/compare` | Compare live vs reconstructed state | Same |
| `GET /admin/identities` | List known identities (paginated) | Same |
| `PATCH /admin/identities/{id}` | Update identity metadata | Same |
| `DELETE /admin/identities/{id}` | Remove identity from engine | Same |
| `GET /admin/consistency` | Engine↔delta-store alignment check | Same |
| `GET /api/sessions` | List all sessions (with filters) | Session management |
| `GET /api/sessions/running` | Running sessions only | Same |
| `GET /api/sessions/stale` | Detect stale sessions | Same |
| `GET /api/sessions/{id}` | Get single session | Same |
| `PATCH /api/sessions/{id}/cost` | Update session cost | Same |
| `POST /api/sessions/{id}/heartbeat` | Update session heartbeat | Same |
| `POST /api/sessions/{id}/kill` | Kill a running session | Same |
| `GET /api/breaker` | Circuit breaker state | Same |
| `POST /api/breaker/trip` | Trip circuit breaker | Same |
| `POST /api/breaker/reset` | Reset breaker + abandoned tickets | Same |
| `POST /api/breaker/pause` | Pause conduit orchestration | Same |
| `POST /api/breaker/resume` | Resume conduit orchestration | Same |
| `GET /api/breaker/failure-recovery` | Failure recovery config | Same |
| `POST /api/breaker/failure-recovery` | Save failure recovery config | Same |
| `GET /api/receipts/{plan_id}` | Formatted plan receipts | Same |
| `GET /api/receipts/{plan_id}/raw` | Raw receipt rows | Same |
| `GET /api/receipts/{plan_id}/latest-type` | Latest receipt type | Same |
| `POST /api/receipts` | Insert a receipt | Same |
| `DELETE /api/receipts/{plan_id}` | Delete receipts by type | Same |
| `GET /metrics` | Prometheus metrics | Same |
| `GET /readyz` | Readiness probe (DB + engine check) | Same |

---

## 3. Data Model Drift

### 3.1 TypeScript Types (Mock) vs Python Types (Real API)

| TypeScript Entity (conduit.ts) | Python Equivalent | Drift |
|-------------------------------|-------------------|-------|
| `HTMLHarvest` | None | No kernel concept |
| `CandidateItem` | None | No kernel concept |
| `IntentRecord` | None | No kernel concept |
| `RequirementSpec` | None | No kernel concept |
| `SystemCanonicalSpec` | None | No kernel concept |
| `DeliberationAgenda` | None | No kernel concept |
| `ImplementationPlan` | Kernel state `plans` | Mock: rich object with cost/token/chain/receipts. Real: plan IDs in kernel state with derived status from receipt chain |
| `WorkRequestDCO` | None (handled by executor) | No REST representation |
| `WRPKernelDelta` | `KernelDelta` (domain model) | Mock: 7 flat fields. Real: domain object with `receipts`, `affected_plans`, `invalidated_plans` sets |
| `SystemNode` | Identity graph | Mock: static tree. Real: dynamically built from identity engine's `_identities` + graph edges |
| `ModelChainConfig` | None | Configured through tackle-mcp, not conduit |
| `SystemStatus` | None | Kernel runtime has different health endpoints |
| `Receipt` (embedded in Plan) | `vision.receipts` table | Mock: 6 fields. Real: 10+ columns including metadata_json, tokens_used, session_id, artifact_path |

### 3.2 Key Structural Differences

1. **Plans**: Mock embeds receipt chains inside plans (`ImplementationPlan.receipts[]`). Real API stores receipts in a separate `vision.receipts` table and derives plan status via the kernel's WRP state machine. There is no single "plan detail" return that matches the mock's structure.

2. **State Determination**: Mock uses explicit `plan.status` field (`PROPOSED | PLANNING | PENDING | ACTIVE | COMPLETED | BLOCKED`). Real API derives plan state from the *last receipt type* via `RECEIPT_TO_WRP_STATE` mapping — the status is never stored directly.

3. **Identities**: Entirely absent from the mock. The real kernel has an identity engine that tracks plans via `identity_id`, `node_id`, aliases, and a typed cross-plan graph.

4. **Deltas**: Mock `WRPKernelDelta` is a simple event log. Real `KernelDelta` is a domain object that drives the reduce pipeline — it contains receipts and plan sets, and its processing can mutate kernel state.

---

## 4. Integration Path

To connect the conduit-ui frontend to the live Python Kernel Runtime API, the following would be needed:

### 4.1 What Already Works (Via `server.ts`)

- `GET /api/status` → returns mock system status
- `GET /api/healthz` → returns mock health

### 4.2 What Needs Bridging

The frontend's `apiService.ts` uses **localStorage** for all data operations and only consults `server.ts` for status/health. Live mode (`setMockMode(false)`) currently only reads `/api/status`. To fully integrate:

1. **Map pipeline workflow endpoints** (harvest → candidate → intent → requirement → spec → deliberation → plan) to conduit-mcp's HTTP API or the MCP server (`localhost:3100`). These are NOT in the Python Kernel Runtime.

2. **Map kernel endpoints** (delta, state, replay, receipts, sessions, breaker) to the FastAPI Kernel Runtime (`localhost:3103`). These have **no mock equivalent** — they're entirely new to the frontend.

3. **Replace localStorage reads** with fetch calls to the appropriate backend, with local fallback if the backend is offline (as `getSystemStatus()` already does).

4. **Add API key authentication** to frontend requests if the kernel is deployed with `KERNEL_API_KEYS` configured.

---

## 5. Recommended Actions

| Priority | Action | Why |
|----------|--------|-----|
| **P0** | Document the real API surface (created as [`REST-API.md`](../python/conduit/REST-API.md)) | ✅ Complete |
| **P1** | Update `server.ts` to proxy kernel API endpoints | The current proxy only has 2 stub endpoints |
| **P1** | Create a bridge layer mapping mock entities to kernel domain types | Mock `ImplementationPlan` ≠ kernel plan |
| **P2** | Add `/api/receipts/*` and `/api/breaker/*` proxy routes to `server.ts` | These are the most mature real-API endpoints |
| **P3** | Add endpoint documentation to the frontend (API docs panel) | Developers need to know which endpoints are mock vs live |

---

*End of drift report. For the full real API specification, see [`nexus/python/conduit/REST-API.md`](../python/conduit/REST-API.md).*
