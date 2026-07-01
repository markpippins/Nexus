# Nexus Architecture

> **Last updated:** 2026-06-28
> **Scope:** All active directories under `nexus/` (excluding `legacy/` and `angular/`)
> **Canonical source:** PostgreSQL database; this file is a derived projection.
> **Data sources:** Terrain PostgreSQL schema (service registry + topology), nebula-srv REST API, audit documentation, harvest records.

---

## System Defaults & Conventions

| Setting | Value | Notes |
|---------|-------|-------|
| java.version | 21 | Default for all JVM projects |
| spring-boot.version | 3.5.0 | Default Spring Boot version |
| quarkus.version | 3.15.1 | Default Quarkus version |
| helidon.version | 4.x | Default Helidon MP version |
| node.version | 20 | Default Node.js version |
| typescript.version | 5.x | Default TypeScript version (tsx runner) |
| python.version | 3.13 | Default Python version |
| go.version | 1.22 | Go module version |
| port.range.backend | 8080-8099 | Preferred range for backend services |
| port.range.frontend | 3000-3999 | Preferred range for frontend/UI dev servers |
| port.range.mcp | 3100-3499 | MCP server port range |
| port.range.proxy | 3333-3349 | Preferred range for proxy services |
| database | PostgreSQL 17 (pgvector) | Primary database on port 5432, schema `nexus` |
| cache | Redis 8.x | Session store and caching (port 6379) |

---

## Top-Level Directory Map

| Directory | Purpose |
|-----------|---------|
| `schema/` | Canonical schema definitions, capability and workflow JSON schemas |
| `graph/` | Capability registry, projection algebra, IR definitions, knowledge graph |
| `typespec/` | Microsoft TypeSpec API specifications with multi-language code generation |
| `go/` | Go-based WRP (WorkRequest Pipeline) conformance reference implementation |
| `rust/` | Rust-based CCNF verifier for contract evaluation |
| `tools/` | Code Integrity Runtime (CIR) tooling — ARL linter, governance enforcement |
| `typescript/` | MCP servers, REST API servers, UI backends, and utility libraries |
| `jvm/` | Spring Boot, Quarkus, Helidon, and Ballerina services |
| `python/` | Event pipeline, cognitive runtime, harvest pipeline, CLI tools, vision LLM services |
| `adonisjs/` | Legacy broker-gateway-proxy (AdonisJS) |
| `moleculer/` | Moleculer-based search service |
| `audit/` | Architecture, plans, inspections, specs, harvests, prompts, and session records |
| `.agents/` | Agent orchestration, skills, and pipeline configurations |
| `docs/` | Project documentation, reference materials, and design notes |
| `ontologies/` | Ontology definitions for the CIR-SDM model and knowledge graph schema |
| `plans/` | Planning artifacts |
| `bin/` | Binary scripts |
| `scripts/` | Utility scripts |
| `tests/` | Cross-project tests |

---

## I. Core Infrastructure Schema

### `nexus/schema/`

The schema directory houses formal JSON schema definitions that serve as the canonical type system for the Nexus capability graph:

- **`schema/node-types.json`** — Defines two universal node types:
  - **`InferenceNode`**: Probabilistic outputs from uncertain inputs (LLM-driven). Requires downstream validation via `deterministic_guard`, `cross_model`, or `human_review`. Includes optional `model_hint` and `confidence_threshold`.
  - **`DeterministicNode`**: Pure functions or rule engines with guaranteed behavior. Requires explicit `implementation`.
- **`capability/`** — Capability registration schemas
- **`workflow/`** — Workflow definition schemas
- **`examples/`** — Example capability/workflow definitions

### `nexus/graph/`

The graph directory implements the **capability graph** — a composable, swappable, independently-testable node registry:

- **`capability/`** — Declared capabilities registered as JSON files conforming to `schema/node-types.json`:
  - `filesystem.json` — Voyager capabilities (scan, observe, notify)
  - `ingestion.json` — DocLing/html-importer ingestion capabilities
  - `reasoning.json` — Inference capabilities (classify, summarize, plan)
- **`projection-algebra.md`** — Algebraic foundation for projection-based reasoning
- **`projection-ir.md`** — Intermediate representation for projection operations
- **`nexus-knowledge-graph.json`** — The consolidated knowledge graph
- **`.obsidian/`** — Obsidian vault configuration for graph browsing

Key principle: Capabilities are **single-purpose** (one node, one responsibility), **composable** (outputs connect to any compatible input), **swappable** (same schema, different implementation), and **multi-workflow-usable** (same capability appears in multiple workflows).

### `nexus/typespec/`

Microsoft TypeSpec specifications (in `typespec/v1/`) provide a single-source-of-truth for API contracts:

- **`main.tsp`** — Core service definitions, including `WidgetService` with CRUD models
- **`core/`** — Shared DTOs and models shared across service definitions
- **`tspconfig.yaml`** — Multi-language emitter configuration generating:
  - `@typespec/openapi3` → OpenAPI 3.0 schemas (`{output-dir}/schema`)
  - `@typespec/http-client-java` → Java HTTP clients (`{output-dir}/clients/java`)
  - `@typespec/http-client-python` → Python HTTP clients (`{output-dir}/clients/python`)
- **`staging/`** — Staging area for in-progress TypeSpec work

The TypeSpec project is organized to eventually support multi-project (Helidon/Quarkus/Spring) code generation from a single contract source.

---

## II. Foundational Language Implementations

### `nexus/go/`

The Go implementation lives under `go/wrp/ccnf-ref/` and implements the **CCNF (Canonical Conformance Reference)** — a deterministic reference implementation of the WorkRequest Pipeline conformance model:

- **Module:** `github.com/anomalyco/nexus-ccnf-ref` (Go 1.22)
- **Key Sub-areas:**
  - **`ccnf/`** — Core canonicalization and conformance logic: hashing, serialization, artifact management, structural parsing
  - **`replay/`** — Deterministic replay engine with state management, cursor handling, and test coverage
  - **`runtime/`** — Runtime components: validators, tracing, replay logic
  - **`conformance/`** — Conformance test runner
- **Testing:** Extensive test coverage including `_test.go` files, fuzz tests, and cross-check conformance tests

**Purpose:** The Go CCNF reference serves as the ground-truth implementation against which all other language implementations (Rust, TypeScript) are validated for conformance.

### `nexus/rust/`

The Rust implementation lives under `rust/wrp/ccnf-verifier/` and provides an **independent CCNF contract evaluator**:

- **Package:** `ccnf-verifier` v0.1.0
- **Dependencies:** `serde_json`, `sha2`, `hex`, `unicode-normalization`
- **Key files:**
  - `src/main.rs` — Executable entry point
  - `src/error.rs` — Error handling module

**Purpose:** The Rust verifier cross-checks conformance against the Go reference. It provides a second-language implementation for contract evaluation, ensuring the CCNF model is language-independent and correctly specified.

### `nexus/tools/`

The tools directory contains **Code Integrity & Governance Tooling** — structural integrity enforcement for the CIR-SDM ontology model:

- **`cir1/`** — Code Integrity Runtime v1 tools:
  - `scan.py` — Structural integrity scanning
  - `lint.py` — CIR linting
  - `patch.py` — Deterministic patching of structural violations
- **`arl/`** — Anti-Recursion Linter (ARL v2):
  - `authority.py` — Authority analysis
  - `classification.py` — Structural classification
  - `graph.py` — Governance dependency graph analysis
  - `invariants.py` — Integrity invariant enforcement
  - `lattice.py` — Lattice enforcement
- **`arl_linter.py`** — Top-level orchestrator that performs a 5-pass structural linting process:
  1. Classification
  2. Authority
  3. Lattice enforcement
  4. Integrity invariants
  5. Governance dependency graph analysis

**Integration:** Accessed via Makefile targets (`cir-verify`, `cir-arl`) in the project root. Works with the `CIR-SDM` ontology model to detect and prevent governance drift.

---

## III. TypeScript Layer

### MCP Servers (Model Context Protocol)

The TypeScript MCP layer is the primary interface for AI agents to interact with the Nexus system. All MCP servers use `@modelcontextprotocol/sdk` and communicate via **stdio** transport (except where noted), connecting to PostgreSQL on `localhost:5432/nexus`.

| Server | Port | Database Schema | Entrypoint | Purpose |
|--------|------|----------------|------------|---------|
| **conduit-mcp** | 3100 | `conduit` (SQLite via `pipeline.db`) | `src/index.ts` | WorkRequest orchestrator & SSE event bus. Sole schema authority for pipeline state (plans, receipts, sessions, tickets). Proxies conduit-ui. |
| **nebula-mcp** | stdio (→3101 REST) | `nebula` + `public` | `src/index.ts` | Proxies to nebula-srv REST API. Exposes systems, subsystems, features, requirements, and agent records via MCP tools. |
| **nebula-mcp-sse** | 3102 | `nebula` + `public` | (SSE wrapper) | SSE wrapper around nebula-srv. Enables stdio-only MCP clients to communicate with the DB API via HTTP. |
| **terrain-mcp** | stdio | `terrain` | `src/index.ts` | Read/write surface over infrastructure topology. Queries services, servers, MCP servers, and CLI tools registered in terrain. |
| **knowledge-mcp** | stdio | `knowledge.graph_*` | `src/index.ts` | Knowledge graph explorer. Exposes `graph_entities`, `graph_edges`, `graph_cross_references`, and `graph_migrations`. Supports semantic search via Ollama nomic-embed-text. |
| **tackle-mcp** | 3400 | `tackle` | `src/index.ts` | AI configuration registry — providers, harnesses, models, role-to-model routing. |
| **peb-mcp** | stdio | PEB schema | `src/index.ts` | MCP Facade for the PEB Spring Boot Kernel. Supports governance, state management, and orchestration. |
| **vision-mcp** | stdio | `vision` | `src/index.ts` | Vision LOSM (Line-of-Sight Mapping) work requests, artifacts, branches. Proxies to vision-srv REST API. |

