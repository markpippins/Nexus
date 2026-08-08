# Drift Report: Mock Backend vs Real REST APIs (Dual-Backend)

**Generated:** 2026-07-27 (updated 2026-07-30)
**Scope:** `nexus/angular/conduit-ui/` (mock backend) vs two live backends

---

## ⚡ Status Update: 2026-07-30 — Major drift reduction

Since the original drift report was filed on 2026-07-27, the following has been
implemented by the Engineer to close the gap between this UI and the real conduit
backends:

### Implemented

| Feature | Details |
|---------|---------|
| **CONDUIT_LIVE_MODE** | `.env` flag (`CONDUIT_LIVE_MODE=true`) enables live backend proxying. Default: `false` (mock mode). |
| **Dual-mode proxy in `server.ts`** | Mock routes wrapped in `if (!LIVE_MODE)`. Live mode adds fetch-based proxy middleware that routes requests to the correct backend based on path prefix. |
| **Backend routing** | `/state`, `/delta`, `/replay`, `/admin`, `/api/sessions`, `/api/breaker`, `/api/receipts`, `/healthz`, `/readyz`, `/metrics` → conduit-mcp :3100. `/health`, `/workflows`, `/tickets`, `/tokens`, `/config`, `/governance`, `/vision`, `/log` → conduit-srv :3104. |
| **SSE streaming proxy** | `/log/:sessionId` uses Node's `http.request()` with pipe-through (not fetch) so SSE log chunks stream in real-time from conduit-srv :3104. Includes client-disconnect abort and backend error handling. |
| **Shared `filterHeaders()`** | Hop-by-hop header stripping (`host`, `connection`, `transfer-encoding`, `content-length`) extracted into shared helper used by both proxy functions. |
| **Client auto-detection** | `apiService.initializeMode()` fetches `/api/status` on mount; if `liveMode: true`, disables mock so all fetches hit the proxy → real backends. |
| **Mode-based port selection** | Mock mode → port **3000**. Live mode → port **4201**. `server.ts` selects automatically: `const PORT = LIVE_MODE ? 4201 : 3000`. No PORT override needed in `.env` or systemd. |

### Drift findings RESOLVED (from the 2026-07-27 REVISED report)

| Original Finding | Resolution |
|------------------|------------|
| **CRITICAL-1:** Not wired to any conduit backend | ✅ `apiService.ts` now has live-fetch paths for all routes, with fallback to localStorage on error |
| **CRITICAL-2:** conduit-srv routes invisible | ✅ Dedicated apiService methods for all conduit-srv routes: workflows, tickets, tokens, config, governance, vision |
| **HIGH-1:** Decoupled from conduit infrastructure | ✅ Full dual-backend topology mirrored in apiService + server.ts proxy |
| **HIGH-2:** `WRP_KERNEL_URL` references :3103 (not running) | ⚠️ Partially — `/api/status` still shows :3103 as informational. Python conduit is not running; state inspection routes proxy to conduit-mcp :3100 instead |
| **HIGH-3:** No proxy rule for conduit-srv | ✅ Proxy middleware routes conduit-srv paths to :3104 |
| **MED-1:** `/log/:sessionId` had no backend | ✅ SSE streaming proxy to conduit-srv :3104 with real-time pipe-through |

### Remaining gaps

- **Python conduit (:3103) is not running** — state inspection routes proxy to conduit-mcp :3100 instead, which covers `/state` but not the full Python conduit API surface (delta ingestion, replay, admin identities).
- **Pipeline workflow endpoints** (harvest → candidate → intent → requirement → spec → deliberation → plan) still have no real backend equivalent in either conduit-mcp or conduit-srv — they remain mock-only.
- **`useMock` defaults to localStorage preference** — if a user previously toggled mock on, that persists across sessions even if the server is in live mode. The client respects the server's `liveMode` signal on first mount but retains user override.

### How to test

```bash
# Mock mode (default) — port 3000
curl http://localhost:3000/api/status  # → liveMode: false
curl http://localhost:3000/state        # → mock data (kernel_version: 42)

# Live mode — set CONDUIT_LIVE_MODE=true in .env, restart, then:
curl http://localhost:4201/api/status  # → liveMode: true
curl http://localhost:4201/state        # → real pipeline data from conduit-mcp :3100
curl http://localhost:4201/workflows    # → real data from conduit-srv :3104
```

---

