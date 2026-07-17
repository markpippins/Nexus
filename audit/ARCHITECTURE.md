# Nexus Architecture

> **Last updated:** 2026-07-12
> **Scope:** All active directories under `nexus/`
> **Canonical source:** PostgreSQL database; this file is a derived projection.
> **Data sources:** Terrain PostgreSQL schema (`mesh-register.py`), nebula-srv REST API, systemd fleet, cron configuration.

---

## Top-Level Directory Map

| Directory | Purpose |
|-----------|---------|
| `schema/` | Canonical JSON schema definitions, capability and workflow schemas |
| `graph/` | Capability registry, projection algebra, IR definitions, knowledge graph |
| `typespec/` | Microsoft TypeSpec API specifications with multi-language code generation |
| `go/` | Go-based WRP (WorkRequest Pipeline) conformance reference implementation |
| `rust/` | Rust-based CCNF verifier for cross-language contract evaluation |
| `tools/` | Code Integrity Runtime (CIR) — ARL linter, governance enforcement |
| `typescript/` | MCP servers, REST API servers, systemd-managed Node.js daemons |
| `jvm/` | Spring Boot services (systemd), Quarkus/Helidon alternate runtimes, Ballerina |
| `python/` | Event pipeline, cognitive runtime, harvest pipeline, TTS, vision LLM, bridge daemon |
| `angular/` | Angular UI frontends (nebula-ui, nexus-console, conduit-ui, tackle-ui) |
| `adonisjs/` | Broker-gateway-proxy (AdonisJS — active, not on critical path) |
| `moleculer/` | Moleculer-based search service (active, not on critical path) |
| `audit/` | Architecture, plans, inspections, specs, harvests, prompts, session records |
| `.agents/` | Agent orchestration, skills, and pipeline configurations |
| `bin/` | Executable scripts — mesh registry, systemd master script, service starters |
| `scripts/` | Utility and automation scripts (cron jobs, Redis/MongoDB starters) |

---

## System Defaults & Conventions

| Setting | Value | Notes |
|---------|-------|-------|
| java.version | 21 | Default for all JVM projects |
| spring-boot.version | 3.4.0–3.5.0 | Default Spring Boot version |
| node.version | 24 | Node.js runtime (via nvm) |
| typescript.version | 5.x | TypeScript (tsx runner) |
| python.version | 3.13 | Default Python version (anaconda3) |
| port.range.backend | 8080-8099 | Preferred range for backend services |
| port.range.frontend | 3000-3999 | Preferred range for frontend/UI dev servers |
| port.range.mcp | 3100-3499 | MCP server port range |
| port.range.python | 8000-8099 | Python FastAPI service range |
| database | PostgreSQL 17 (pgvector) | Primary database on port 5432, database `nexus` |
| cache | Redis via Docker | Session store and caching (port 6379) |
| document.db | MongoDB via Docker | Document store (port 27017) |
| messaging | NATS | Inter-service message bus (port 4222) |

---

## I. Operations & Deployment

### Systemd Fleet (18 User Services)

All Nexus daemons are managed by **systemd user units** (`systemctl --user`) and auto-started on boot. The master script `bin/start-nexus-services.sh` provides a unified interface:

```bash
nexus/bin/start-nexus-services.sh {start|stop|restart|status|enable}
```

**Infrastructure (Docker oneshot):**

| Service | Port | Unit | Health Check |
|---------|------|------|-------------|
| redis | 6379 | `redis.service` | `docker exec atomic-redis-dev redis-cli ping` |
| mongodb | 27017 | `mongodb.service` | `docker exec atomic-mongodb mongo --eval 'db.runCommand({ping:1})'` |

Both run `docker system prune -f` before starting to prevent disk accumulation.

**JVM Services (Spring Boot, `mvn spring-boot:run`):**