> **Note:** `vision-mcp-py` is a **Python** MCP server (see Section V — AI & Vision Services under `vision/`). It is not a TypeScript service and is listed in the Python layer.

### REST API Servers

| Server | Port | Entrypoint | Description |
|--------|------|------------|-------------|
| **nebula-srv** | 3101 | `src/index.ts` | Canonical Express REST API for nebula schemas. Manages agent records, requirements, systems, features, harvests, and projections. PostgreSQL backend. |
| **vision-srv** | 3104 | `src/index.ts` | Express REST API for Vision LOSM. PostgreSQL vision schema backend. Proxies to vision-mcp. |
| **role-memory-srv** | 3500 | `src/index.ts` | PG-to-Redis sync server for the Role Memory Procedure Registry. Syncs PostgreSQL (`tackle.role_memory`) tables to Redis on startup and via `POST /refresh`. Exposes `GET /procedures/:role` and `GET /procedure/:slug` for agent procedure retrieval. Used by tackle-mcp and tools-aggregator. See **[README](../typescript/role-memory-srv/README.md)** for Redis keyspace and API reference. |
| **tools-aggregator** | 3200 | `src/index.ts` | Unified MCP tool aggregator — aggregates all MCP services (conduit-mcp, tackle-mcp, nebula-mcp, knowledge-mcp, terrain-mcp, vision-mcp, peb-mcp, role-memory-srv) into a single REST API. Exposes GET /health, GET /tools, POST /tools/call, GET /registry. Used by Python inference harnesses for centralized tool discovery. |
| **file-system-server** | 4040 | `src/server.ts` | Node.js proxy for remote filesystem CRUD operations. |
| **image-server** | 9081 | `index.js` | Static image server supporting multiple search locations. |
| **broker-service-proxy** | 3334 | — | Express proxy service (directory currently empty — functionality may have migrated). |
| **fs / media-metadata** | 8004 | FastAPI (Python) | FastAPI service for media file metadata indexing and search. Redis + MongoDB backend. Includes a broker adapter on port 8001 for service-registry compatibility. See Section V — Python Utilities. |

### UI / Frontend Services

| UI | Port | Framework | Description |
|----|------|-----------|-------------|
| **nebula-ui** | 3000 | Angular | Nebula RMS dashboard (proxies /api to nebula-srv :3101) |
| **plurality-ui** | 3001 | React + Vite | Plurality cognitive interface |
| **duality-ui** | 3002 | React + Vite | Duality cognitive interface |
| **nexus-console** | 4200 | Angular | Nexus system console (proxies /api to nebula-srv :3101) |
| **conduit-ui** | 4201 | Angular | Conduit pipeline management UI (proxies to conduit-mcp :3100) |

### Supporting TypeScript Libraries

| Project | Description |
|---------|-------------|
| `utils/` | Shared TypeScript utility functions |
| `google/` | Google Search API proxy |
| `unsplash/` | Unsplash image search proxy (no `package.json` — `image-search.ts` + `ARCHITECTURE.md` only)

---

## IV. JVM Layer

The JVM layer provides the governance, topology, routing, and service-discovery backbone of the Nexus platform. It consists of four primary Spring Boot services, a 17-module service-broker ecosystem, Quarkus/Helidon reimplementations, and shared libraries.

### Spring Boot Services

#### 1. terrain (Infrastructure Topology Server)

| Setting | Value |
|---------|-------|
| **Port** | 8084 |
| **Path** | `jvm/spring/terrain` |
| **Framework** | Spring Boot 3.5.0 / Java 21 |
| **Database** | PostgreSQL (`terrain` schema) |
| **Entrypoint** | `TopologyServerApplication.java` |

**Purpose:** Canonical registry for all Nexus infrastructure — the single source of truth for topology data, replacing the legacy IndexedDB browser storage.

**Internal Architecture:**
```
TopologyServerApplication.java (boot)
    └── Controllers (8 REST endpoints):
        ├── McpServerController          — /api/v1/mcp-servers
        ├── RunnableServiceController     — /api/v1/runnable-services
        ├── ServerController              — /api/v1/servers
        ├── ServiceTypeController         — /api/v1/service-types
        ├── ServiceDependencyController   — /api/v1/service-dependencies
        ├── CliToolController             — /api/v1/cli-tools
        ├── BrokerProfileController       — /api/v1/broker-profiles
        └── RegistryServerProfileController — /api/v1/registry-server-profiles
    └── Config:
        └── TopologyDataInitializer.java  — CommandLineRunner seeding default
                                            broker and registry profiles
                                            from JSON config files on first
                                            startup (src/main/resources/config/)
    └── Entity Layer:
        ├── McpServer, RunnableService, Server
        ├── ServiceType, ServiceDependency (polymorphic)
        └── BrokerProfile, RegistryServerProfile
    └── Repository Layer: Spring Data JPA (auto-managed)
    └── DTO Layer: PagedResponse<T> matching service-registry format
```

**Data Model:**
- **service_types** — Lookup table (MCP, Microservice, Express, Proxy, Bun, Spring Boot, CLI Tool, Database, etc.)
- **mcp_servers** — MCP server instances with port, workspacePath, transportType (sse/stdio), healthCheckUrl, version
- **runnable_services** — Microservices/Express/Bun/proxy instances with port, workspacePath, healthCheckUrl
- **servers** — Physical/virtual machines (hostname, ipAddress, os, status)
- **service_dependencies** — Polymorphic dependency graph: any service type can depend on any other service type or server, with criticality (REQUIRED/OPTIONAL)
- **broker_profiles** — Connection details for broker gateway instances (profileId, brokerUrl, imageUrl)
- **registry_server_profiles** — Service registry connection configs (registryServerUrl, isActive)

**Key Behavior:**
- Hibernate `ddl-auto=update` creates tables on first connect (`nexus` DB, `terrain` schema)
- `TopologyDataInitializer` seeds default profiles from `broker-profiles.json` and `registry-server-profiles.json` — but only if the database is empty, ensuring idempotent seeding
- All endpoints return `PagedResponse<T>` for consistent pagination

---

#### 2. peb-kernel (Persistent Engineering Brain)

| Setting | Value |
|---------|-------|
| **Port** | 8080 |
| **Path** | `jvm/spring/peb-kernel` |
| **Framework** | Spring Boot 3.5.0 / Java 21 |
| **Database** | PostgreSQL (Flyway migrations, `V1__init_peb_schema.sql`) |
| **Entrypoint** | `peb-bootstrap` module (`@SpringBootApplication`) |

**Purpose:** Governance, state management, and orchestration backend implementing deterministic, event-sourced requirements capture with a Merkle-tree backed state ledger.

**Multi-Module Maven Architecture (strict unidirectional dependencies):**
```
peb-domain (pure Java, no Spring)
    ↑
peb-store (Spring Data JPA + Flyway)
    ↑
peb-core (governance engine)
    ↕        ↕
peb-hash   peb-adapters
    ↓           ↓
peb-observability
    ↓
peb-bootstrap (app context root)
```

**Module Details:**

| Module | Key Classes | Purpose |
|--------|-------------|---------|
| **peb-domain** | `PebState`, `PebDecision`, `PebTransaction`, `PebTrace`, `PebViolation`, `PebCapability`, `PebStateHash` | Core domain entities and value objects. Pure Java — zero Spring dependencies. |
| **peb-store** | Spring Data JPA repositories, Flyway migration `V1__init_peb_schema.sql` | PostgreSQL persistence layer. JPA entities mapped from domain. |
| **peb-core** | `PebGovernanceEngine`, `PebTransactionEngine`, `InvariantValidator` | Core business logic — orchestrates governance decisions, transaction processing, and invariant validation. |
| **peb-hash** | `PebHashService` | Merkle chain checksum generation and validation (SHA-256 of structured JSON content). |
| **peb-api** | `AdmissionControllerFacade` (REST) | External-facing REST facade for `conduit-mcp` and other consumers. |
| **peb-adapters** | `ConduitMcpAdapter`, `LosmIrTransitionAdapter` | Bridges from JVM domain to other ecosystems (conduit, Vision LOSM). |
| **peb-bootstrap** | `@SpringBootApplication` (launcher), `application.yml` | Application context root — wires all modules together. |