## Original Report (2026-07-27)
**Backends:**
| Backend | Port | Stack | Role |
|---------|------|-------|------|
| **Python Kernel Runtime** | `:3103` | FastAPI (Python) | Kernel state machine: delta ingestion, state inspection, replay, admin identities, sessions, breaker, DB-backed receipts |
| **TypeScript conduit-srv** | `:3104` | Express (TypeScript) | REST API extracted from conduit-mcp: workflows, tickets, tokens, config, governance events, vision work-requests, vision receipts, session log SSE |

> **Note:** As of 2026-07-26, several API calls previously served by the Python conduit were migrated to the TypeScript `conduit-srv` as part of the Architect's "No SQL in MCP Servers" mandate. The Python conduit retains the kernel state machine; `conduit-srv` owns workflow/ticket/token/config/governance/vision REST surface.

### Migration Summary (What Moved)

| Category | From (Python conduit) | To (conduit-srv :3104) |
|----------|----------------------|------------------------|
| Workflows | — (did not exist) | `GET /workflows` — sessions-as-workflows for UI |
| Ticket detection | — (did not exist) | `POST /tickets/detect` + `GET /tickets/lineage/:planId` |
| Token reporting | — (did not exist) | `GET /tokens/plan/:planId`, `/role/:role`, `/ticket/:ticketId` |
| Cron config | — (was env-var only) | `GET /config/cron` |
| Failure recovery config | `GET/POST /api/breaker/failure-recovery` (still on :3103) | `GET/POST /config/failure-recovery` (mirrored copy on :3104) |
| Governance events | — (did not exist) | `POST /governance/replay` + `GET /governance/events` |
| Work requests | — (did not exist) | `POST/GET /vision/work-requests` — new surface |
| Vision receipts | — (was DB-only) | `GET /vision/receipts?planId=` — read-only query |
| Session log SSE | — (was in conduit-mcp) | `GET /log/:sessionId` — extracted from conduit-mcp |

> **What stayed in Python conduit (:3103):** Delta ingestion, state inspection, replay, admin identities, sessions CRUD, circuit breaker, DB-backed receipts with write support (POST, DELETE).

---

## Executive Summary

The conduit-ui frontend mock backend and the two real backends are built around **fundamentally different domain models**. The mock backend models a **pipeline workflow** (Harvest → Candidate → Intent → Requirement → Spec → Deliberation → Plan → WorkRequest), while the real backends provide:

- **Python conduit (3103):** A **deterministic state machine** (KernelDelta ingestion, state inspection, replay, identity graph, and DB-administration endpoints).
- **TypeScript conduit-srv (3104):** A **REST API surface** for workflows, tickets, tokens, config, governance, vision work-requests, and vision receipts — extracted from conduit-mcp.

There is **zero API surface overlap** between the mock and either real backend.

---

## 1. Architecture Difference

| Aspect | Mock Backend (conduit-ui) | Python conduit (3103) | TypeScript conduit-srv (3104) |
|--------|--------------------------|----------------------|------------------------------|
| **Storage** | `localStorage` seeded from `mockData.ts` | PostgreSQL (`conduit`/`kernel`/`vision` schemas) + in-memory engine | PostgreSQL (`conduit`/`vision`/`peb`/`tackle` schemas) |
| **Auth** | None | Optional `X-API-Key` header | None |
| **Metrics** | None | Prometheus (`/metrics`) | None (health only) |
| **Error Envelope** | Throws JS Errors | Standardized `{"error":{"code":"...","message":"..."}}` | Plain `{"ok":false,"error":"..."}` or `{"error":"..."}` |
| **Middleware** | None | CORS, auth, request timing metrics | CORS, JSON body parsing (2MB limit) |
| **Persistence** | Volatile (browser storage) | Durable (PostgreSQL + delta log) | Durable (PostgreSQL) |
| **State Model** | CRUD pipeline artifacts | Deterministic state machine via kernel deltas | Query/command over relational schemas |

---

## 2. Dual-Backend Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        conduit-ui (Angular)                       │
│                    mock backend (localStorage)                     │
└──────────────────────────┬───────────────────────────────────────┘
                           │ live mode (planned)
                           ▼
     ┌─────────────────────┴─────────────────────┐
     │                                           │
     ▼                                           ▼