| Service | Port | Unit | Depends On |
|---------|------|------|------------|
| service-registry | 8085 | `service-registry.service` | postgresql, redis |
| broker-gateway | 8081 | `broker-gateway.service` | postgresql, service-registry |
| terrain | 8084 | `terrain.service` | postgresql |
| peb-kernel | 8080 | `peb-kernel.service` | postgresql |

**Node.js Services (tsx runner):**

| Service | Port | Unit | Depends On |
|---------|------|------|------------|
| nebula-srv | 3101 | `nebula-srv.service` | postgresql |
| role-memory-srv | 3500 | `role-memory-srv.service` | postgresql, redis |
| vision-srv | 3103 | `vision-srv.service` | postgresql |
| vision-srv-3104 | 3104 | `vision-srv-3104.service` | postgresql |
| image-server | 9081 | `image-server.service` | — |

**MCP Servers (Express/SSE, tsx runner):**

| Service | Port | Unit | Depends On |
|---------|------|------|------------|
| conduit-mcp | 3100 | `conduit-mcp.service` | postgresql |
| nebula-mcp-sse | 3102 | `nebula-mcp-sse.service` | postgresql |
| tackle-mcp | 3400 | `tackle-mcp.service` | postgresql, redis |
| address-tts-mcp | 3105 | `address-tts-mcp.service` | address-tts |

**Python Services:**

| Service | Port | Unit | Depends On |
|---------|------|------|------------|
| address-tts | 8600 | `address-tts.service` | postgresql, nats |
| wrp-bridge-daemon | — | `wrp-bridge-daemon.service` | postgresql |
| vision-srv-py | 8003 | `vision-srv-py.service` | postgresql |

All units use `Restart=on-failure`, `ProtectSystem=strict`, `ProtectHome=read-only` with `ReadWritePaths` scoped to their project directory. Spring Boot units include `/home/codex/.m2` for Maven dependency caching. Service files live alongside their projects (e.g., `nexus/jvm/spring/terrain/terrain.service`) and are symlinked into `~/.config/systemd/user/`.

### Cron Jobs (4 Scheduled Tasks)

```
* * * * *   agent_scheduler_runner     (processes conduit agent queue every minute)
*/15 * * * * compute-cpf.sh            (recomputes CPF scores every 15 minutes)
*/30 * * * * promote-ready.sh --limit 5 (promotes up to 5 ready candidates every 30 min)
0 * * * *   harvest-pipeline.sh --apply --limit 6 (runs harvest ingestion once per hour)
```

All jobs run from `nexus/` directory, logging to `/tmp/`. The agent scheduler uses `CONDUIT_PG_DSN` and runs via `python -m conduit.agent_scheduler_runner`.

### Mesh Registry & Monitoring

`bin/mesh-register.py` and `bin/mesh-status.sh` form the service mesh monitoring layer:

- **mesh-register.py** — Probes all CANDIDATES via HTTP health URLs (or `health_cmd` for Docker/CLI services) and upserts into `terrain.*` PostgreSQL tables. Supports `--probe-only`, `--dry-run`, `--mesh` modes.
- **mesh-status.sh** — Read-only probe emitting a fixed-width table of reachability, HTTP status, latency, and body excerpt for all registered services. Supports `health_cmd` for non-HTTP services (Docker containers, systemd-only daemons).
- **mesh-monitor.py** — Watchdog loop that re-invokes `mesh-register.py` when newly-online services are detected.

Current mesh: **21 tracked services** (18 online via HTTP or health_cmd, 3 unreachable: nebula-mcp-sse SSE timeout at 2s probe, nebula-mcp and terrain-mcp stdio with no health URL).

---

## II. Topology & Infrastructure Data

### Terrain DB (Canonical Service Registry)

The terrain topology server (`terrain` schema in PostgreSQL, Spring Boot on port 8084, `terrain-mcp` stdio MCP wrapper) is the **canonical registry** for all Nexus infrastructure. It is populated by `mesh-register.py` and queried by `terrain-mcp` tools.