**Execution Flow:**
```
External Actor (e.g. conduit-mcp)
    ↓
1. Ingress → AdmissionControllerFacade (peb-api)
    ↓
2. Governance → PebGovernanceEngine (peb-core)
    ↓
3. Validation → InvariantValidator
                  - Checks PebCapability tokens (cap:<action>[:scope=<resource>:<filter>])
                  - Validates system invariants
    ↓
4. Transaction → PebTransactionEngine opens @Transactional context
    ↓
5. Execution + Hashing → PebHashService computes SHA-256 Merkle checksums
    ↓
6. Decision Recording → PebDecision with:
                          - beforeHash / afterHash of system state
                          - parentDecisionId (cryptographically linked DAG)
    ↓
7. Commit → PebTransaction + PebDecision saved to PostgreSQL via peb-store
```

**Key Design Properties:**
- **Immutable State**: `PebState` records are immutable — every change produces a new record
- **Event-Sourced**: Every change is recorded as a `PebDecision` linked cryptographically to the previous decision
- **Merkle Chain**: SHA-256 hashes form a cryptographic DAG — tampering with any prior state breaks the chain
- **Capability-Gated**: All actions checked against `PebCapability` tokens (`cap:mutate_state:key=invariants`)
- **Violation Audit**: `PebViolation` entities record capability breaches, authority leakage, or unauthorized semantic normalization

---

#### 3. broker-gateway (Request Routing Gateway)

| Setting | Value |
|---------|-------|
| **Port** | 8081 |
| **Path** | `jvm/spring/service-broker/broker-gateway` |
| **Framework** | Spring Boot 3.5.0 / Java 21 |
| **Database** | MongoDB (`atomic-mongodb`) |
| **Entrypoint** | `BrokerGatewayApplication.java` |

**Purpose:** API gateway that routes requests to microservices (user, file system, login, etc.) using the `ServiceRequest`/`ServiceResponse` protocol with automatic discovery, load balancing, circuit breakers, and health check aggregation.

**Internal Architecture:**
```
BrokerGatewayApplication.java
    ├── Controllers:
    │   ├── HealthController   — /health endpoint with status/details/timestamp
    │   ├── BrokerLogsController — Traffic stream logging
    │   └── POST /api/broker/submitRequest — Main broker endpoint
    ├── Services:
    │   ├── ExternalServiceInvokerImpl — Invokes backend microservices
    │   ├── ServiceDiscoveryClientImpl — Feign client to Service Registry
    │   └── BrokerTrafficStreamService — Traffic observation/replay
    ├── Config:
    │   ├── BrokerGatewayFeignConfig — Feign client configuration
    │   ├── RestTemplateConfig       — HTTP client configuration
    │   ├── CorsFilter               — CORS configuration
    │   ├── OpenApiConfig            — OpenAPI documentation
    │   └── ServiceRegistryRegistrationService — Auto-registers with service-registry
    └── Profiles (multi-environment):
        ├── selenium — Connects to FS server on Beryllium (172.16.30.57:4040)
        ├── beryllium — Connects to local FS server (localhost:4040)
        └── dev — Local development with debug logging
```

**Routing Flow:**
```
Client → POST /api/broker/submitRequest {service, operation, requestId, params}
    ↓
broker-gateway
    ├── Resolves target service via ServiceDiscoveryClient (Feign → service-registry)
    ├── Load balances across deployments
    ├── Invokes ExternalServiceInvokerImpl → target microservice
    ├── Monitors circuit breakers and health
    └── Returns ServiceResponse
```

**Request Format:**
```json
{
  "service": "loginService",
  "operation": "login",
  "requestId": "unique-id",
  "params": {
    "alias": "username",
    "identifier": "password"
  }
}
```

**Dependencies:** MongoDB (`atomic-mongodb`), File System Server (`:4040`), Service Registry (`:8085`), embedded User Service, embedded Login Service.

---

#### 4. service-registry (Central Service Registry)

| Setting | Value |
|---------|-------|
| **Port** | 8085 |
| **Path** | `jvm/spring/service-registry` |
| **Framework** | Spring Boot 3.x / Java 21 |
| **Database** | PostgreSQL (`registry` schema) + Redis (optional caching) |
| **Entrypoint** | `./start.sh` or `mvn spring-boot:run` |

**Purpose:** Production-ready, framework-agnostic service management system — the central registry for service registration, discovery, heartbeat monitoring, deployment tracking, and configuration management across the polyglot ecosystem.

**Internal Architecture:**
```
Service Registry (:8085)
    ├── Registry Management (external-facing):
    │   ├── POST /api/registry/register            — External service registration
    │   ├── POST /api/registry/heartbeat/{name}    — Health heartbeat
    │   ├── GET  /api/registry/services            — List all registered
    │   ├── GET  /api/registry/services/by-operation/{op} — Operation-based lookup
    │   ├── GET  /api/registry/services/{name}/details    — Full detail
    │   └── POST /api/registry/deregister/{name}   — Deregister
    ├── Core CRUD (internal):
    │   ├── /api/frameworks         — Framework catalog (Spring, Quarkus, NestJS, etc.)
    │   ├── /api/services           — Service inventory with dependencies
    │   ├── /api/servers            — Server inventory (hostname, specs, region)
    │   ├── /api/deployments        — Deployment instances with health status
    │   ├── /api/configurations     — Environment-specific config with secret mgmt
    │   └── /api/backends           — Backend connection graph between deployments
    └── Lookup Tables:
        ├── service_types, environment_types, operating_systems
        ├── server_types, framework_categories, framework_languages
        └── service_config_types, visual_components
```

**Data Model (7 core entities + 9 lookup tables):**

| Entity | Fields | Purpose |
|--------|--------|---------|
| **Framework** | name, vendor, category, language, currentVersion, ltsVersion, supportsBrokerPattern | Technology framework catalog |
| **Service** | name, framework, type, parentService (self-ref), defaultPort, repositoryUrl, status | Microservice/application template |
| **Server** | hostname, ipAddress, type, environment, operatingSystem, cpuCores, memory, region, cloudProvider | Physical/virtual machine host |
| **Deployment** | service, server, environment, port, status, healthStatus, processId, containerName | Running service instance |
| **ServiceConfiguration** | service, configKey, configValue, environment, isSecret | Environment-specific config |
| **ServiceDependency** | service, targetService (self-referential join table) | Service dependency graph |
| **ServiceBackend** | serviceDeployment, backendDeployment, role (PRIMARY/BACKUP/CACHE/SHARD), priority, weight | Backend connection graph |

**Deployment Status Flow:** `STOPPED → STARTING → RUNNING → STOPPING → STOPPED` (or `→ FAILED`)

**Health Status Flow:** `UNKNOWN → HEALTHY → DEGRADED → UNHEALTHY`

**Key Capabilities:**
- **Framework-Agnostic**: Supports Spring Boot, Quarkus, Micronaut, NestJS, AdonisJS, Moleculer, Express, Python, Go, Helidon, and more
- **Heartbeat Monitoring**: Continuous health checks via `POST /api/registry/heartbeat/{serviceName}`
- **Deployment Tracking**: Status flow with health check integration
- **Configuration Management**: Environment-specific configs with secret detection
- **Backend Connection Graph**: Track PRIMARY/BACKUP/CACHE/SHARD/READ_REPLICA relationships between deployments
- **Redis Caching**: Optional Redis for real-time service status updates

---

### service-broker Modules

The `jvm/spring/service-broker/` directory contains a comprehensive microservice ecosystem that the broker-gateway routes to:

| Module | Port | Purpose |
|--------|------|---------|
| `admin-logging` | — | Administrative audit logging |
| `broker-discovery-service` | — | Service discovery within the broker mesh |
| `broker-gateway` | 8081 | Primary request routing gateway (detailed above) |
| `broker-gateway-sec-bot` | — | Security bot for gateway |
| `broker-service` | — | Core broker service logic |
| `broker-service-spi` | — | Broker service SPI contracts |
| `export-service` | — | Data export capabilities |
| `file-service` | — | File management service |
| `file-service-api` | — | File service API contracts |
| `login-service` | — | Authentication service (Redis-based session mgmt) |
| `losm-host-service` | — | LOSM hosting service |
| `note-service` | — | Note management |
| `search-service` | — | Search functionality |
| `shrapnel-data` | — | Data shrapnel/shared fragments |
| `upload-service` | — | File upload service |
| `user-access-service` | — | User access management (PostgreSQL-based auth) |
| `user-service` | — | User management (deprecated — being phased out) |

**Note:** `user-service` is deprecated. Authentication is now handled by `user-access-service` (PostgreSQL, port 9093 via Helidon) for registration/credential validation and `login-service` (Redis) for session token management.

### Quarkus & Helidon

| Service | Port | Path | Framework | Purpose |
|---------|------|------|-----------|---------|
| **broker-gateway** | 8090 | `jvm/quarkus/broker-gateway` | Quarkus 3.15.1 | Quarkus reimplementation of the broker gateway (alternative runtime) |
| **user-access-service** | 9093 | `jvm/helidon/user-access-service` | Helidon MP 4.x | User access management (Java 17 compat) — PostgreSQL-based user registration and credential validation |

### Ballerina

| Project | Path | Purpose |
|---------|------|---------|
| `demo_package` | `jvm/ballerina/demo_package` | Ballerina demo/experimental package |

### JVM Shared Libraries (`jvm/shared/`)