┌──────────────────────┐               ┌──────────────────────┐
│  Python conduit      │               │  TypeScript           │
│  (FastAPI, :3103)    │               │  conduit-srv          │
│                      │               │  (Express, :3104)     │
├──────────────────────┤               ├──────────────────────┤
│ • Delta ingestion    │               │ • Workflows           │
│ • State inspection   │               │ • Ticket detect       │
│ • Replay engine      │               │ • Ticket lineage      │
│ • Admin identities   │               │ • Token usage         │
│ • Sessions (full)    │               │ • Cron config         │
│ • Circuit breaker    │               │ • Failure recovery    │
│ • DB-backed receipts │               │ • Governance events   │
│ • Health/readiness   │               │ • Vision work-reqs    │
│ • Prometheus metrics │               │ • Vision receipts     │
│                      │               │ • Session log SSE     │
└──────────────────────┘               └──────────────────────┘
```

---

## 3. Endpoint Comparison

### 3.1 Endpoints Unique to Mock Backend (No Real Equivalent)

These endpoints exist **only** in the conduit-ui mock (`apiService.ts` / `localStorage`):

| Endpoint | Description | Why No Real Equivalent |
|----------|-------------|----------------------|
| `getHarvests()` / `addHarvest()` | HTML transcript harvest CRUD | Harvest pipeline is in conduit-mcp, not either REST backend |
| `getCandidates()` / `addCandidate()` | Candidate item CRUD | Same — conduit-mcp domain |
| `promoteCandidateToIntent()` | Candidate → Intent promotion | Orchestration step, not a single REST endpoint |
| `getIntents()` / `promoteIntentToRequirement()` | Intent CRUD + promotion | Same |
| `getRequirements()` / `canonicalizeRequirement()` | Requirement CRUD + canonicalization | Same |
| `getCanonicalSpecs()` | System specification artifacts | Same |
| `getDeliberationAgendas()` / `createDeliberationAgenda()` | Deliberation agenda management | Same |
| `addDeliberationVote()` | Multi-agent consensus voting | Same |
| `promoteAgendaToPlan()` | Agenda → Plan promotion | Same |
| `updatePlanStatus()` | Plan lifecycle transitions | Real API determines plan status from receipt chain (WRP state machine) |
| `getWorkRequests()` / `dispatchWorkRequest()` / `completeWorkRequest()` | DCO work request lifecycle | **Now partially available** via conduit-srv `POST/GET /vision/work-requests` |
| `getKernelDeltas()` / `addKernelDelta()` | WRP Kernel delta event log | Python conduit `POST /delta` — but with very different payload structure |
| `getSystemNodes()` | System hierarchy tree | Python conduit identity graph (`GET /state/graph`) — different model |
| `getModelChains()` / `updateModelChain()` | Per-role model chain configuration | tackle-mcp (port 3400), not either conduit backend |

### 3.2 Endpoints in Python conduit (3103)

> **Auth:** Optional `X-API-Key` header on all endpoints **except** the public paths: `/`, `/healthz`, `/readyz`, `/metrics`, `/state/health`, `/docs`, `/redoc`, `/openapi.json`. Auth is disabled by default — enabled only when `KERNEL_API_KEYS` or `KERNEL_API_KEY` env var is set.

**System (all public, no auth):**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service root (name, version, docs URL) |
| `GET` | `/healthz` | Liveness probe → `{"status":"alive"}` |
| `GET` | `/readyz` | Readiness probe (DB + engine check) |
| `GET` | `/metrics` | Prometheus metrics |

**Delta Ingestion:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/delta` | Ingest a KernelDelta through reduce pipeline |
| `GET` | `/delta/state` | Kernel state summary from delta perspective |

**State Inspection:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/state` | Inspect kernel state (summary/full) |
| `GET` | `/state/identity/{id}` | Resolve identity with graph edges |
| `GET` | `/state/receipt/{receipt_id}` | Get single receipt |
| `GET` | `/state/receipts-by-plan/{plan_num}` | Receipts by plan |
| `GET` | `/state/graph` | Cross-plan graph (paginated) |
| `GET` | `/state/plan/{plan_num}` | Plan detail with receipt timeline + WRP state |
| `GET` | `/state/health` | Health check |
| `GET` | `/state/lineage` | Lineage event log |

**Replay:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/replay` | Reconstruct kernel state via KSRA |
| `GET` | `/replay/compare` | Compare live vs reconstructed state |