**Service Types:**
| ID | Type |
|----|------|
| 1 | MCP (Model Context Protocol) |
| 2 | Microservice |
| 3 | Express |
| 6 | Spring Boot |
| 8 | Database |
| 12 | Python Service |

**Registered:** 10 MCP servers, 19 runnable services, 11 dependency edges.

**Dependency Graph (from `terrain.service_dependencies`):**

| Source | Target | Notes |
|--------|--------|-------|
| terrain-mcp (MCP) | nebula-srv | MCP → REST API |
| nebula-mcp (MCP) | nebula-srv | MCP → REST API |
| conduit-mcp (MCP) | nebula-srv | MCP → REST API |
| tackle-mcp (MCP) | nebula-srv | MCP → REST API |
| tackle-mcp (MCP) | redis | MCP → cache |
| terrain-mcp (MCP) | terrain | MCP → Spring Boot |
| broker-gateway | nebula-srv | gateway → REST API |
| vision-srv | nebula-srv | vision → REST API |
| vision-srv-py | nebula-srv | vision Python → REST API |
| role-memory-srv | redis | sync server → cache |
| wrp-bridge-daemon | nebula-srv | bridge → REST API |

### Databases & Caches

| Database | Port | Technology | Schemas | Purpose |
|----------|------|------------|---------|---------|
| **PostgreSQL** | 5432 | PostgreSQL 17 + pgvector | `terrain`, `nebula`, `knowledge`, `vision`, `conduit`, `vector`, `tackle`, `peb`, `registry`, `public` | Primary operational database |
| **MongoDB** | 27017 | MongoDB 4.4.18 (Docker) | `atomic-mongodb`, `fs-crawler` | Document store for broker-gateway, media metadata |
| **Redis** | 6379 | Redis latest (Docker) | Keyspaces: `mem:*`, `dedupe:*`, `session:*`, `scan:state:*` | Cache, session store, procedure registry |
| **SQLite** | — | SQLite 3 | `conduit/pipeline.db` (legacy) | Pipeline state, being migrated to PostgreSQL |

---

## III. Service Architecture by Domain

### JVM Governance & Routing

**terrain** (`jvm/spring/terrain`, port 8084, `terrain.service`)
- Infrastructure topology registry — canonical source for all Nexus service metadata
- 8 REST controllers (`McpServer`, `RunnableService`, `Server`, `ServiceType`, `ServiceDependency`, `CliTool`, `BrokerProfile`, `RegistryServerProfile`)
- Hibernate auto-creates tables on first connect; `TopologyDataInitializer` seeds default profiles
- MCP bridge: `terrain-mcp` (stdio) — read/write surface for agent tools

**peb-kernel** (`jvm/spring/peb-kernel`, port 8080, `peb-kernel.service`)
- Persistent Engineering Brain — governance, state management, Merkle-chain audit ledger
- 9-module Maven architecture: `peb-domain` → `peb-store` → `peb-core` → `peb-api`/`peb-adapters` → `peb-bootstrap`
- 6-step governance pipeline: Admission → Governance → Validation → Transaction → Hashing → Decision Recording
- MCP bridge: `peb-mcp` (stdio)
- Flyway-migrated PostgreSQL schema (`peb`)

**broker-gateway** (`jvm/spring/service-broker/broker-gateway`, port 8081, `broker-gateway.service`)
- API gateway routing requests to backend microservices via `ServiceRequest`/`ServiceResponse` protocol
- Feign client to service-registry for discovery; MongoDB for user/session data
- 17 service-broker modules (login, file, note, search, upload, export, user-access, etc.)
- Multi-environment profiles: `dev`, `selenium`, `beryllium`

**service-registry** (`jvm/spring/service-registry`, port 8085, `service-registry.service`)
- Framework-agnostic service discovery, heartbeat monitoring, deployment lifecycle
- PostgreSQL (`registry` schema) + optional Redis caching
- REST endpoints for registration, heartbeat, discovery, deregistration
- Tracks 7 core entities + 9 lookup tables