| Library | Provides |
|---------|----------|
| `core` | Shared core abstractions (base classes, common interfaces) |
| `broker-service-api` | Broker service API contracts (Feign interfaces, DTOs) |
| `service-registry-api` | Registry API contracts (registration, discovery) |
| `user-api` | User API contracts |
| `adapters.spring` | Spring adapter implementations |
| `adapters.quarkus` | Quarkus adapter implementations |
| `adapters.helidon` | Helidon adapter implementations |

---

### JVM Architecture Overview

```
                               ┌──────────────────┐
                               │  peb-kernel :8080 │
                               │  (Governance +    │
                               │   Merkle ledger)  │
                               └────────┬─────────┘
                                         │ peb-mcp (stdio)
                                         ▼
                               ┌──────────────────┐
                               │  conduit-mcp     │
                               │  (plan lifecycle)│
                               └──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ broker-gateway   │◄──►│ service-registry │◄──►│ terrain :8084         │
│ :8081            │    │ :8085            │    │ (topology registry)   │
│ (API gateway)    │    │ (service disc.)  │    └──────────────────────┘
└────────┬─────────┘    └──────────────────┘              │
         │                                                │ terrain-mcp
         ▼                                                ▼
┌────────────────────────────────────────────────────┐
│            service-broker Modules                    │
│  user-svc  login-svc  file-svc  note-svc  search   │
│  upload    export     admin-log  losm-host  shrapnel│
└────────────────────────────────────────────────────┘

┌──────────────────┐    ┌──────────────────────────┐
│ Quarkus Gateway  │    │ Helidon User-Access      │
│ :8090            │    │ :9093                    │
└──────────────────┘    └──────────────────────────┘
```

### Key Design Properties

| Property | terrain | peb-kernel | broker-gateway | service-registry |
|----------|---------|------------|----------------|------------------|
| **Database** | PostgreSQL (terrain) | PostgreSQL + Flyway | MongoDB | PostgreSQL + Redis |
| **State Model** | CRUD + seeding | Immutable event-sourced + Merkle chain | Request/response routing | CRUD + heartbeat + deployment lifecycle |
| **API Pattern** | RESTful CRUD | REST + capability-gated | ServiceRequest/ServiceResponse | RESTful CRUD + registry heartbeats |
| **Polyglot** | TypeScript MCP clients | Python conduit clients | Any HTTP client | Any framework (Spring, Quarkus, Python, Go, etc.) |
| **MCP Bridge** | terrain-mcp (stdio → REST) | peb-mcp (stdio → REST) | — | Registered via broker-gateway |
| **Startup** | `mvn spring-boot:run` | `cd peb-bootstrap && mvn spring-boot:run` | `./start-{profile}.sh` | `./start.sh` |

See **[JVM_PIPELINE_FLOW.md](./JVM_PIPELINE_FLOW.md)** for complete Mermaid diagrams of the JVM service data flows:

- **Architecture Overview** — All 4 JVM services + MCP bridges + data stores
- **terrain Flow** — 8 controllers, 7 entities, polymorphic dependencies, idempotent seeding
- **peb-kernel Execution Flow** — 7-layer multi-module architecture, 6-step governance pipeline, Merkle chain sequence diagram
- **service-registry Lifecycle** — 6 registry endpoints, 7 core entities + 9 lookup tables, deployment/health state machines, backend connection graph
- **broker-gateway Routing** — 3 environment profiles, 9-step routing flow, startup sequence

---

## V. Python Layer

### Cognitive Runtime & Pipelines

| Module | Path | Entrypoints | Purpose |
|--------|------|-------------|---------|
| **nbk** | `python/nbk/` | `cli.py` | Nexus Bootstrap Kernel — minimal causal graph execution engine implementing 5 irreducible primitives and a self-modifying execution loop |
| **ir** | `python/ir/` | — (library) | Typed execution semantics for the cognitive runtime — 4 sub-layers: SM-IR (StateDAG), TEM-IR (CausalEvent/TimeModel), RL-IR (RoleLease/LeaseCompiler), LS-IR (WorkSurface/Arbitration/Scheduler/Dispatcher) |
| **cascade** | `python/cascade/` | `main.py` | Pure Event Bus — System of Record for Thought. Polls `events/` directory, validates, and publishes events via NATS JetStream sidecar. No LLM calls, no workflow orchestration. |
| **conduit** | `python/conduit/` | `main.py`, `app/main.py`, `cli/`, `bridge/daemon.py` | Cron-driven orchestrator consuming `pipeline.db` and dispatching WorkRequests to AI executors. Contains `app/`, `cli/`, and two critical sub-systems: |

**WRP Bridge Daemon** (`bridge/daemon.py`, `bridge/sync/syncer.py`, `bridge/checkpoint.py`):
- Standalone daemon that polls `vision.receipts` in PostgreSQL via `CONDUIT_PG_DSN` every 30s
- Loads checkpoint (last_id, last_recorded_on_dt) from disk
- Queries new receipts ordered by (recorded_on_dt ASC, id ASC), enriched with plan data from `conduit.plans`
- Performs **semantic mapping** — converts each conduit receipt to kernel format (dependencies, files_affected from plan enrichment)
- Builds `KernelDelta` payload and POSTs to wrp-kernel at `KERNEL_API_URL/delta/`
- Saves checkpoint on success; skips checkpoint on kernel rejection (retries next poll)

**WRP Kernel Runtime** (`wrp_kernel/`, port 3103):
- Available as an MCP server via stdio, exposing a 5-step deterministic reduce pipeline:
  1. **Receipt Materialization** — insert receipts into `KernelState.receipts`, dedup check (rejects duplicate receipt_id)
  2. **Identity Resolution** — `IdentityEngine.resolve(node_id, plan_id) → identity_id`, ensuring cross-plan continuity
  3. **Graph Update** — build `GraphIndex` edges: `wrp:depends_on` from plan dependencies, `wrp:impacts_system` from files_affected
  4. **Lineage Recording** — `LineageEngine.record_from_delta()` appends append-only causal trace
  5. **Commit** — increment `KernelState.version++`, return new state; all-or-nothing (any failure restores original state snapshot)
- **WRP State Machine** adjacency matrix with 10 states: `CREATED → INTAKE → PLANNING → CRITIQUE → SPECIFICATION → APPROVED → QUEUED → EXECUTING → COMPLETED → ARCHIVED` (any state → `FAILED` is terminal)
- Receipt types map to WRP states: `PROPOSED→CREATED`, `PLAN_CREATE→PLANNING`, `CRITIQUE→CRITIQUE`, etc.
- **KSRA (Kernel Snapshot Reconstruction Algorithm)**: `KernelState(N) = Snapshot(K) + Replay(deltas K+1 → N)` for deterministic state reconstruction
- Errors are first-class `KernelError` nodes in the lineage graph (never thrown as exceptions): INVARIANT_VIOLATION, IDENTITY_CONFLICT, GRAPH_CYCLE, VERSION_MISMATCH, INVALID_TRANSITION, VALIDATION_ERROR

See **[WRP_PIPELINE_FLOW.md](./WRP_PIPELINE_FLOW.md)** for the full data flow diagram, sequence diagram, and state lifecycle diagram.
| **meep** | `python/meep/` | `cli.py` | Minimal End-to-End Pipeline — 6-station deterministic pipeline from text prompt to replayable CER event log (IRL classifier → IR resolver → Spec compiler → Lowering pass → Scheduler → Replay engine). 11 frozen archetypes (Phase 0). |

See **[COGNITIVE_RUNTIME_FLOW.md](./COGNITIVE_RUNTIME_FLOW.md)** for complete Mermaid diagrams of the cognitive runtime data flows:

- **Architecture Overview** — NBK → IR (4 sub-layers) → Cascade → MEEP with cross-cutting shared types
- **NBK Flow** — 5 irreducible primitives, graph construction, execution engine, trace/replay, CAL addressing, SCQL query, SOCO mutation rules
- **IR State & Scheduling Flow** — SM-IR StateDAG version expansion, TEM-IR temporal causality, RL-IR role leasing, LS-IR WorkSurface/Arbitration/Dispatcher/Scheduler
- **MEEP 6-Station Pipeline** — IRL classifier → IR resolver → Spec compiler → Lowering freeze → Scheduler → Replay engine, with archetype templates and execution sequence
- **Cascade Event Bus** — Disk polling, offset tracking, NATS JetStream sidecar, envelope wrapping, inference bridge (POC)

### Harvest & Knowledge Management

| Module | Path | Purpose |
|--------|------|---------|
| **rover** | `python/rover/` | Harvest pipeline — processes chat transcripts, NLP output, and LOSM documents into the knowledge graph. Uses Ollama embeddings for semantic search. |
| **steward** | `python/steward/` | Knowledge Graph Migration — reads `nexus/graph/nexus-knowledge-graph.json`, parses entity sections (types, actors, epistemic_types, state_machines, architectural_observations, decisions, gaps_and_blockers, rules, topology, boundaries), and inserts into `knowledge.graph_entities`, `knowledge.graph_edges`, and `knowledge.graph_cross_references` tables. Maintains migration history in `knowledge.graph_migrations`. The exclusive write path for the knowledge graph. |
| **absorb** | `python/absorb/html/` | Ingestion and Absorption Pipeline — converts chat transcripts, HTML, PDF, DOCX, PPTX, EPUB, and images into structured knowledge using **DoclingAdapter** (multi-format document converter replacing BeautifulSoup). Includes a multi-parser architecture supporting ChatGPT HTML, Gemini, Copilot, OpenCode, and markdown formats. Contains **NexusVM** — a temporal DAG execution ledger with fork/merge timeline semantics, and a cryptographically chained deterministic Kernel with FSM Controller (5-step trace: schema validation → FSM transition → causality check → graph mutation → hash chain). Error events are first-class lineage nodes, not exceptions.

