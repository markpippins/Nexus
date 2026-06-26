# Operator Plane Gap Analysis

**Author:** Analyst  
**Date:** 2026-06-15  
**Status:** First pass — direct inspection of operator plane code and WRP pipeline state  

---

## 1. Executive Summary

The Nexus repository contains **two independent architectural stacks** that share a
common namespace but have no operational bridge between them.

| Stack | Status | Codebase |
|-------|--------|----------|
| **Service Mesh / Operator Plane** | Active, partially working | `jvm/spring/*` + `angular/nexus-console/` |
| **WRP Pipeline** | Aspirational specs + temporary Conduit scaffolding | `.agent/docs/*` + `.conduit-data/` |

**Critical finding:** The operator plane manages service infrastructure (registry,
health, deployments). The WRP pipeline manages work execution (plans, WorkRequests,
receipts). Neither system knows the other exists. An operator seeing a degraded
service in the Nexus Console cannot generate a WorkRequest to fix it. A WorkRequest
executing in Conduit cannot update the service registry.

**This is the integration gap that Atten and the Canonicalizer/Commit layer are
designed to bridge.**

---

## 2. Stack 1: Service Mesh / Operator Plane

### 2.1 JVM/Spring Backend

Three primary Spring Boot services, all at Java 21 / Spring Boot 3.5.0:

| Service | Port | Role | Status |
|---------|------|------|--------|
| **Service Registry** | 8085 | Central registry: register, heartbeat, evict, discover | ✅ Working (auto-registration for Quarkus only) |
| **Topology Server** | 8084 | Broker/registry profiles, MySQL-backed config store | ✅ Working (replaces IndexedDB) |
| **Broker Gateway** | 8081 | Request routing, orchestration, load balancing | ✅ Working |

Under `jvm/spring/service-broker/` there are **24 sub-modules**:

```
broker-service/           broker-service-spi/        broker-gateway/
broker-gateway-sec-bot/   broker-discovery-service/  file-service/
file-service-api/         login-service/             losm-host-service/
note-service/             search-service/            upload-service/
user-access-service/      user-service/              admin-logging/
```

Most of these are **skeleton modules** — the package structure and POM exist but
they are not consistently auto-registering with the Service Registry. Only the
Quarkus gateway (`jvm/quarkus/broker-gateway/`) has working auto-registration
with heartbeats.

### 2.2 Angular Nexus Console

**Location:** `angular/nexus-console/`  
**Framework:** Angular 20.3 (standalone components, signals, zoneless)  
**Port:** 3060  
**Components:** 58  
**Services:** 48  

#### What works:

- **Host profile management** — Add/edit/delete/activate host server profiles
- **Platform Management CRUD** — Full create/read/update/delete for Services,
  Frameworks, Deployments, Hosts, Operating Systems, Environments, Data Dictionary
- **Service Mesh polling** — Fetches services/frameworks/servers/deployments
  from the active host profile every 10 seconds
- **Service graph** — Three.js 3D visualization (uses backend data now)
- **Visual editor** — Component creator and registry integration
- **Gateway management** — Gateway profile CRUD with connect/disconnect
- **Host server management** — Multi-host connectivity with active profile
- **File explorer** — Dual-pane tree navigation with folder operations
- **Chat, notes, RSS, terminal, image serving, multi-source search**

#### What's explicitly broken (per `SYSTEM_ARCHITECTURE_ANALYSIS.md`):

- **Service mesh treated as file system** — `RegistryServerProvider.getChildren()`
  returns host profiles as tree nodes instead of actual service instances.
  Service topology is mapped into a file-explorer paradigm.
- **No service dependency graph** — The `ServiceDependency` model exists but
  dependency edges are never fetched or rendered in the 3D graph.
- **No service operations** — Models define `ServiceOperation` (start/stop/restart/
  scale) but no UI or backend wiring implements them.
- **No real-time health** — WebSocket integration exists in models but no
  backend endpoint broadcasts service health updates.
- **Incomplete registration** — Only Quarkus gateway auto-registers. Spring Boot,
  Node.js, Python services do not.

### 2.3 Architecture Pattern