**Admin:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/identities` | List identities (paginated) |
| `PATCH` | `/admin/identities/{id}` | Update identity metadata |
| `DELETE` | `/admin/identities/{id}` | Remove identity from engine |
| `GET` | `/admin/consistency` | Engine↔delta-store alignment check |

**Sessions:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `GET` | `/api/sessions/running` | Running sessions only |
| `GET` | `/api/sessions/stale` | Detect stale sessions |
| `GET` | `/api/sessions/{id}` | Get single session |
| `PATCH` | `/api/sessions/{id}/cost` | Update session cost |
| `POST` | `/api/sessions/{id}/heartbeat` | Update session heartbeat |
| `POST` | `/api/sessions/{id}/kill` | Kill a running session |

**Circuit Breaker:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/breaker` | Get breaker state |
| `POST` | `/api/breaker/trip` | Trip breaker |
| `POST` | `/api/breaker/reset` | Reset breaker + abandoned tickets |
| `POST` | `/api/breaker/pause` | Pause conduit orchestration |
| `POST` | `/api/breaker/resume` | Resume conduit orchestration |
| `GET` | `/api/breaker/failure-recovery` | Get failure recovery config |
| `POST` | `/api/breaker/failure-recovery` | Save failure recovery config |

**DB-backed Receipts:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/receipts/{plan_id}` | Formatted plan receipts |
| `GET` | `/api/receipts/{plan_id}/raw` | Raw receipt rows |
| `GET` | `/api/receipts/{plan_id}/latest-type` | Latest receipt type |
| `POST` | `/api/receipts` | Insert a receipt |
| `DELETE` | `/api/receipts/{plan_id}` | Delete receipts by type |

### 3.3 Endpoints in TypeScript conduit-srv (3104)

> **Auth:** None — all endpoints are public.
>
> ⚠️ **Error envelope warning:** Unlike Python conduit's consistent `{"error":{"code":"...","message":"..."}}` shape, conduit-srv uses **three different error formats** across routes:
> - `{"ok":false,"error":"..."}` (vision, governance)
> - `{"error":"..."}` (tickets, tokens, session-log, config)
> - `{"status":"error","error":"..."}` (health only)
>
> Off-network UI integrators must handle all three formats when parsing error responses.

**Workflows:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/workflows` | Active sessions as workflow objects (post-Temporal removal) |

**Tickets:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tickets/detect` | Detect stale (6h) and expired tickets |
| `GET` | `/tickets/lineage/{planId}` | Ticket audit trail for a plan |

**Tokens:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tokens/plan/{planId}` | Total tokens used by plan |
| `GET` | `/tokens/role/{role}` | Total tokens used by role (builder/reviewer/planner/critic) |
| `GET` | `/tokens/ticket/{ticketId}` | Tokens used for a specific ticket |

**Config:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/config/cron` | Pipeline cron interval |
| `GET` | `/config/failure-recovery` | Circuit breaker failure recovery config |
| `POST` | `/config/failure-recovery` | Update failure recovery config |

**Governance:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/governance/replay` | Backfill governance events from receipts |
| `GET` | `/governance/events` | List governance events (optional planId/eventType filters) |

**Vision (Work Requests & Receipts):**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/vision/work-requests` | Create or upsert a work request (atomic upsert by `id`) |
| `GET` | `/vision/work-requests` | List work requests (optional `?status=` filter) |
| `GET` | `/vision/work-requests/{id}` | Get single work request by wr_id |
| `GET` | `/vision/receipts` | List receipts for a plan (`?planId=` required) — **read-only** |

**Session Log:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/log/{sessionId}` | SSE stream of live session logs |

**Health:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | DB connectivity check + service status |
| `GET` | `/` | Service root with endpoint listing |

---

## 4. Data Model Drift

### 4.1 TypeScript Types (Mock) vs Real Backends

| TypeScript Entity (conduit.ts) | Python conduit (3103) | TypeScript conduit-srv (3104) | Drift |
|-------------------------------|----------------------|------------------------------|-------|
| `HTMLHarvest` | None | None | No real equivalent |
| `CandidateItem` | None | None | No real equivalent |
| `IntentRecord` | None | None | No real equivalent |
| `RequirementSpec` | None | None | No real equivalent |
| `SystemCanonicalSpec` | None | None | No real equivalent |
| `DeliberationAgenda` | None | None | No real equivalent |
| `ImplementationPlan` | `GET /state/plan/{plan_num}` | None | Mock: rich object with cost/token/chain/receipts. Real: plan profiles with receipt timeline + WRP state derived from receipt chain |
| `WorkRequestDCO` | None | `POST/GET /vision/work-requests` | **New overlap!** conduit-srv stores work requests in `vision.work_requests` with `wr_id`, `work_request_uuid`, `dco_json`, `context`, `status`, `title` |
| `WRPKernelDelta` | `POST /delta` (KernelDelta domain object) | None | Mock: 7 flat fields. Real: domain object with `receipts`, `affected_plans`, `invalidated_plans` sets |
| `SystemNode` | `GET /state/graph` (identity graph) | None | Mock: static tree. Real: dynamically built from identity engine |
| `ModelChainConfig` | None | None | tackle-mcp (3400), not either conduit backend |
| `SystemStatus` | `/healthz`, `/readyz`, `/state` | `/health` | Complete reshape needed |
| `Receipt` (embedded in Plan) | `GET /state/receipt/{id}` + `GET /api/receipts/{plan_id}` | `GET /vision/receipts?planId=` | Mock: 6 fields. Python: 10+ columns. conduit-srv: 10 columns (id, plan_id, type, agent_role, session_id, ticket_id, artifact_path, summary, metadata_json, tokens_used, created_at, sequence) |