See **[ABSORPTION_PIPELINE_FLOW.md](./ABSORPTION_PIPELINE_FLOW.md)** for complete Mermaid diagrams of the ingestion pipeline:

- **Architecture Overview** — All pipeline stages from file discovery through graph construction and kernel execution
- **File Discovery & Ingestion Flow** — Recursive directory scan, 22 supported extensions, DocLing conversion
- **Parser Detection & Dispatch Flow** — 6 registered parsers, registry-based dispatch, 3-phase fallback chain
- **Span Segmentation & Normalization Flow** — Zero-normalization ingress, 4 span types, 8-step CCNF normalization
- **Graph Mode Pipeline (6 Stages)** — GraphBuilder → TrajectoryReconstructor → Semantic Inference → Kernel → Validation → Workspace Assembly
- **Key Data Structures** — Span types, ConversationGraph registries, Kernel state chain, NexusVM temporal DAG |

### AI & Vision Services

| Module | Path | Purpose |
|--------|------|---------|
| **vision** | `python/vision/` | Vision LOSM (Line-of-Sight Mapping) — FastAPI REST API on port 8003 (`vision-srv-py`). Processes work requests, artifacts, and LOSM branches. Includes `vision-mcp` Python MCP server. |
| **tackle** | `python/tackle/` | AI config registry and inference routing. Provides CLI command building, role-to-model routing, and the `agent-chat` server (port 3017) for dispatching prompts to opencode agents via SSE. |

### Utilities & Infrastructure

| Module | Path | Purpose |
|--------|------|---------|
| **voyager** | `python/voyager/` | Filesystem Acquisition Layer — CLI tool and daemon for scanning filesystem paths. Uses **Scanner** with **DedupeCache** (Redis) for change detection, **Publisher** (NATS) for emitting observations, and **TopologyEngine** for detecting structural patterns (vanishing directories, evolution, containment, adjacency signals). Publishes typed topology signals via NATS to the broader event system. |
| **fs** | `python/fs/` | Media Metadata Indexing Service — FastAPI REST API on port **8004** (`fs-crawler`) for media file metadata indexing and search. Supports scan/status/search/metadata/duplicate-detection/file-rule operations. Uses Redis + MongoDB + MySQL backends. Includes a broker-compatible adapter on port **8001** (`fs-crawler-adapter`) that wraps the REST API for service-registry integration, enabling discovery by broker-gateway. |
| **util** | `python/util/` | Shared Python utilities |
| **nats_envelope** | `python/nats_envelope/` | NATS message envelope handling |
| **scripts** | `python/scripts/` | Utility scripts |

---

## VI. Infrastructure & Data Layer

### Databases

| Database | Port | Technology | Schema(s) / Databases | Purpose |
|----------|------|------------|----------------------|---------|
| **PostgreSQL** | 5432 | PostgreSQL 17 + pgvector | 10 schemas (see below) | Primary operational database. pgvector extension enables embedding-based semantic search. |
| **SQLite** | — | SQLite 3 | `conduit/pipeline.db` | Legacy pipeline database (being migrated to PostgreSQL). Plans, receipts, tickets, sessions. |
| **MongoDB** | 27017 | MongoDB 4.4.18 | `atomic-mongodb` | Document store for broker-gateway, user services, and media metadata |

### PostgreSQL Schema Details

The PostgreSQL instance at `localhost:5432/nexus` hosts **10 active schemas** across the polyglot service ecosystem. Each schema is owned by one or more services:

| Schema | Service | Key Tables | Row Count* | Purpose |
|--------|---------|------------|-----------|---------|
| **`terrain`** | terrain (:8084) | `service_types`, `mcp_servers`, `runnable_services`, `servers`, `service_dependencies`, `broker_profiles`, `registry_server_profiles` | 40+ | Service topology registry — canonical source for all Nexus infrastructure |
| **`nebula`** | nebula-srv (:3101), nebula-mcp | `systems`, `subsystems`, `features`, `requirements`, `system_folders`, `work_sessions`, `audit_files`, `harvests`, `harvest_candidates`, `agent_records`, `projections`, `cross_references`, `system_info_tabs`, `system_workspaces`, `user_preferences` | 150+ | Requirements Management System (RMS), harvest pipeline output, agent artifacts, projections |
| **`knowledge`** | knowledge-mcp, steward | `graph_entities` (with pgvector embedding), `graph_edges`, `graph_cross_references`, `graph_migrations` | 1,000+ | Knowledge graph — entities with semantic embeddings, typed edges, cross-references, migration history |
| **`vision`** | vision-srv (:3104), vision-mcp | `receipts`, `work_requests`, `artifacts`, `branches` (via LOSM schema) | 500+ | Vision LOSM (Line-of-Sight Mapping) — work request receipts and pipeline state |
| **`conduit`** | conduit-mcp (:3100) | `plans`, `tickets`, `receipts`, `sessions`, `circuit_breaker`, `model_pricing`, `agent_budgets`, `cost_logs`, `kernel_delta_log`, `kernel_snapshot`, `lineage_log` | 300+ | Pipeline orchestration — plan lifecycle, receipt chain, tickets, cost tracking, WRP kernel state |
| **`vector`** | conduit-mcp (:3100) | `providers`, `harnesses`, `models`, `role_config`, `role_models` | 20+ | AI configuration registry — provider/harness/model definitions and role-to-model routing |
| **`tackle`** | tackle-mcp (:3400), role-memory-srv (:3500) | `memory`, `role_memory` (with bitemporal exclusion) | 15+ | Role Memory Procedure Registry — procedure definitions with role-based access and bitemporal validity |
| **`peb`** | peb-kernel (:8080) | `peb_state`, `peb_decision`, `peb_transaction`, `peb_trace`, `peb_violation`, `peb_capability`, `peb_state_hash` | 0 (no source) | PEB governance — Merkle-chain-backed state ledger with capability-gated transitions |
| **`public`** | nebula-srv (:3101) | (system tables, pgvector catalog) | — | Default PostgreSQL schema, used for migration tracking and shared extensions |
| **`registry`** | service-registry (:8085) | `frameworks`, `services`, `servers`, `deployments`, `configurations`, `service_dependency`, `service_backend` + 9 lookup tables | 0 (no source) | Service registry — framework-agnostic service management with deployment lifecycle and heartbeat monitoring |

> \* Row counts are estimates from runtime data snapshots. Exact counts vary by deployment.

**pgvector Extension:** Used by `knowledge.graph_entities` for semantic search. Embeddings generated via Ollama `nomic-embed-text` (1536 dimensions). Indexed with IVFFLAT (cosine distance, 100 lists).

**Flyway Migrations (peb schema):**
- `V1__init_peb_schema.sql` — Core PEB domain tables (state, decisions, transactions, traces, violations, capabilities, state hashes)
- `V2__unique_transaction_id.sql` — Unique constraint on transaction IDs
- `V3__peb_schema.sql` — Schema refinements and additional indexes

### MongoDB Details

| Database | Collections | Service | Purpose |
|----------|-------------|---------|---------|
| **`atomic-mongodb`** | `users`, `sessions`, `login_attempts` | broker-gateway (:8081) | User and session data for service-broker ecosystem |
| **`fs-crawler`** | `files`, `directories`, `metadata`, `duplicates`, `categories`, `file_types`, `directory_types`, `file_handlers` | fs / media-metadata (:8004) | Media metadata indexing — file attributes, directory structure, duplicate detection, category taxonomy |
| **`atomic-mongodb`** | `assets`, `alias`, `alias_file_attribute`, `directory_amelioration`, `delimited_file_data`, `matcher`, `matcher_field`, `match_record`, `file_attribute`, `file_encoding`, `file_handler_registration` | (legacy fs-crawler) | Legacy media metadata collections (from `media.sql` schema, being phased out in favor of `fs-crawler`) |

### Redis Keyspace

Redis at `localhost:6379` is used for ephemeral caching, session state, and real-time status across multiple services:

| Key Pattern | Type | Service | Purpose |
|-------------|------|---------|---------|
| `mem:proc:{slug}` | String (JSON) | role-memory-srv (:3500) → tackle-mcp | Procedure body cache — full procedure markdown and metadata, populated from `tackle.memory` table |
| `mem:idx:{role}` | String (JSON array) | role-memory-srv (:3500) → tackle-mcp | Procedure index per role — `[{slug, summary, tags}]` for quick filtering |
| `mem:meta:last_updated` | String (ISO timestamp) | role-memory-srv (:3500) | Cache invalidation timestamp — agents check this to detect stale indexes |
| `dedupe:*` | String (hash/set) | voyager | Deduplication cache for filesystem scanning — tracks already-seen file paths and checksums |
| `session:*` | String | login-service, broker-gateway | User session tokens and metadata |
| `service:status:*` | String | service-registry (:8085) | Real-time service status updates (optional, configurable) |
| `scan:state:*` | String | fs / media-metadata (:8004) | Scan operation state persistence — batch cursors, progress, resume tokens |