### Node.js REST & Python Services

**nebula-srv** (`typescript/nebula-srv`, port 3101, `nebula-srv.service`)
- Canonical Express REST API for nebula schemas — systems, subsystems, features, requirements, agent records, harvests, projections

**agent-chat** (`python/tackle/agent_chat.py`, port 3017, manual)
- Dispatches prompts to opencode agents via SSE. Not systemd-managed.

**role-memory-srv** (`typescript/role-memory-srv`, port 3500, `role-memory-srv.service`)
- PG→Redis sync server for the Role Memory Procedure Registry
- Syncs `tackle.memory` + `tackle.role_memory` from PostgreSQL to Redis on startup and `POST /refresh`

**vision-srv** (`typescript/vision-srv`, ports 3103/3104, `vision-srv.service` + `vision-srv-3104.service`)
- Express REST API for Vision LOSM — work requests, artifacts, branches
- Two instances on separate ports for client routing flexibility

**vision-srv-py** (`python/vision/vision-srv`, port 8003, `vision-srv-py.service`)
- Python FastAPI/uvicorn LOSM backend — `vision_srv.main:app`

**wrp-bridge-daemon** (`python/conduit/bridge/daemon.py`, `wrp-bridge-daemon.service`)
- Polls `vision.receipts` every 30s, enriches with plan data, builds `KernelDelta`
- Calls in-process `KernelEngine.reduce(delta)` — 5-step deterministic reduce pipeline
- Checkpoint-based cursor for idempotent replay

**address-tts** (`python/address/tts`, port 8600, `address-tts.service`)
- Speech synthesis service — Piper TTS engine, NATS subscriber for work request events
- REST API: `POST /synthesize`, `POST /speak`, `GET /health`
- MCP bridge: `address-tts-mcp` (port 3105, `address-tts-mcp.service`)

**image-server** (`typescript/image-server`, port 9081, `image-server.service`)
- Static image hosting from `IMAGE_ROOT_DIR`

**file-system-server** (`typescript/file-system-server`, port 4040)
- Remote filesystem CRUD proxy (Node.js Express, not systemd-managed)

### MCP Interface Layer

| Server | Transport | Port | Status | Purpose |
|--------|-----------|------|--------|---------|
| conduit-mcp | Express (systemd) | 3100 | ONLINE | WorkRequest orchestrator, plan lifecycle |
| nebula-mcp-sse | SSE (systemd) | 3102 | ONLINE | SSE wrapper around nebula-srv |
| tackle-mcp | Express (systemd) | 3400 | ONLINE | AI config registry (providers, harnesses, models) |
| address-tts-mcp | Express (systemd) | 3105 | ONLINE | TTS agent interface |
| nebula-mcp | stdio | — | ONLINE | Nebula RMS MCP tools |
| knowledge-mcp | stdio | — | ONLINE | Knowledge graph queries, semantic search |
| peb-mcp | stdio | — | ONLINE | PEB kernel facade |
| terrain-mcp | stdio | — | OFFLINE | Terrain topology read/write |
| vision-mcp | stdio | — | ONLINE | Vision LOSM work requests |
| vision-mcp-py | stdio | — | ONLINE | Vision LOSM (Python) |

Systemd-managed MCPs (ports 3100, 3102, 3400, 3105) auto-start on boot and restart on failure. Stdio MCPs are client-launched — not daemon-manageable.

### Background Runtimes (Active, Not Critical Path)

**AdonisJS** (`adonisjs/`) — Legacy broker-gateway-proxy. **Not deprecated** — still functional, just not on the current critical execution path.

**Moleculer** (`moleculer/`) — Moleculer-based search service. **Not deprecated** — available for search workloads, not currently in the primary event pipeline.