```
┌───────────────────────────────────────────┐
│  Nexus Console (Angular, :3060)           │
│  Tree · Graph · 3D · CRUD · Terminal     │
└─────────────────┬─────────────────────────┘
                  │ HTTP (fetch + poll, 10s)
┌─────────────────▼─────────────────────────┐
│  Topology Server (Spring, :8084)          │
│  Broker profiles · Registry profiles      │
│  MySQL-backed config persistence          │
└─────────────────┬─────────────────────────┘
                  │
┌─────────────────▼─────────────────────────┐
│  Service Registry (Spring, :8085)         │
│  /api/registry/register                   │
│  /api/registry/renew                      │
│  /api/registry/services                   │
│  /api/services/{id}/operations            │
└─────────────────┬─────────────────────────┘
                  │
┌─────────────────▼─────────────────────────┐
│  Broker Gateway (Spring :8081 / Q :8090)  │
│  Request routing · Service discovery      │
│  Load balancing · Circuit breaker         │
└─────────────────┬─────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
 File Svc   Login Svc     Search Svc
 (TBD)       (TBD)         (TBD)
```

---

## 3. Stack 2: WRP Pipeline

### 3.1 Aspirational Layer (`.agent/docs/`)

18 specification documents covering the intended WorkRequest Pipeline:

| Document | Subject |
|----------|---------|
| `WORKREQUEST_SPEC.md` | WorkRequest IR (274 lines) |
| `OBSERVATION_MODEL.md` | Phase 3 observation layer |
| `COMPILER_ARCHITECTURE.md` | Overall compiler design |
| `EXECUTION_GRAPH_SCHEMA.md` | ExecutionGraph IR |
| `PHASE1_SPECIFICATION_COMPILER.md` | Prompt → WorkRequestGraph |
| `PHASE2_EXECUTION_RUNTIME.md` | ExecutionGraph → EventLog |
| *(12 more)* | Various specs |

> Note: `graph/atten-spec.md` and `graph/schema/projection-algebra.md` were
> moved from `.agent/docs/` to `graph/` during v0.2. They are IR-level
> concepts and belong in the graph directory.

All remaining `.agent/docs/` specs carry the disclaimer:
> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

### 3.2 Active Scaffolding (`.conduit-data/`)