### 4.2 Key Structural Differences

1. **Plans**: Mock embeds receipt chains inside plans (`ImplementationPlan.receipts[]`). Both real backends store receipts separately. Python conduit derives plan status from the kernel's WRP state machine. conduit-srv queries `vision.receipts` directly.

2. **State Determination**: Mock uses explicit `plan.status` field. Python conduit derives plan state from the *last receipt type* via `RECEIPT_TO_WRP_STATE` mapping — status is never stored directly.

3. **Work Requests**: **New in conduit-srv.** The `POST /vision/work-requests` endpoint does an atomic upsert by `wr_id` (ON CONFLICT), supporting idempotent submission from the Python LOSM bridge. Returns `{"ok":true, "action":"created"|"updated"}`.

4. **Receipts**: Now served by **both** backends — but with a critical asymmetry:
   - **Python conduit (`/api/receipts`):** Full CRUD — `GET` (formatted/raw/latest-type), `POST` (insert), `DELETE` (by type). **Read + write.**
   - **conduit-srv (`/vision/receipts`):** Query-only — `GET` with `?planId=` required. **Read-only.**
   
   If the UI needs to insert or delete receipts, it must target Python conduit. For read-only display, either backend works.

5. **Sessions vs Workflows**: Python conduit manages full session lifecycle (CRUD, heartbeat, kill). conduit-srv maps running sessions into workflow objects via `GET /workflows` for the UI.

6. **Identities**: Entirely absent from mock. Python kernel has identity engine with graph edges. No equivalent in conduit-srv.

---

## 5. Integration Path

### 5.1 What Already Works (Via `server.ts`)

- `GET /api/status` → returns mock system status
- `GET /api/healthz` → returns mock health

### 5.2 What Needs Bridging

The frontend's `apiService.ts` uses **localStorage** for all data operations. Live mode (`setMockMode(false)`) currently only reads `/api/status`. To fully integrate:

1. **Map pipeline workflow endpoints** (harvest → candidate → intent → requirement → spec → deliberation → plan) to conduit-mcp's HTTP API (`localhost:3100`). These are in **neither** backend.

2. **Map kernel endpoints** (delta, state, replay, sessions, breaker) to the Python Kernel Runtime (`localhost:3103`).

3. **Map operational endpoints** (workflows, tickets, tokens, config, governance, vision work-requests, vision receipts) to conduit-srv (`localhost:3104`).

4. **Replace localStorage reads** with fetch calls to the appropriate backend, with local fallback if the backend is offline.

5. **Add API key authentication** to frontend requests if Python conduit is deployed with `KERNEL_API_KEYS` configured.

---

## 6. Recommended Actions

| Priority | Action | Why |
|----------|--------|-----|
| **P0** | Bridge `GET /vision/work-requests` to mock `getWorkRequests()` | conduit-srv now has a real work-request endpoint — first overlap achieved |
| **P1** | Update `server.ts` to proxy both backends (3103 + 3104) | Current proxy only has 2 stub endpoints |
| **P1** | Create a bridge layer mapping mock entities to real domain types | Mock `ImplementationPlan` ≠ kernel plan ≠ conduit-srv receipt rows |
| **P2** | Add `/api/receipts/*` (Python), `/vision/receipts` (conduit-srv), and `/api/breaker/*` proxy routes | These are the most mature real-API endpoints across both backends |
| **P3** | Add backend selector + endpoint documentation to frontend | Developers need to know which backend serves which endpoints |

---

## Appendix A: Envelope Shapes

> This appendix is designed for off-network UI developers who cannot access the codebase or running endpoints. All shapes shown are the **actual wire format** returned by each backend.

### A.1 Python conduit (3103) — Standard Error Envelope