**Quarkus** (`jvm/quarkus/broker-gateway`, port 8090) — Quarkus 3.15.1 reimplementation of the broker gateway. Alternate JVM runtime.

**Helidon** (`jvm/helidon/user-access-service`, port 9093) — Helidon MP 4.x user access management. Alternate JVM runtime for PostgreSQL-based auth.

**Ballerina** (`jvm/ballerina/demo_package`) — Ballerina demo/experimental package.

### Code Integrity & Conformance Tooling

- **Go** (`go/wrp/ccnf-ref/`) — CCNF deterministic reference implementation (hashing, serialization, replay)
- **Rust** (`rust/wrp/ccnf-verifier/`) — Independent CCNF contract evaluator for cross-language validation
- **Python tools** (`tools/`) — ARL linter, CIR integrity scanner, governance lattice enforcement

---

## IV. WorkRequest Pipeline & Cognitive Runtime

### Execution Authority (ADR-006) — New Pipeline Architecture

**Implemented:** 2026-07-12

The Execution Authority Protocol (ADR-006) introduces a lease-based execution model with mutual exclusion, attempt tracking, and domain-separated receipts.

#### Schema (`execution` schema in PostgreSQL)

| Table | Purpose | Lifecycle |
|-------|---------|-----------|
| `execution.requests` | Immutable intent (WorkRequest) | DRAFT → COMPILED → VALIDATED → ADMITTED → READY → COMPLETED |
| `execution.leases` | Temporal permission to execute | ACTIVE → EXPIRED \| RELEASED |
| `execution.attempts` | One run of the work | CREATED → RUNNING → SUCCEEDED \| FAILED \| TIMED_OUT |
| `execution.receipts` | Immutable evidence (ADR-006 noun #4) | Immutable once issued |

**Key invariants:**
- Only one ACTIVE lease per request at a time (enforced by partial unique index)
- Each attempt is tied to a lease and a request
- Receipts preserve lineage to `vision.receipts` via `lineage_source` + `lineage_original_id`

#### Pipeline Flow (ADR-006)

```
Vision (compiler)
  └──→ DRAFT → COMPILED → VALIDATED (STOP)

Cascade Admission (Python pipeline, runs in run_role())
  └──→ VALIDATED → ADMITTED → READY

Execution Authority (Conduit builder / CLI executor)
  └──→ READY → COMPLETED
```

**Key changes from pre-ADR-006:**
1. Vision stops at VALIDATED — no auto-advancement to QUEUED
2. Cascade admission subscriber handles VALIDATED → ADMITTED → READY
3. Conduit builder uses lease lifecycle (acquire → attempt → release)
4. CLI executor proves abstraction — any executor can claim work
5. Dual receipt writes (legacy `vision.receipts` + new `execution.receipts`)

#### MCP Tools (11 operations)

| Tool | Description |
|------|-------------|
| `execution_create_request` | Create a new execution request |
| `execution_list_requests` | List requests by status |
| `execution_get_request` | Get request details |
| `execution_transition_request` | Transition request status |
| `execution_acquire_lease` | Acquire a temporal lease |
| `execution_renew_lease` | Renew an active lease |
| `execution_release_lease` | Release a lease |
| `execution_submit_attempt` | Submit an attempt |
| `execution_issue_receipt` | Issue an execution receipt |
| `execution_list_receipts` | List receipts for a request |
| `execution_state` | Get full execution state |

#### REST API (`/api/execution/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/execution/requests` | GET/POST | List/create requests |
| `/api/execution/requests/:id` | GET | Get request details |
| `/api/execution/requests/:id/transition` | PATCH | Transition status |
| `/api/execution/leases/acquire` | POST | Acquire a lease |
| `/api/execution/leases/:id/renew` | POST | Renew a lease |
| `/api/execution/leases/:id/release` | POST | Release a lease |
| `/api/execution/attempts` | POST | Create an attempt |
| `/api/execution/attempts/:id/start` | POST | Start an attempt |
| `/api/execution/attempts/:id/complete` | POST | Complete an attempt |
| `/api/execution/receipts` | POST | Issue a receipt |
| `/api/execution/state` | GET | Full execution state |

#### CLI Executor (`python/conduit/cli_executor.py`)

Standalone executor proving the abstraction:
```bash
python3 cli_executor.py --list                    # List pending requests
python3 cli_executor.py --claim <request_id>      # Claim and execute
python3 cli_executor.py --status <request_id>     # Show request status
```

#### Files Changed

| File | Changes |
|------|---------|
| `python/conduit/main.py` | `_dispatch_one()` uses lease lifecycle, `run_role()` adds cascade admission + lease expiry |
| `python/conduit/db_adapter.py` | 10 new methods (lease, attempt, receipt, request), `_ConnectionProxy` rollback fix, `execution` schema in search_path |
| `python/conduit/cli_executor.py` | New standalone CLI executor |
| `typescript/conduit-mcp/migrations/025-execution-schema.sql` | DDL for execution schema |
| `typescript/conduit-mcp/migrations/026-migrate-receipts.sql` | Receipt migration (original) |
| `typescript/conduit-mcp/migrations/026-migrate-receipts-v2.sql` | Receipt migration (corrected — uses nebula.plans) |
| `typescript/conduit-mcp/src/db.ts` | v32 (execution schema), v33 (receipt migration), v34 (corrected migration) |
| `typescript/conduit-mcp/src/runtime-kernel.ts` | Vision boundary — removed VALIDATED auto-advancement |
| `typescript/nebula-srv/src/routes.ts` | 11 execution REST endpoints |
| `typescript/nebula-mcp/src/tools/index.ts` | 11 MCP tool registrations |
| `typescript/nebula-mcp/src/api/nebulaClient.ts` | 11 client methods |

#### Receipt Migration (v34 fix)

**Root cause:** v33 joined `vision.receipts` with `conduit.plans` (empty table). Corrected to join with `nebula.plans`.

| Metric | Before | After |
|--------|--------|-------|
| `execution.receipts` (lineage) | 0 | 1,554 |
| `execution.requests` (legacy) | 0 | 317 |
| `execution.attempts` (legacy) | 0 | 317 |
| `execution.leases` (legacy) | 0 | 317 |

14 unmigrated receipts are test/chat/standalone records with no `nebula.plans` row.

### Plan Lifecycle (conduit-mcp → WRP Kernel)

```
User Intent → conduit-mcp (:3100) → PostgreSQL (conduit.plans, vision.receipts)
                    ↓
wrp-bridge-daemon (polls every 30s) → KernelDelta → KernelEngine.reduce()
                    ↓
           [Receipt Materialization → Identity Resolution → Graph Update →
            Lineage Recording → Commit]
                    ↓
              KernelState (versioned, checkpointed to PostgreSQL)
                    ↓
     peb-kernel (:8080) → PebDecision Merkle chain (governance audit trail)
```

**Receipt types:** PROPOSED → PLAN_CREATE → CRITIQUE → SPECIFICATION → APPROVED → QUEUED → EXECUTING → COMPLETED → ARCHIVED (FAILED is terminal from any state).

### Cognitive Runtime

- **cascade** (`python/cascade/`) — Pure event bus, polls `events/` directory, publishes via NATS
- **conduit** (`python/conduit/`) — Cron-driven orchestrator dispatching WorkRequests to AI executors
- **meep** (`python/meep/`) — 6-station deterministic pipeline (IRL classifier → spec compiler → scheduler → replay)
- **rover** (`python/rover/`) — Harvest pipeline for chat transcripts, NLP output, and document ingestion via Docling
- **steward** (`python/steward/`) — Knowledge graph migration (JSON → PostgreSQL `knowledge.*`)

See detailed flow diagrams in:
- `audit/WRP_PIPELINE_FLOW.md` — WRP kernel state machine and bridge daemon
- `audit/JVM_PIPELINE_FLOW.md` — JVM governance, registry lifecycle, broker routing
- `audit/COGNITIVE_RUNTIME_FLOW.md` — NBK, IR, Cascade, MEEP
- `audit/ABSORPTION_PIPELINE_FLOW.md` — Ingestion and parsing pipeline

---

## V. Port Allocation Map

| Port | Service | Kind | Managed By |
|------|---------|------|------------|
| 3000 | nebula-ui | Angular UI | manual |
| 3001 | plurality-ui | React UI | manual |
| 3002 | duality-ui | React UI | manual |
| 3017 | agent-chat | Python/SSE | manual |
| 3100 | conduit-mcp | MCP (Express) | systemd |
| 3101 | nebula-srv | REST API | systemd |
| 3102 | nebula-mcp-sse | MCP (SSE) | systemd |
| 3103 | vision-srv | REST API | systemd |
| 3104 | vision-srv-3104 | REST API | systemd |
| 3105 | address-tts-mcp | MCP (Express) | systemd |
| 3400 | tackle-mcp | MCP (Express) | systemd |
| 3500 | role-memory-srv | PG→Redis sync | systemd |
| 4040 | file-system-server | Filesystem proxy | manual |
| 4200 | nexus-console | Angular UI | manual |
| 4201 | conduit-ui | Angular UI | manual |
| 5432 | PostgreSQL | Database | system (postgresql) |
| 6379 | redis | Cache (Docker) | systemd (oneshot) |
| 7223 | NATS | Message bus | system (nats) |
| 8003 | vision-srv-py | Python FastAPI | systemd |
| 8080 | peb-kernel | Spring Boot | systemd |
| 8081 | broker-gateway | Spring Boot | systemd |
| 8084 | terrain | Spring Boot | systemd |
| 8085 | service-registry | Spring Boot | systemd |
| 8600 | address-tts | Python TTS | systemd |
| 9081 | image-server | Static assets | systemd |
| 11434 | ollama | Local LLM | system (ollama) |
| 27017 | mongodb | Document DB (Docker) | systemd (oneshot) |

---

## VI. Key Architectural Patterns

### Database-First Architecture
PostgreSQL is the **only** canonical store for agent artifacts. Filesystem markdown files are on-demand projections regenerated from database state — never a source of truth. Plans are created via `conduit-mcp` API first; `.md` files in `IMPLEMENTATION_PLANS/` are derived projections.

### Systemd-First Service Management
All daemons are managed by systemd user units with `Restart=on-failure`, auto-start on boot (`WantedBy=default.target`), and hardening (`ProtectSystem=strict`, `NoNewPrivileges=true`). The `bin/start-nexus-services.sh` master script provides a unified CLI for the full fleet. Docker services use `Type=oneshot` + `RemainAfterExit=yes` with `ExecStopPost` cleanup.

### Mesh Registry as Single Source of Truth
`mesh-register.py` → `terrain.*` PostgreSQL tables → `terrain-mcp` tools + `mesh-status.sh` monitoring. Adding a service requires only adding it to `CANDIDATES` in `mesh-register.py`; `mesh-status.sh` auto-discovers it.

### Role-Driven Messaging
Agents communicate via tag-routed database records (inbox/outbox pattern) rather than folder polling. Each role owns its domain's binding output (Architect→decisions, Builder→changes, Reviewer→approvals, etc.).

### Epistemic Governance
No single role unilaterally closes decisions in another's domain. Divergence is preserved as visible records — never silently collapsed into consensus.

### Knowledge Stratification
Documents carry two independent attributes: **Abstraction Level** (L1 operational → L4 meta) and **Visibility Scope** (builder, architect, planner, reviewer, all). Each role sees a filtered view of the same knowledge graph.