| Area | Contents |
|------|----------|
| **graph/IMPLEMENTATION_PLANS/pending/** | 16 plans (mostly e2e tests) |
| **graph/IMPLEMENTATION_PLANS/completed/** | 1 plan (0074-response-indicators) |
| **INSPECTIONS/** | Errors, warnings, triage, resolved, unresolved dirs (all empty) |
| **CHANGES/** | Pending, reviewed, committed, flagged dirs |
| **PROMPTS/** | 22 archived prompts |
| **SESSIONS/** | 307 session logs |

### 3.3 Active Runtime

- **Conduit Python** (`python/conduit/`) — Cron-driven WorkRequest processor
- **Conduit MCP** (`typescript/conduit-mcp/`, port 3100) — MCP server for state management
- **Nebula** (`typescript/nebula-srv/`, port 3101) — RMS server

### 3.4 Architecture Pattern

```
┌───────────────────────────────────────────┐
│  .agent/docs/ (aspirational specs)       │
│  Defines what the system SHOULD become   │
└─────────────────┬─────────────────────────┘
                  │ (no code)
┌─────────────────▼─────────────────────────┐
│  Conduit (active scaffolding)             │
│  Python cron + TypeScript MCP server      │
│  Processes WorkRequests, manages state    │
└─────────────────┬─────────────────────────┘
                  │
┌─────────────────▼─────────────────────────┐
│  .conduit-data/ (operational state)       │
│  Plans · Prompts · Sessions · Inspections │
└─────────────────┬─────────────────────────┘
                  │
┌─────────────────▼─────────────────────────┐
│  16 pending implementation plans          │
│  (mostly e2e tests, no active Builder)   │
└───────────────────────────────────────────┘
```

---

## 4. The Integration Gap

### 4.1 Current Disconnect

```
OPERATOR PLANE              WRP PIPELINE
(manages services)         (manages work)
                           │
  Service Registry         │  Conduit MCP
  HTTP :8085               │  HTTP :3100
                           │
  Nexus Console            │  .conduit-data/
  Angular :3060            │  plans/ prompts/ sessions/
                           │
  Topology Server          │  .agent/docs/
  MySQL-backed             │  aspirational specs
                           │
      ║                           ║
      ║      NO BRIDGE EXISTS     ║
      ║                           ║
      ▼                           ▼
```

**Consequences of the gap:**

1. **No infrastructure-as-work** — An operator seeing a failed service cannot
   translate "restart service X" into a WorkRequest that flows through planning,
   execution, and receipt.

2. **No state feedback** — A WorkRequest that deploys a new version cannot
   update the Service Registry with the new deployment record.

3. **No observational loop** — The 307 session logs and 22 archived prompts
   in `.conduit-data/` are disconnected from the service topology that the
   Nexus Console displays.

4. **Two databases, no sync** — Service Registry uses H2/MySQL. Conduit uses
   PostgreSQL. Neither knows the other's schema.

### 4.2 What Each Side Needs From The Other

| Operator Plane Needs From WRP | WRP Pipeline Needs From Operator |
|------------------------------|----------------------------------|
| Convert operator intent into WorkRequests | Canonical infrastructure state to project over |
| Track execution status of infrastructure changes | Service health as an observational signal |
| Show plan/receipt history for each service | Deployment records as committed state |
| Surface PEB invariants during service config | Registry topology as Atten input |

---

## 5. Atten as the Bridge

The Atten spec (`../graph/atten-spec.md`) defines Atten as a **multi-state
projection generator** that reads canonical state and emits candidate projections.
It is NOT a brain, cognitive layer, or deterministic reducer.

### 5.1 How Atten Bridges the Gap

```
Service Registry (canonical infrastructure state)
       ↓ reads
  Atten generators (parallel, independent)
       ├── atten::health.projector    — projects health trends from heartbeat history
       ├── atten::topology.projector  — projects dependency graph from registry
       ├── atten::anomaly.detector    — projects anomaly signals from metrics
       ├── atten::deployment.projector— projects deployment readiness from state
       └── atten::impact.analyzer     — projects blast radius of proposed changes
       ↓ emit
  ProjectionEnvelope[] (candidate projections, uncommitted)
       ↓
  Canonicalizer / Commit Layer (does not exist yet)
       ↓ resolves, selects, commits
  Canonical State (updated)
       ↓ consumed by
  ├── Planner (generates WorkRequests for infrastructure changes)
  ├── Nexus Console (visualizes projections and committed state)
  └── PEB (validates invariants on transitions)
```

### 5.2 Concrete Example

**Scenario:** Nexus Console shows service `api-gateway` with health status DOWN.

**Today:** Operator sees a red icon. Nothing happens automatically. No work
item is created. No record exists that this degradation was observed.

**With Atten bridge:**

1. `atten::anomaly.detector` reads Service Registry state (api-gateway: DOWN)
2. It emits a projection: `{ type: "anomaly", candidate: { service: "api-gateway", severity: "critical" }, confidence: 0.95 }`
3. `atten::impact.analyzer` reads dependency graph, emits a projection:
   `{ type: "relationship", candidate: { affected: ["frontend", "mobile"], blast_radius: "high" } }`
4. Canonicalizer collects both projections, resolves them into a single
   commitment: `{ action: "escalate", service: "api-gateway", priority: "P0" }`
5. Planner reads the updated canonical state, generates a WorkRequest:
   "Investigate and resolve api-gateway degradation"
6. Conduit/Temporal executes the WorkRequest
7. Result updates the Service Registry with remediation records

---

## 6. Missing Layers

### 6.1 Canonicalizer / Commit Layer

**Status:** Does not exist. Not designed. Not implemented.

This is the critical missing piece between Atten's projections and committed
canonical state. It must:

- Collect projections from all Atten generators for a cycle
- Resolve conflicts between competing projections
- Validate selected projections against PEB invariants and RCL constraints
- Commit state deltas to the canonical store
- Record resolution decisions (accepted/rejected/merged)
- Emit commitment events to the Event Log

### 6.2 Canonical State Store

**Status:** Does not exist. Not designed. Not implemented.

There is currently no single canonical state store. The Service Registry (port
8085) holds service topology. Conduit's PostgreSQL holds plan/ticket/session
state. They are independent databases with no unified schema.

A canonical state store would need to:

- Unify infrastructure state (services, deployments, hosts) with pipeline state
  (WorkRequests, receipts, projections)
- Provide snapshot-isolation reads for Atten generators
- Accept atomic commits from the Canonicalizer
- Support cursor tracking to the event log

### 6.3 Service ↔ Pipeline Bridge

**Status:** Code exists on both sides but is not connected.

The Nexus Console talks to the Service Registry. Conduit talks to PostgreSQL
via MCP. Neither knows about the other. Building the bridge requires:

- Adding a service registry client to Conduit (or exposing registry state
  through the MCP server)
- Adding pipeline state queries to the Nexus Console (or exposing plan/receipt
  data through the topology server)
- Either approach requires schema alignment or a translation layer

### 6.4 Auto-Registration for All Services

**Status:** Only Quarkus gateway implements auto-registration. Spring Boot,
Node.js, Python, and Go services do not register with the Service Registry.

The `SYSTEM_ARCHITECTURE_ANALYSIS.md` already specifies the pattern — a
`ServiceRegistrar` component that fires on `ApplicationReadyEvent` and sends
POST to `/api/registry/register` with heartbeat renewal. This pattern needs
implementation across all 24 service-broker modules and all polyglot services.

---

## 7. Recommendations

### 7.1 Short-Term (Unblock the Pipeline)

1. **Design the Canonicalizer/Commit Layer** — This is the hardest architectural
   problem and the prerequisite for everything else. Without it, Atten's
   projections are unactionable. Start with a spec document in `graph/`.

2. **Connect Nexus Console to `.conduit-data/` at the query level** — The
   simplest bridge: expose plan/session/receipt counts through the Topology
   Server API so the Nexus Console can show "16 pending plans" alongside
   service health. No schema changes required.

3. **Implement auto-registration for Spring Boot services** — The `ServiceRegistrar`
   pattern from `SYSTEM_ARCHITECTURE_ANALYSIS.md` is clearly specified.
   Implement it for the Broker Gateway first, then the remaining 23 modules.

### 7.2 Medium-Term (Build the Bridge)

4. **Implement the first Atten generator** — Start with the simplest:
   `atten::priority.router` which reads the pending plans queue and projects
   an execution order. This is a pure deterministic projection and avoids the
   complexity of inference-based generators.

5. **Design the Canonical State Store schema** — A unified schema that maps
   service registry concepts (services, deployments, hosts) to pipeline concepts
   (WorkRequests, receipts, projections). This is a data modeling exercise
   before any code is written.

6. **Add service operation endpoints to Service Registry** — The model has
   `ServiceOperation` but no implementation. Add start/stop/restart endpoints
   so the Nexus Console can emit operation requests that become Atten input.

### 7.3 Long-Term (Full Integration)

7. **Wire Atten → Canonicalizer → Planner as a feedback loop** — Full pipeline:
   operator action → state change → Atten projection → Canonicalizer resolution
   → Planner WorkRequest → Conduit execution → Service Registry update →
   Nexus Console visualization.

8. **Migrate Conduit state to the Canonical State Store** — Eventually the
   `.conduit-data/` flat files and Conduit's PostgreSQL should be subsumed by
   the canonical store, eliminating the third authority (file system state).

---

## 8. Directory Map of Findings

| Path | What It Is | Status |
|------|-----------|--------|
| `jvm/spring/service-registry/` | Central registry (port 8085) | ✅ Working |
| `jvm/spring/terrain/` | Infrastructure topology server (port 8084) | ✅ Working |
| `jvm/spring/service-broker/` | 24 microservice modules | ⚠️ Mostly skeletons |
| `angular/nexus-console/` | Operator UI (port 3060, 58 components) | ✅ Working, has gaps |
| `graph/atten-spec.md` | Atten spec | ✅ Spec written |
| `graph/schema/projection-algebra.md` | Projection Algebra family spec | ✅ Spec written |
| `.agent/docs/*.md` | 18 other aspirational specs | ✅ Specs exist |
| `graph/IMPLEMENTATION_PLANS/` | 16 pending plans | ⏸ Idle (no Builder) |
| `.conduit-data/INSPECTIONS/` | Error/warning/triage system | Empty |
| `ANALYSIS.md` | 11-transcript architectural synthesis (v2) | ✅ Complete |
| `ARCHITECTURE.md` | Service topology and port assignments | ✅ Complete |

---

## 9. Key Insight

The system has a **reverse maturity problem** compared to most platforms:

- The **aspirational architecture** (WRP pipeline, Atten, Canonicalizer, PEB)
  is well-documented across 19 specs and 1453 lines of analysis
- The **working code** (service mesh, operator console) is disconnected from
  the architecture
- The **bridge** (Canonicalizer, canonical state store, service↔pipeline
  integration) doesn't exist at any level — not even as a spec

Most systems have working code without architecture. This system has
architecture without working code in the pipeline domain, and working code
without architecture in the operator domain. Bridging them is the
architectural challenge.

---

## Appendix A: Throttler — The Original Project

### A.1 Identity

**Throttler** was the original project that evolved into the Nexus Console.
Its scope is a subset of the Nexus Console's **first tab** (the file explorer
and search view). Throttler's core concern: bringing cached search results
into view within the context of a remote filesystem.

### A.2 Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    NEXUS CONSOLE — FIRST TAB                   │
│                   (inherited from Throttler)                   │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  File Explorer (dual-pane tree navigation)              │  │
│  │  · Browse remote filesystem                             │  │
│  │  · Magnetize folders (create .magnet sentinel file)     │  │
│  │  · Search across magnetized folders                     │  │
│  │  · View cached results in context of filesystem         │  │
│  └────────────────────────┬────────────────────────────────┘  │
│                           │                                    │
│  ┌────────────────────────▼────────────────────────────────┐  │
│  │  the "Idea Stream" (search result stream)               │  │
│  │  · Only active for magnetized folders                   │  │
│  │  · Displays cached search results in filesystem context │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### A.3 The Magnet Mechanism

"Magnetizing" a folder is Throttler's central concept. The mechanism is
simple and elegant:

1. **User marks a folder as "magnetized"** via the file explorer context
   menu or toolbar button
2. **A sentinel file `.magnet`** is created in that folder on the remote
   filesystem
3. **The UI detects `.magnet` files** during directory listing
   (`remote-file-system.service.ts` line 84-98) and sets `isMagnet = true`
   on the node
4. **Magnetized folders are subject to search** — they appear in the search
   index and results are returned via the stream
5. **The `.magnet` file is hidden** from the file listing (filtered out at
   line 68-69 of `remote-file-system.service.ts`)
6. **The `.magnet` is a regular file** — it moves/copies/deletes with its
   parent folder naturally since it lives inside it

The magnet is **just a file**. No database, no registry, no special state.
It's a pure filesystem-level marker — a design that requires zero
synchronization (the 3-authority problem eliminated at the concept level).

### A.4 Service Dependencies

Throttler depends on exactly four backend services:

| Service | Location | Port | Role |
|---------|----------|------|------|
| **file-service** | `jvm/spring/service-broker/file-service/` | TBD | Token-authenticated file operations (list, CD, mkdir, rm, create, delete, rename, copy, hasFile, hasFolder). Consumed via broker-gateway. |
| **search-service** | `jvm/spring/service-broker/search-service/` | TBD | Full-text search across indexed entities. Faceted filtering, relevance ranking, fuzzy search. Consumed via broker-gateway. |
| **file-system-server** | `typescript/file-system-server/` | 4040 | Static file serving and filesystem operations (ls, cd, mkdir, rmdir, newfile, deletefile, rename, copy, move, hasfile, hasfolder). Main backend for the file explorer. |
| **image-server** | `typescript/image-server/` | 9081 | Static image serving. Searches multiple folder locations (device/, logo/, ui/shared/, ui/3d-fluency/, etc.) for requested image files across SVG, PNG, JPG, GIF formats. |
| **Moleculer search** | `moleculer/search/` | 4050 | Modular search providers. Google Custom Search via `google-search.service`. Auto-registers with Service Registry with 30-second heartbeats. |

**Communication flow:**

```
Nexus Console (Angular, :3060)
       │
       ├──POST /fs ─────────────────────────► file-system-server (:4040)
       │   { alias, path, operation }          raw filesystem ops
       │
       ├──POST /api/files/* ─────────────────► file-service (via broker :8081)
       │   { token, path, operation }           authenticated file ops
       │
       ├──POST /api/search ──────────────────► search-service (via broker :8081)
       │   { query, filters, page }             search index queries
       │
       ├──GET /{image} ──────────────────────► image-server (:9081)
       │                                        static image assets
       │
       └──POST /api/search/simple ───────────► Moleculer search (:4050)
           { query, token }                     via broker-gateway lookup
```

### A.5 What Throttler Was (and Wasn't)

| Aspect | Throttler | Nexus Console |
|--------|-----------|---------------|
| **Scope** | Remote file browsing + search | Full service mesh management + file browsing + search |
| **Concept** | Magnetized folders as search targets | Same, plus platform management, 3D graph, service operations |
| **Backend** | file-service, search-service, file-system-server, image-server, Moleculer search | Same + service-registry, terrain, all broker modules |
| **UI** | File explorer + search stream | File explorer + service mesh + graph + CRUD + terminal + chat + RSS |
| **State** | Filesystem as state (.magnet sentinel) | Filesystem + Service Registry DB + IndexedDB + Topology Server MySQL |

Throttler's design philosophy — **use the filesystem as the state mechanism**
(the `.magnet` file approach) — is a practical example of the "eliminate
authorities, don't synchronize them" principle from the architecture analysis.
Instead of maintaining a database of "which folders are searchable," Throttler
uses the presence of a file. This means the state is inherently correct —
it cannot drift from reality.

### A.6 Relevance to Atten and the Pipeline

> **⚠️ Deprecation notice (v0.2):** This section frames Throttler as "a
> concrete example of Atten." This is structurally incorrect. Atten and
> Throttler are **siblings** in the Projection Algebra — different projection
> operators at different layers, not parent and child. Neither is the
> archetype for the other. See **A.7** below for the corrected framing,
> and **`../graph/schema/projection-algebra.md`** for the unified operator family.

Throttler's magnet mechanism is a concrete example of the kind of **state
projection** that Atten would generate — but it is **not** "an Atten
projection." It is a **Throttler projection** — a different operator at
a different domain (filesystem scope vs. semantic canonical state):

- **Canonical state:** The filesystem tree with `.magnet` sentinel files
- **Atten projection:** "These folders are magnetized and available for search"
- **Consumed by:** The search service and Idea Stream UI

In the full pipeline, Atten would project over the magnetized state and the
search index to produce projections like:
- "Magnetized folder X has not been searched in 7 days" (staleness projection)
- "Magnetized folder Y has results that match active WorkRequest Z" (relevance projection)
- "The search index for folder W is 30% out of date" (index health projection)

These projections would flow through the Canonicalizer to produce committed
state updates (e.g., "trigger re-index of folder W") that the Planner could
then convert into WorkRequests.

### A.7 Corrected Framing — Projection Algebra Siblings

> **Architectural correction (v0.2):** The original framing in A.6 treated
> Throttler as a concrete instance of Atten-style projection. This is
> incorrect. The following replaces that framing.

**Throttler** and **Atten** are different projection operators in the
**Projection Algebra** (see `../graph/schema/projection-algebra.md`). They act
at different layers, on different source domains, with different output
consumers.

| Operator | Domain | Source | Consumer | Via Canonicalizer? | Code? |
|----------|--------|--------|----------|-------------------|-------|
| **Throttler** | Physical (filesystem scope) | Filesystem tree, `.magnet` sentinels | UI (Idea Stream), Search indexer | No | ✅ |
| **Atten** | Semantic (canonical state) | Canonical state store | Canonicalizer / Commit Layer | **Yes** | ❌ |

**Why Throttler is not an "Atten projection":**

1. **Different source domain** — Throttler reads the raw filesystem tree.
   Atten reads canonical state (which is committed, post-resolution).

2. **Different consumer** — Throttler projects directly to the UI (the Idea
   Stream) and Search indexer. Atten projects to the Canonicalizer, which
   resolves conflicts and commits state before anything is consumed.

3. **Different mechanism** — Throttler uses a simple sentinel file check
   (does `.magnet` exist?). Atten uses parallel generators (inference,
   deterministic, hybrid) producing typed projection envelopes.

4. **Different projection type** — Throttler's projection is binary: a folder
   is magnetized or it isn't. Atten's projections are typed: state_transition,
   inference, classification, relationship, priority_ordering, anomaly.

**What they share:**

- Both are members of the Projection Algebra
- Both read from a bounded source domain and emit typed projections
- Both are independent — neither waits for the other
- Both are constrained by PEB invariants (when PEB exists)

**Correct re-statement of the example in §6:**

Atten *may* project over the results of Throttler's (and Search's, and
Nebula's) outputs **after** they have been consumed and committed to the
canonical state store — but Throttler itself is not "an Atten projection."

For the magnet example specifically:

- **Throttler** projects: "folder X has a `.magnet` file → it is in scope for search"
- **Search** projects: "query 'foo' returns results R1, R2, R3 from indexed folders"
- **Atten** (separately, in a different domain) projects: "Search index for folder W is 30% out of date"

These three operators each read different source domains and emit different
projection types. They are siblings, not a pipeline.

**Reference:** See `../graph/schema/projection-algebra.md` §3 for the full
comparison matrix of all six defined projection operators (Throttler, Atten,
Nebula, Search, WorkRequest, PEB).

---

## Appendix B: Implications from New Transcripts (June 15, 2026)

> **Notice:** This appendix is additive. It records architectural implications
> from 8 new ChatGPT transcripts discovered in `dev/chats/` during the second
> analysis pass.

### B.1 XIL Semantic Firewall (Transcript: `dev/chats/Buzzwords by Layer.html`)

**Relevance to the operator plane:** The XIL (External Intelligence Layer)
defines how external actors participate in the system without corrupting
internal invariants. For the operator plane specifically:

- Operator console inputs (service commands, configuration changes) would flow
  through XIL transformations before reaching the canonical state that the
  pipeline reads
- The quarantine mechanism means malformed operator commands are preserved
  for later analysis, not silently dropped
- The operator plane's event normalization must align with XIL's three-stage
  model: Parsing (Signal → Event candidate) → Projection (Event →
  system-compatible form) → Validation (Candidate → committed event)

### B.2 Authority Arbitration Layer (Transcript: `dev/chats/CCNF Normalization vs Parsing.html`)

**Relevance to the operator plane:** The CCNF transcript defines an Authority
Arbitration Layer (AAL) that sits between Envelope → CEI. This maps to the
operator plane's need for:

- **Context Scope Tokens** — workspace_root and authority_domains with weights
  that prevent global ontology (Nexus architecture) from dominating local
  execution context
- **Span-level provenance** — `origin_domain: LOCAL_REPO | IMPORTED_ARCH | GLOBAL_KNOWLEDGE`
  so operator plane actions are tagged by source authority
- **Bounded PLAN_MODE** — the operator plane's planning mode should scope to
  LOCAL_REPO spans, not implicitly import the full Nexus ontology

### B.3 Conduit RGEM Inversion (Transcript: `dev/chats/Conduit RGEM Spec.html`)

**Relevance to the operator plane:** The RGEM inversion means operator plane
services become participants in the Conduit runtime:

- Service Registry (port 8085) becomes a lookup-space provider
- Nexus Console (port 3060) becomes a projection-space consumer
- Operator actions (restart, scale, deploy) become transforms validated by PEB
- The bridge (section 4 of this analysis) is the missing link — the RGEM
  framing gives it a concrete architectural rationale

### B.4 Hash→Lookup→Projection Identity Model (Transcript: `dev/chats/System Accretion Cascade.html`)

**Relevance to the operator plane:** The three-layer identity model clarifies
how operator plane events relate to pipeline projections:

| Layer | Operator Plane Role | Pipeline Role |
|-------|--------------------|---------------|
| **Hash space** | Service IDs, deployment hashes | WorkRequest IDs, receipt hashes |
| **Lookup space** | Service Registry state, topology | Canonical state store |
| **Projection space** | Nexus Console views, 3D graph | Atten projections, Planner output |

Operator plane events (service state changes) are lookup-space data. Pipeline
projections and console views are projection-space interpretations of that
data. They never share a storage authority — they share identity via hashes.

### B.5 Progressive Instrumentation (Transcripts: `Model Role Assignment.html`, `Nexus development focus.html`)

**Relevance to the operator plane:** The Scaffold UI's progressive epistemic
instrumentation (tickets, receipts, circuit breakers, kill switches, pause/
resume, session review, real-time logs, token tracking, plan reset) is the
pattern the operator plane should follow:

- Add execution receipts to service operations (start/stop/restart)
- Add circuit breakers to service mesh polling
- Add pause/resume to operator-initiated deployments
- Add proposed receipts as evidence-backed work items

### B.6 References

- `dev/chats/Buzzwords by Layer.html` — XIL definition
- `dev/chats/CCNF Normalization vs Parsing.html` — AAL definition
- `dev/chats/Conduit RGEM Spec.html` — Conduit 2.0 inversion
- `dev/chats/System Accretion Cascade.html` — identity model
- `dev/chats/Model Role Assignment.html` — progressive instrumentation
- `dev/chats/Nexus development focus.html` — proposed receipts
- `../graph/schema/projection-algebra.md` Appendix B — XIL mapping
- `../graph/schema/projection-algebra.md` Appendix C — identity model
- `../graph/peb-mcp-spec.md` Appendix A — RGEM validation