All errors use a consistent JSON envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Identity not found: plan_9999",
    "details": null
  }
}
```

| HTTP Code | Error Code | Meaning |
|-----------|-----------|---------|
| 401 | `UNAUTHORIZED` | Missing or invalid `X-API-Key` header |
| 404 | `NOT_FOUND` | Resource not found |
| 422 | `VALIDATION_ERROR` | Request body validation failed |
| 500 | `INTERNAL_ERROR` | Server-side processing error |
| 503 | `SERVICE_UNAVAILABLE` | Database or engine not ready |

### A.2 Python conduit (3103) — Success Envelopes

**System:**
```
GET /                          → {"service":"WRP Kernel Runtime","version":"0.1.0","docs":"/docs"}
GET /healthz                   → {"status":"alive"}
GET /readyz                    → {"status":"ready","kernel_version":42}
```

**Delta:**
```
POST /delta
  Request:  {"delta_id":"...","batch_id":"...","receipts":[{...}],"affected_plans":[...],"invalidated_plans":[...]}
  Success:  {"success":true,"version":43,"delta_id":"...","plan_count":12,"receipt_count":87,"error":null}
  Failure:  {"success":false,"version":0,"delta_id":"...","plan_count":0,"receipt_count":0,"error":"Invalid receipt type..."}
GET /delta/state               → {"version":42,"plan_count":12,"receipt_count":87,"identity_count":15,"graph_edge_count":34,"lineage_event_count":87}
```

**State:**
```
GET /state?view=summary        → {"kernel_version":42,"plan_count":12,"receipt_count":87,"identity_count":15,"graph_edge_count":34,"lineage_event_count":87,"delta_log_count":42}
GET /state?view=full           → (all above) + {"state":{...full serialized state...}}
GET /state/health              → {"status":"ok","kernel_version":42}
GET /state/identity/{id}       → {"id":"iden::plan_0053","aliases":["plan_0053","0053"],"label":"Plan 0053","edges_outgoing":[...],"edges_incoming":[...]}
GET /state/receipt/{id}        → {"id":"RCP-...","receipt":{...receipt object...}}
GET /state/receipts-by-plan/{n}→ {"plan_num":"plan_0053","receipts":[...],"count":2}
GET /state/plan/{n}            → {"plan_num":"plan_0053","identity_id":"...","aliases":[...],"label":"...","receipt_count":2,"current_wrp_state":"PLANNING","valid_transitions":["EXECUTING","CANCELLED","ARCHIVED"],"receipts":[...],"edges_outgoing":[],"edges_incoming":[]}
GET /state/lineage             → {"events":[{...}],"count":1}
```

**Replay:**
```
GET /replay?version=42         → {"version":42,"plan_count":12,"receipt_count":87,"identity_count":15,"graph_edge_count":34,"lineage_event_count":87,"reconstructed_from_version":42}
GET /replay/compare?version=N  → {"match":true,"live_version":42,"replay_version":42,...,"diffs":[]}
```

**Admin:**
```
GET /admin/identities          → {"identities":[{...}],"total":15,"cursor":"...","limit":50}
PATCH /admin/identities/{id}
  Request:  {"label":"New Label","aliases":["a","b","c"]}
  Response: {"id":"iden::plan_0053","label":"New Label","aliases":["a","b","c","plan_0053"],"updated":true}
DELETE /admin/identities/{id}  → {"ok":true,"identity_id":"iden::plan_0053"}
GET /admin/consistency         → {"aligned":true,"engine_version":42,"delta_log_version":42,...}
```

**Sessions:**
```
GET /api/sessions?running_only=true  → list of session objects
GET /api/sessions/running            → alias for above
GET /api/sessions/stale?threshold_seconds=3600 → list of stale sessions
GET /api/sessions/{id}              → single session object
PATCH /api/sessions/{id}/cost       Request: {"cost_usd":1.50}
POST /api/sessions/{id}/heartbeat   Request (optional): {"role":"builder","state":"running","detail":"...","pid":12345}
POST /api/sessions/{id}/kill        → {"killed":true,"sessionId":"sess-1234","pids":[12345],"errors":[],"timestamp":"..."}
```

**Breaker:**
```
GET /api/breaker                      → {"tripped":false,"paused":false,"retry_after":1800,"source":"","error":"","detail":"","tripped_at":null,"max_retries_per_model":3,"retry_delay_seconds":120,"max_fallbacks":3,"push_back_to_pending":true}
POST /api/breaker/trip    Request:    {"reason":"BUDGET_EXCEEDED","detail":"Budget reached","retryAfter":3600}
POST /api/breaker/reset               → reset confirmation
POST /api/breaker/pause               → pause confirmation
POST /api/breaker/resume              → resume confirmation
GET /api/breaker/failure-recovery     → same shape as GET /api/breaker config fields
POST /api/breaker/failure-recovery    Request: {"max_retries_per_model":5,"retry_delay_seconds":300,...}
```

**DB Receipts (Python):**
```
GET /api/receipts/{plan_id}         → list of formatted receipt objects
GET /api/receipts/{plan_id}/raw     → list of raw DB rows
GET /api/receipts/{plan_id}/latest-type → {"plan_id":"plan_0053","latest_type":"PLAN_CREATE"}
POST /api/receipts
  Request:  {"id":"RCP-...","plan_id":"plan_0053","type":"PLAN_CREATE","agent_role":"planner","session_id":"...","ticket_id":"...","artifact_path":"...","summary":"...","metadata_json":"...","tokens_used":1500,"created_at":"..."}
  Response: {"ok":true,"id":"RCP-...","plan_id":"plan_0053"}