### Message Bus & Caching

| Service | Port | Technology | Purpose |
|---------|------|-----------|---------|
| **NATS** | 4222 | NATS latest | Inter-service message bus for async communication — used by voyager (TopologySignal publisher), cascade (event pipeline), and wrp pipeline notifications |
| **Redis** | 6379 | Redis 8.x | In-memory cache, session store, procedure registry cache, deduplication cache, and real-time service status |

### Workflow & LLM

| Service | Port | Technology | Purpose |
|---------|------|-----------|---------|
| **Temporal** | 7233 | Temporal | Workflow orchestration engine (future integration — `temporal.sessions`, `temporal.work_requests`, `temporal.receipts` tables defined but not operational) |
| **Ollama** | 11434 | Ollama | Local LLM inference — provides `deepseek-coder` for code generation, `nomic-embed-text` (1536d) for pgvector embeddings in the knowledge graph |

### Service-to-Data-Store Mapping

The following table maps each service to its data stores, showing which schemas/databases it **reads** and **writes**:

| Service | Data Store | Schema / DB | Access Pattern | Key Operations |
|---------|-----------|-------------|----------------|----------------|
| **conduit-mcp** (:3100) | PostgreSQL | `conduit`, `vector` | **Read/Write** | Plan/ticket/receipt lifecycle; AI config CRUD; WRP kernel state machine |
| **conduit-mcp** | SQLite | `pipeline.db` | **Read/Write** (legacy) | Legacy pipeline state (migrating to PostgreSQL); removed once fully converged |
| **nebula-srv** (:3101) | PostgreSQL | `nebula`, `public` | **Read/Write** | RMS CRUD (systems/subsystems/features/requirements); harvests; agent records; projections |
| **nebula-mcp** (stdio) | PostgreSQL | `nebula`, `public` | **Read** (via nebula-srv) | Proxies all DB access through nebula-srv REST API |
| **terrain** (:8084) | PostgreSQL | `terrain` | **Read/Write** | Service topology CRUD; profile seeding; dependency management |
| **terrain-mcp** (stdio) | PostgreSQL | `terrain` | **Read** (via terrain REST) | Topology queries — services, servers, MCP servers, dependencies |
| **knowledge-mcp** (stdio) | PostgreSQL | `knowledge` | **Read** | Knowledge graph queries; semantic search via pgvector; entity/edge/ref listing |
| **steward** | PostgreSQL | `knowledge` | **Write** | Exclusive write path — migrates JSON knowledge graph into `graph_entities`, `graph_edges`, `graph_cross_references` |
| **tackle-mcp** (:3400) | PostgreSQL | `tackle` | **Read** | Procedure lookup; role-to-memory assignment resolution |
| **role-memory-srv** (:3500) | PostgreSQL → Redis | `tackle.memory`, `tackle.role_memory` | **Read (PG) → Write (Redis)** | Syncs PostgreSQL procedure registry to Redis cache on startup and `POST /refresh` |
| **vision-srv** (:3104) | PostgreSQL | `vision` | **Read/Write** | Vision LOSM CRUD — work requests, artifacts, branches |
| **vision-mcp** (stdio) | PostgreSQL | `vision` | **Read** (via vision-srv) | Proxies LOSM queries through vision-srv REST API |
| **peb-kernel** (:8080) | PostgreSQL | `peb` | **Read/Write** | Governance engine — event-sourced Merkle chain (PebDecision, PebState, PebTransaction); Flyway-migrated |
| **service-registry** (:8085) | PostgreSQL + Redis | `registry` | **Read/Write** | Service management CRUD; heartbeat monitoring; deployment lifecycle; optional Redis caching |
| **broker-gateway** (:8081) | MongoDB | `atomic-mongodb` | **Read/Write** | User/session data; service request routing state |
| **fs / media-metadata** (:8004) | MongoDB + Redis + MySQL | `fs-crawler`, Redis | **Read/Write** | Media file metadata indexing; Redis for scan state persistence; MySQL for config |
| **voyager** | Redis | `dedupe:*` keyspace | **Read/Write** | Filesystem deduplication cache; publishes TopologySignal to NATS |
| **cascade** | NATS | (JetStream) | **Publish/Subscribe** | Event bus — system of record for thought; polls `events/` directory |
| **wrp-bridge-daemon** | PostgreSQL | `vision.receipts`, `conduit.plans` | **Read** | Polls receipt table; enriches with plan data; builds KernelDelta |

### Data Flow Paths

**Primary Write Paths (who owns each schema):**
```
terrain schema   ← terrain (:8084) — TopologyDataInitializer seeds, REST API mutates
nebula schema    ← nebula-srv (:3101) — RMS CRUD + harvest ingestion + agent records
knowledge schema ← steward (exclusive write) — JSON knowledge graph → graph_entities/edges
vision schema    ← vision-srv (:3104) — LOSM work request lifecycle
conduit schema   ← conduit-mcp (:3100) — plan/ticket/receipt lifecycle + WRP kernel state
vector schema    ← conduit-mcp (:3100) — AI config (providers, harnesses, models, roles)
tackle schema    ← role-memory-srv (:3500) — syncs from tackle-mcp seed SQL to PG; PG→Redis cache
peb schema       ← peb-kernel (:8080) — Flyway migrations + governance decisions
registry schema  ← service-registry (:8085) — service registration + heartbeat + deployment lifecycle
atomic-mongodb   ← broker-gateway (:8081) — user & session data
fs-crawler       ← fs / media-metadata (:8004) — file metadata indexing
Redis mem:*      ← role-memory-srv (:3500) — PG→Redis cache sync
Redis dedupe:*   ← voyager — filesystem scan dedup
NATS JetStream   ← cascade — event publication
```

**Secondary Read Paths (read-only consumers):**
```
terrain schema   ← terrain-mcp (stdio), terrain_mcp MCP tools
nebula schema    ← nebula-mcp (stdio), knowledge-mcp (via cross-refs), conduit-mcp (harvest references)
knowledge schema ← knowledge-mcp (stdio), semantic search via pgvector
vision schema    ← vision-mcp (stdio), wrp-bridge-daemon (polls vision.receipts)
conduit schema   ← wrp-bridge-daemon (reads conduit.plans for enrichment, also reads vision.receipts)
tackle schema    ← tackle-mcp, role-memory-srv (PG→Redis sync)
```

---

## VII. Service Topology & Dependencies

### Terrain-Registered Services

The terrain topology server (port 8084, PostgreSQL `terrain` schema) is the canonical registry for all Nexus services. The terrain service types are:

| ID | Type |
|----|------|
| 1 | MCP (Model Context Protocol) |
| 2 | Microservice |
| 3 | Express |
| 4 | Proxy |
| 5 | Bun |
| 6 | Spring Boot |
| 7 | CLI Tool |
| 8 | Database |
| 9 | Message Queue |
| 10 | Workflow Engine |
| 11 | AI / Local LLM |
| 12 | Python Service |

**Total registered:** 10 MCP servers, 26 runnable services.

### Dependency Graph (from terrain.service_dependencies)

| Source | Target | Criticality | Description |
|--------|--------|-------------|-------------|
| vision-mcp-py (MCP) | vision-srv-py (Python :8003) | **critical** | MCP stdio proxy → FastAPI REST API |
| vision-mcp (MCP) | vision-srv (Express :3103) | **critical** | MCP stdio proxy → Express REST API |
| wrp-bridge-daemon | PostgreSQL (:5432) | **high** | PostgreSQL for checkpoint storage |
| wrp-bridge-daemon | wrp-kernel (MCP :3103) | **high** | POSTs KernelDeltas for state machine |
| terrain-mcp (MCP) | nebula-srv (Express :3101) | medium | terrain-mcp → nebula-srv |
| nebula-mcp (MCP) | nebula-srv (Express :3101) | medium | nebula-mcp → nebula-srv |
| conduit-mcp (MCP) | nebula-srv (Express :3101) | medium | conduit-mcp → nebula-srv |
| tackle-mcp (MCP) | nebula-srv (Express :3101) | medium | tackle-mcp → nebula-srv |
| terrain-mcp (MCP) | terrain (Spring :8084) | medium | terrain-mcp → terrain server |
| broker-gateway (Spring :8081) | nebula-srv (Express :3101) | medium | broker-gateway → nebula-srv |
| vision-srv (Express :3103) | nebula-srv (Express :3101) | medium | vision-srv → nebula-srv |

### Architecture Diagram

See **[SERVICE_TOPOLOGY.md](./SERVICE_TOPOLOGY.md)** for the full interactive Mermaid topology diagrams, including:

- **Architecture Overview** — 8-layer topological map with all 30+ services, color-coded by layer, with edge styles indicating dependency criticality
- **Dependency Map** — All terrain-registered dependencies grouped by criticality level (critical, high, medium)
- **Port Allocation Diagram** — All 24 port-mapped services color-coded by layer

See **[WRP_PIPELINE_FLOW.md](./WRP_PIPELINE_FLOW.md)** for focused Mermaid diagrams of the WRP pipeline data flow:

- **Data Flow Diagram** — End-to-end flow: PostreSQL → bridge daemon → KernelDelta → 5-step reduce → commit
- **Timing & Sequence Diagram** — Sequential interactions between PostgreSQL, Bridge Daemon, WRP Kernel, and KernelState
- **State Lifecycle Diagram** — Polling → POST → Commit / Rollback → Checkpoint → Reconstruction lifecycles

See **[JVM_PIPELINE_FLOW.md](./JVM_PIPELINE_FLOW.md)** for the JVM service data flows referenced in Section IV:

- **Architecture Overview** — 4-service topology with MCP bridges and data stores
- **terrain Flow** — Controller-to-entity data flow and startup seeding
- **peb-kernel Execution Flow** — Governance pipeline and Merkle chain diagrams
- **service-registry Lifecycle** — Service registration, deployment status, and health state machines
- **broker-gateway Routing** — Request routing and startup sequence

---

## VIII. MCP Server Architecture Pattern

All TypeScript MCP servers follow a consistent architecture:

1. **Transport:** Primarily **stdio** (launched by AI clients as subprocesses). SSE-based servers (`conduit-mcp` SSE bus, `nebula-mcp-sse` on port 3102) support HTTP-based clients.
2. **Database:** Direct PostgreSQL connection via `pg` pool, querying dedicated schemas.
3. **Tool Registration:** Zod-validated tool schemas registered via `McpServer.tool()`. All tools return typed JSON.
4. **Lifecycle:** Graceful shutdown via `SIGINT`/`SIGTERM` with connection pool cleanup.
5. **Proxying Pattern:** MCP servers that proxy to REST APIs (nebula-mcp → nebula-srv, vision-mcp → vision-srv) use the `@modelcontextprotocol/sdk` to wrap REST calls as MCP tools.

---

## IX. Development Workflow

### Service Management via Terrain

The terrain topology server and terrain-mcp provide unified service management:

- **Query:** `terrain_list_runnable_services`, `terrain_list_mcp_servers`, `terrain_get_service_status`, `terrain_infrastructure_summary`
- **Register:** `terrain_register_runnable_service`, `terrain_register_mcp_server`, `terrain_register_cli_tool`
- **Update:** `terrain_set_service_status`
- **Dependencies:** `terrain_list_dependencies`, `terrain_register_dependency`

### Starting Services

| Service Type | Start Command |
|-------------|---------------|
| TypeScript MCP (stdio) | `cd typescript/<name> && npm run dev` |
| TypeScript REST | `cd typescript/<name> && npm run dev` |
| Spring Boot | `cd jvm/spring/<name> && mvn spring-boot:run` |
| Python FastAPI | `cd python/<path> && uvicorn <module>:app --port <port>` |
| Python script | `python3 python/<path>/<script>.py` |
| Frontend (Angular) | `cd angular/<name> && npm run dev` |
| Frontend (React/Vite) | `cd angular/<name> && npm run dev` |

### Knowledge Harvest Pipeline

Chat transcripts and architectural documents are processed through the **rover** harvest pipeline:
1. Raw HTML/chat files in `chats/` directory are ingested by `python/rover/batch_process*.py` scripts
2. Content is chunked, embedded via Ollama (`nomic-embed-text`), and stored in `knowledge.graph_entities` and `knowledge.graph_edges`
3. Harvest records are stored via `POST /api/harvests` on nebula-srv (:3101)
4. Cross-references and migrations are tracked in `knowledge.graph_cross_references` and `knowledge.graph_migrations`
5. Semantic search across both curated (`graph_entity_embeddings`) and harvested (`harvest_candidate_embeddings`) data is available via `knowledge_semantic_search` on knowledge-mcp

### Plan Lifecycle (via conduit-mcp)

Work is tracked through a plan lifecycle managed by conduit-mcp:
1. **Proposed** — `create_proposed_plan()` → proposed state, issues PROPOSED receipt
2. **Active** — `create_plan()` with acceptance criteria → pending state, issues PLAN_CREATE receipt
3. **Execution** — Builder processes work; builds linked via builder tickets
4. **Review** — Reviewer approves/rejects
5. **Complete** — Plan closed with final receipt

Plans are stored in `conduit` schema (PostgreSQL) and synced to markdown projections in `audit/IMPLEMENTATION_PLANS/`.

---

## X. Key Architectural Patterns

### Database-First Architecture
PostgreSQL is the **only** canonical store for agent artifacts. Filesystem markdown files are on-demand projections regenerated from database state — never a source of truth.

### Role-Driven Messaging
Agents communicate via tag-routed database records (inbox/outbox pattern) rather than folder polling. Tags follow kebab-case conventions: `to:<role>`, `status:<state>`, `type:<message_type>`.

### Epistemic Governance
No single role may unilaterally close a decision in another role's domain. Decisions emerge from negotiated tension across tag-routed messages. Each role owns its domain's binding output:
- **Architect** — architecture decisions (`type:decision`)
- **Builder/Engineer** — implementation work (`type:change`)
- **Reviewer** — review judgement (`type:approval`/`type:rejection`)
- **Planner** — plan proposals (`type:proposal`)
- **Analyst** — issue triage (`type:triage`)
- **Inspector** — compliance violations (`type:violation`)

### Day/Night Turn Boundary
Sessions follow a perceptual cycle: **Day** (within-turn evidence accumulation) and **Night** (between-session reconciliation, belief state recomputation, projection regeneration).

### Knowledge Stratification
Documents in the knowledge graph carry two independent attributes:
- **Abstraction Level (L1-L4):** Raw/operational → Structured → Planning/architectural → Meta/system reasoning
- **Visibility Scope:** `builder`, `architect`, `planner`, `reviewer`, `all`

Each role sees a filtered view of the same graph tuned to its level and scope.

### WorkRequest Pipeline (operational)

The WorkRequest Pipeline coordinates 10+ services across the Python, TypeScript, and JVM layers to move work from user intent to committed state. The pipeline is organized into three stages: **plan orchestration** (conduit-mcp), **receipt projection** (wrp-bridge-daemon → wrp-kernel), and **JVM governance & discovery** (peb-kernel, service-registry, broker-gateway, terrain).

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    STAGE 1: Plan Orchestration                          │
│                                                                          │
│  User Intent → conduit-mcp (:3100) → PostgreSQL (vision.receipts)        │
│       │                                                                  │
│       ├── Proposes idea → PROPOSED receipt                              │
│       ├── Creates plan  → PLAN_CREATE receipt                           │
│       ├── Reviews work  → REVIEW / REVIEW_PASS / REVIEW_REJECT receipt  │
│       └── Completes     → COMPLETED receipt (terminal state)            │
│                                                                          │
│  conduit-ui (:4201) provides real-time SSE visibility into plan state.  │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │ vision.receipts table
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    STAGE 2: Receipt Projection                          │
│                                                                          │
│  wrp-bridge-daemon (polls PostgreSQL every 30s)                              │
│       │                                                                  │
│       ├── Load checkpoint (last_id, last_recorded_on_dt)                 │
│       ├── Query new receipts with enrichment from conduit.plans          │
│       ├── Semantic mapping: conduit receipt → kernel format              │
│       ├── Build KernelDelta → POST to :3103                              │
│       └── Save checkpoint on success / skip on rejection                 │
│                                                                          │
│  wrp-kernel (:3103) — 5-Step Reduce Pipeline                            │
│       ├── 1. Receipt Materialization (dedup, insert)                     │
│       ├── 2. Identity Resolution (node_id → identity_id)                │
│       ├── 3. Graph Update (edges: depends_on, impacts_system)           │
│       ├── 4. Lineage Recording (append-only causal trace)                │
│       └── 5. Commit (version++, snapshot to PostgreSQL)                 │
│                                                                          │
│  KernelState (versioned, checkpointed to PostgreSQL :5432)              │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │ query + invoke
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    STAGE 3: JVM Governance & Discovery                  │
│                                                                          │
│  peb-kernel (:8080) — Governance & Merkle Ledger                        │
│       │  Manages plan decisions as cryptographically-chained            │
│       │  PebDecision records with SHA-256 hashes.                       │
│       │  Each state transition through the pipeline is governed          │
│       │  by PebCapability token checks.                                 │
│       │                                                                  │
│       ├── Architect proposes → PebGovernanceEngine validates             │
│       ├── Builder executes   → InvariantValidator checks invariants     │
│       ├── Reviewer approves  → PebHashService Merkle-chain hashing      │
│       └── All tracked via    → PebDecision (beforeHash, afterHash,      │
│                                parentDecisionId) in PostgreSQL          │
│                                                                          │
│  service-registry (:8085) — Service Discovery & Lifecycle              │
│       │  Tracks all services that execute plan work.                    │
│       │  broker-gateway (:8081) discovers executors via service-registry│
│       │  Heartbeat monitoring ensures executor liveness.               │
│       │                                                                  │
│       ├── Architect → terrain-mcp → terrain (:8084) discovers topology   │
│       ├── Builder  → broker-gateway → service-registry gets endpoints   │
│       ├── Executor → service-registry → heartbeat + deployment status   │
│       └── Reviewer → nebula-mcp → nebula-srv queries agent records     │
│                                                                          │
│  terrain (:8084) — Topology Registry                                   │
│       │  Provides canonical service inventory for all pipeline actors.  │
│       │  Agents use terrain-mcp to find which MCP servers, microservices,│
│       │  or CLI tools are available for execution.                      │
│       └── Registered: 10 MCP servers, 28 runnable services             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### End-to-End Plan Lifecycle with JVM Coordination