DELETE /api/receipts/{plan_id}?types=PROPOSED,PLANNING → {"deleted":2,"plan_id":"plan_0053","types":["PROPOSED","PLANNING"]}
```

### A.3 TypeScript conduit-srv (3104) — Success/Error Envelopes

**Error shape (all routes):**
```json
// Most routes:
{"ok": false, "error": "Missing required field: id"}

// Some routes (tickets, tokens, session-log):
{"error": "Invalid plan ID"}

// 503 health failure:
{"status": "error", "error": "connection refused"}
```

**Workflows:**
```
GET /workflows
→ {
    "connected": true,
    "counts": {"running": 2, "completed": 0, "failed": 0, "cancelled": 0, "total": 2},
    "workflows": [
      {
        "workflowId": "plan-plan_0053-builder",
        "runId": "sess-abc123",
        "status": "running",
        "startTime": "2026-07-27T10:00:00Z",
        "closeTime": null,
        "planId": "plan_0053",
        "role": "builder",
        "pid": 12345
      }
    ]
  }
```

**Tickets:**
```
POST /tickets/detect
→ {"detected": true, "stale": 2, "expired": 1, "timestamp": "2026-07-27T..."}

GET /tickets/lineage/{planId}
→ {
    "plan_id": "plan_0053",
    "tickets": [
      {
        "id": "TCK-2026-0075",
        "role": "builder",
        "status": "claimed",
        "tokens_used": 1500,
        "parent_ticket_id": null,
        "spawn_reason": null,
        "replacement_of": null,
        "closure_reason": null,
        "created_at": "2026-07-27T...",
        "closed_at": null
      }
    ]
  }
```

**Tokens:**
```
GET /tokens/plan/{planId}
→ {"plan_id": "plan_0053", "total_tokens": 4500, "receipts": 3}

GET /tokens/role/{role}             (valid roles: builder, reviewer, planner, critic)
→ {"role": "builder", "total_tokens": 12800, "receipts": 12}

GET /tokens/ticket/{ticketId}
→ {"ticket_id": "TCK-2026-0075", "tokens_used": 1500}
```

**Config:**
```
GET /config/cron
→ {"cron": "*/3", "intervalMinutes": 3, "description": "Every 3 minutes", "timestamp": "..."}

GET /config/failure-recovery
→ {"max_retries_per_model":3,"retry_delay_seconds":120,"max_fallbacks":3,"push_back_to_pending":true,"circuit_breaker_retry_after":1800}

POST /config/failure-recovery
  Request:  {"max_retries_per_model": 5, "retry_delay_seconds": 300}
  Response: {"saved": true}
```

**Governance:**
```
POST /governance/replay
→ {"ok": true, "replayed": 42}

GET /governance/events?planId=plan_0053&eventType=receipt:PLAN_CREATE&limit=20
→ {
    "ok": true,
    "events": [
      {
        "id": 1,
        "receipt_id": "RCP-...",
        "event_type": "receipt:PLAN_CREATE",
        "work_request_id": "uuid-...",
        "plan_id": "plan_0053",
        "agent_role": "planner",
        "payload": {"session_id":"...","artifact_path":"...","summary":"...","ticket_id":"...","tokens_used":1500},
        "created_at": "2026-07-27T...",
        "replayed_at": "2026-07-27T..."
      }
    ]
  }
```

**Vision (Work Requests):**
```
POST /vision/work-requests
  Request:  {"id":"plan_0053","work_request_uuid":"uuid-...","dco_json":"{}","context":{"key":"value"},"status":"pending","title":"My Plan"}
  Response: {"ok":true,"id":"plan_0053","work_request_uuid":"uuid-...","action":"created"}
  Note:     idempotent upsert — ON CONFLICT (wr_id) DO UPDATE. action is "created" or "updated".