The table below maps each plan lifecycle phase to the services that participate, showing how the Python WRP pipeline coordinates with the JVM governance layer:

| Phase | Receipt Type | WRP State | Primary Service | JVM Participation |
|-------|-------------|-----------|-----------------|-------------------|
| **Propose** | `PROPOSED` | CREATED | conduit-mcp | peb-kernel: creates genesis PebDecision{parentDecisionId=null}, records capability check `cap:create_plan` |
| **Plan** | `PLAN_CREATE` | PLANNING | conduit-mcp | peb-kernel: creates PebDecision linked to PROPOSED, validates against PebCapability tokens; service-registry: discovers available executors via `/api/registry/services/by-operation` |
| **Critique** | `CRITIQUE` / `CRITIQUE_PASS` / `CRITIQUE_REJECT` | CRITIQUE → SPECIFICATION or back to PLANNING | conduit-mcp | peb-kernel: PebDecision records critique outcome with beforeHash/afterHash; terrain-mcp: agent queries topology for impacted services |
| **Specify** | `(implicit)` | SPECIFICATION → APPROVED | conduit-mcp | peb-kernel: InvariantValidator checks system invariants; service-registry: identifies candidate executors via /by-operation |
| **Queue** | `REQUEUED` | QUEUED | conduit-mcp | peb-kernel: PebDecision records queued state; broker-gateway: prepares routing to executor |
| **Execute** | `IMPLEMENTATION` | EXECUTING | wrp-bridge-daemon | peb-kernel: PebHashService computes merkle hash of execution result; service-registry: heartbeat monitoring during execution; broker-gateway: routes implementation requests to target services |
| **Review** | `REVIEW` / `REVIEW_PASS` / `REVIEW_REJECT` | APPROVED → COMPLETED / back to EXECUTING | conduit-mcp | peb-kernel: final PebDecision seals the chain with terminal parentDecisionId; terrain: updates service status if deployment changed |
| **Archive** | `CANCELLED` | ARCHIVED | conduit-mcp | peb-kernel: PebDecision recorded as ARCHIVED with archival timestamp; service-registry: deregisters deployment if applicable |
| **Fail** | `BLOCK` / `API_LIMIT` / `ABANDONED` | FAILED (terminal) | conduit-mcp | peb-kernel: PebViolation created with failure context; peb-kernel: PebDecision records terminal FAILED state |

---

### peb-kernel Governance Interaction Detail

The peb-kernel participates at every plan lifecycle transition via peb-mcp (the MCP stdio bridge). Each conduit-mcp receipt emission triggers a governance check:

```
conduit-mcp → issues receipt to PostgreSQL (vision.receipts)
    ↓
peb-mcp (stdio) → POST to peb-api (AdmissionControllerFacade)
    ↓
1. PebGovernanceEngine evaluates: does this transition have the
   required PebCapability token?
   (e.g., cap:transition_plan:from=PLANNING:to=CRITIQUE)

2. InvariantValidator checks system invariants:
   - State machine consistency (WRP adjacency matrix)
   - Cross-plan dependency integrity
   - Resource availability

3. PebTransactionEngine opens @Transactional context

4. PebHashService computes SHA-256 Merkle checksums:
   - beforeHash: SHA-256 of system state before transition
   - afterHash: SHA-256 of system state after transition
   - parentDecisionId: links to previous PebDecision (cryptographic DAG)

5. Commit: PebTransaction + PebDecision saved to PostgreSQL

6. Result returned to conduit-mcp: {decisionId, hashes, version}
```

All governance artifacts are stored in the `peb` PostgreSQL schema (Flyway-migrated) and are independently queryable via `peb-mcp` tools without touching the WRP pipeline.

---

### service-registry Discovery & Executor Resolution

When a plan enters the EXECUTING phase, the service-registry provides executor resolution:

```
Builder Agent (via terrain-mcp)
    ↓
1. Query terrain for available executors:
   terrain-mcp → terrain (:8084) → PostgreSQL (terrain schema)
   Returns: list of MCP servers / runnable services matching criteria

2. Resolve endpoint via service-registry:
   broker-gateway (:8081) → service-registry (:8085)
   GET /api/registry/services/by-operation/{operation}
   Returns: {endpoint, status, healthStatus, deployment}

3. Invoke executor:
   broker-gateway → ExternalServiceInvokerImpl → target microservice
   Monitored via: circuit breakers + health checks

4. Track execution:
   service-registry heartbeat: POST /api/registry/heartbeat/{name}
   Deployment status: RUNNING → COMPLETED (or → FAILED)

5. Report results back:
   conduit-mcp issues REVIEW receipt → triggers next lifecycle phase
```

**Key design properties:**
- **Deterministic**: Same receipts + same KernelDelta → same KernelState (pure function)
- **Idempotent**: Re-sending the same receipt batch produces identical state
- **Re-runnable**: Crash between POST and checkpoint → next poll re-sends (ordering-safe via composite `(recorded_on_dt, id)` cursor)
- **All-or-nothing**: Any 5-step reduce failure restores original state snapshot (errors are `LineageEvent` nodes, not exceptions)
- **Replayable via KSRA**: `KernelState(N) = Snapshot(K) + Replay(deltas K+1 → N)`
- **Governance-anchored**: Every state transition is a PebDecision in the Merkle chain, independently verifiable from the WRP kernel state
- **Role-based**: Architect plans, Builder implements, Reviewer approves — each step recorded as a typed receipt with state transitions per the WRP adjacency matrix

See **[WRP_PIPELINE_FLOW.md](./WRP_PIPELINE_FLOW.md)** for complete data flow, sequence, and lifecycle diagrams.
See **[JVM_PIPELINE_FLOW.md](./JVM_PIPELINE_FLOW.md)** for peb-kernel governance execution flow, service-registry lifecycle, and broker-gateway routing flow.

---

## XI. Port Allocation Summary

| Port Range | Allocation | Examples |
|-----------|-----------|----------|
| 3000-3002 | Frontend (Vue/Vite/Angular) | nebula-ui, plurality-ui, duality-ui |
| 3017 | AI/Tackle | agent-chat |
| 3100-3103 | MCP Servers | conduit-mcp, nebula-srv, nebula-mcp-sse, vision-srv-py |
| 3104+ | Vision LOSM | vision-srv (TypeScript) |
| 3200 | Tool Aggregation | tools-aggregator |
| 3300-3499 | MCP Servers | tackle-mcp (3400) |
| 3500 | Memory Sync | role-memory-srv |
| 4040 | Filesystem | file-system-server |
| 4200-4201 | Frontend (Angular) | nexus-console, conduit-ui |
| 7233 | Workflow | Temporal |
| 8001 | Python Adapter | fs-crawler-adapter (broker-compatible) |
| 8003-8004 | Python FastAPI | vision-srv-py, fs / media-metadata |
| 8080-8089 | Spring Boot | peb-kernel, broker-gateway, terrain, service-registry |
| 9081 | Static Assets | image-server |
| 11434 | Local LLM | Ollama |
| 27017 | Database | MongoDB |
| 4222 | Messaging | NATS |
| 5432 | Database | PostgreSQL |
| 6379 | Cache | Redis |

---

## XII. Port Conflicts & Known Issues

| Port | Service A | Service B | Status |
|------|-----------|-----------|--------|
| 3103 | vision-srv (Express) | wrp-kernel / conduit uvicorn (conduit Python) | wrp-kernel running on 3103; vision-srv moved to 3104. The WRP kernel owns this port as the deterministic state machine endpoint. |
| 8084 | terrain | topology-server | Same process (duplicate registration in terrain) |
| 4040 | file-system-server (Node.js) | filesystem-server (Bun) | Registered as separate services on same port |

---

## Appendix: Terrain-Registered Services (Complete List)

### MCP Servers (10 total)
conduit-mcp (:3100), knowledge-mcp (stdio), nebula-mcp (→:3101), nebula-mcp-sse (:3102), peb-mcp (stdio), tackle-mcp (:3400), terrain-mcp (stdio), vision-mcp (stdio), vision-mcp-py (stdio — Python), wrp-kernel (:3103)

### REST API Servers (newly added)
role-memory-srv (:3500), tools-aggregator (:3200)

### Runnable Services (28 total)
agent-chat (:3017), broker-gateway (:8081), cascade, conduit-ui (:4201), duality-ui (:3002), file-system-server (:4040), filesystem-server (:4040), image-server (:9081), MongoDB (:27017), NATS (:4222), nebula-srv (:3101), nebula-ui (:3000), nexus-console (:4200), ollama (:11434), peb-kernel (:8080), plurality-ui (:3001), PostgreSQL (:5432), Redis (:6379), role-memory-srv (:3500), service-registry (:8085), Temporal (:7233), terrain (:8084), tools-aggregator (:3200), topology-server (:8084), vision-srv (:3103), vision-srv-3104 (:3104), vision-srv-py (:8003), wrp-bridge-daemon