GET /vision/work-requests?status=pending&limit=10
→ {
    "ok": true,
    "work_requests": [
      {
        "id": 1,
        "wr_id": "plan_0053",
        "work_request_uuid": "uuid-...",
        "dco_json": "{}",
        "context": {"key": "value"},
        "status": "pending",
        "title": "My Plan",
        "recorded_on_dt": "2026-07-27T...",
        "updated_at": "2026-07-27T..."
      }
    ]
  }

GET /vision/work-requests/{id}     (id = wr_id, not DB primary key)
→ {"ok":true,"work_request":{...single work request object...}}

GET /vision/receipts?planId=plan_0053
→ {
    "ok": true,
    "receipts": [
      {
        "id": "RCP-PLAN-0053-1",
        "plan_id": "plan_0053",
        "type": "PLAN_CREATE",
        "agent_role": "planner",
        "session_id": "sess-abc123",
        "ticket_id": "TCK-2026-0075",
        "artifact_path": "IMPLEMENTATION_PLANS/pending/my-plan.md",
        "summary": "Created plan",
        "metadata_json": "{\"key\":\"value\"}",
        "tokens_used": 1500,
        "created_at": "2026-07-27T10:00:00Z",
        "sequence": 1
      }
    ]
  }
```

**Session Log (SSE):**
```
GET /log/{sessionId}
  Content-Type: text/event-stream

  Events:
    data: {"type":"session_log_meta","data":{"sessionId":"sess-abc123","logFileExists":true,"logPath":"..."}}

    data: {"type":"session_log","data":{"sessionId":"sess-abc123","line":"[stdout] Starting plan...","timestamp":"...","logType":"stdout"}}

    data: {"type":"session_log","data":{"sessionId":"sess-abc123","line":"[stderr] Error: ...","timestamp":"...","logType":"stderr"}}

    : keepalive (every 15s)
```

**Health:**
```
GET /health
  Success: {"status":"ok","port":3104,"db":"up","timestamp":"2026-07-27T..."}
  Failure: {"status":"error","error":"connection refused"}

GET /
→ {"name":"conduit-srv","version":"1.0.0","port":3104,"source":"conduit/vision/peb/tackle PostgreSQL schemas","description":"REST API extracted from conduit-mcp per Architect decision (No SQL in MCP Servers)","endpoints":[...]}
```

---

## Appendix B: Quick Reference — Which Backend for What

| UI Concern | Backend | Endpoint |
|-----------|---------|----------|
| Plan detail + WRP state | Python :3103 | `GET /state/plan/{plan_num}` |
| Plan receipts (detailed, read/write) | Python :3103 | `GET/POST/DELETE /api/receipts/...` |
| Plan receipts (basic, read-only) | conduit-srv :3104 | `GET /vision/receipts?planId=` |
| Work request CRUD | conduit-srv :3104 | `POST/GET /vision/work-requests` |
| Token usage by plan/role/ticket | conduit-srv :3104 | `GET /tokens/{plan,role,ticket}/...` |
| Ticket lifecycle + lineage | conduit-srv :3104 | `POST /tickets/detect`, `GET /tickets/lineage/...` |
| Active workflows (sessions→WF) | conduit-srv :3104 | `GET /workflows` |
| Session management (CRUD) | Python :3103 | `GET/POST /api/sessions/...` |
| Circuit breaker | Python :3103 | `GET/POST /api/breaker/...` |
| Failure recovery config | **Both** :3103 + :3104 | `/api/breaker/failure-recovery` + `/config/failure-recovery` |
| Kernel delta ingestion | Python :3103 | `POST /delta` |
| Replay / consistency | Python :3103 | `GET /replay`, `GET /replay/compare` |
| Identity graph | Python :3103 | `GET /state/graph`, `GET /admin/identities` |
| Governance events | conduit-srv :3104 | `GET /governance/events` |
| Live session log tail | conduit-srv :3104 | `GET /log/{sessionId}` (SSE) |
| Pipeline cron interval | conduit-srv :3104 | `GET /config/cron` |
| Model chain config | tackle-mcp :3400 | `GET/POST /config/ai/...` |
| Harvest → Plan pipeline | conduit-mcp :3100 | MCP tools |

---

*End of drift report. For the full Python API specification, see [`nexus/python/conduit/REST-API.md`](../python/conduit/REST-API.md). For conduit-srv source, see [`nexus/typescript/conduit-srv/src/`](../typescript/conduit-srv/src/).*
