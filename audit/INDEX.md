# Nexus Architecture Documentation Index

> **Last updated:** 2026-06-28
> **Purpose:** Master index of all pipeline flow documents, topology diagrams, and architecture references in the `audit/` directory.
> Use this as the entry point to find the right diagram or document for any component of the Nexus system.

---

## 1. Core Architecture

| Document | Size | Diagrams | Covers |
|----------|------|----------|--------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 1,025 lines | — (prose + ASCII) | Full system architecture: all 12 sections covering TypeScript MCP/REST layer, JVM Spring Boot layer (terrain, peb-kernel, broker-gateway, service-registry), Python layer (cognitive runtime, harvest, AI/vision, utilities), WorkRequest pipeline with JVM integration, port allocation, service topology, infrastructure, and architectural patterns. **The canonical reference document.** |

### Quick Reference by Layer

| Layer | Section | Services Count | Key Docs |
|-------|---------|---------------|----------|
| **TypeScript MCP** | §III | 8 MCP servers | `SERVICE_TOPOLOGY.md` |
| **TypeScript REST** | §III | 6 REST APIs | `SERVICE_TOPOLOGY.md` |
| **UI/Frontend** | §III | 5 UIs | — |
| **JVM Spring Boot** | §IV | 4 primary + 17 service-broker | **[JVM_PIPELINE_FLOW.md](./JVM_PIPELINE_FLOW.md)** |
| **Python Cognitive** | §V | nbk, ir, cascade, meep | **[COGNITIVE_RUNTIME_FLOW.md](./COGNITIVE_RUNTIME_FLOW.md)** |
| **Python WRP** | §V | conduit/bridge + wrp-kernel (in-process lib) | **[WRP_PIPELINE_FLOW.md](./WRP_PIPELINE_FLOW.md)** |
| **Python Harvest** | §V | rover, steward | — |
| **Python AI/Vision** | §V | vision, tackle | — |
| **Python Utilities** | §V | voyager, fs, nats_envelope | — |
| **Infrastructure** | §VI | PostgreSQL, MongoDB, NATS, Redis, Ollama, Temporal | `SERVICE_TOPOLOGY.md` |

---

## 2. Topology & Service Maps

| Document | Type | Diagrams | Covers |
|----------|------|----------|--------|
| **[SERVICE_TOPOLOGY.md](./SERVICE_TOPOLOGY.md)** | Topology | 3 Mermaid | **Architecture Overview** (8-layer map: AI Agent → MCP → REST → UI → JVM → WRP Pipeline → Python → Infrastructure, color-coded, with edge criticality), **Dependency Map** (critical/high/medium dependency groups), **Port Allocation** (25 port-mapped services), plus Python Ecosystem detail table and WRP internal architecture ASCII diagram |

### Service Matrix

| Layer | Services | Ports | Transport |
|-------|----------|-------|-----------|
| **AI Agents** | Codebuff, Claude, OpenCode | — | MCP stdio |
| **MCP Servers** | conduit-mcp, nebula-mcp, nebula-mcp-sse, terrain-mcp, knowledge-mcp, tackle-mcp, peb-mcp, vision-mcp, vision-mcp-py | 3100-3400 (+ stdio) | stdio / SSE (:3100, :3102) |

> **Note:** `wrp-kernel` is an in-process Python library at `python/conduit/wrp_kernel/`, **not** an MCP server on port 3103. Canonical: `mcp_server_standalone_discrepancies` in `nexus/graph/nexus-knowledge-graph.json`.
| **REST APIs** | nebula-srv, vision-srv, role-memory-srv, tools-aggregator, file-system-server, image-server, broker-service-proxy, fs/media-metadata | 3101, 3104, 3200, 3334, 3500, 4040, 8004, 9081 | HTTP |
| **Frontend UIs** | nebula-ui, plurality-ui, duality-ui, nexus-console, conduit-ui | 3000-3002, 4200-4201 | HTTP (Angular/React/Vite) |
| **JVM Services** | peb-kernel, broker-gateway, terrain, service-registry | 8080-8081, 8084-8085 | HTTP (Spring Boot) |
| **Python Services** | vision-srv-py, agent-chat, wrp-bridge-daemon, nbk, ir, cascade, meep, rover, steward, voyager | 8003, 3017 | HTTP / process / NATS |

---

## 3. Pipeline Flow Documents

### 3.1 WRP Pipeline (WorkRequest Pipeline)

| Document | Type | Diagrams | Key Topics |
|----------|------|----------|------------|
| **[WRP_PIPELINE_FLOW.md](./WRP_PIPELINE_FLOW.md)** | Data Flow | 3 Mermaid | **Data Flow Diagram** (PostgreSQL → bridge daemon → KernelDelta → 5-step reduce → commit), **Timing & Sequence** (sequential interactions), **State Lifecycle** (polling → POST → commit/rollback → checkpoint → reconstruction), plus WRP adjacency matrix, receipt→state mapping table, KernelData/KernelState structures, KSRA algorithm |

**Key entry points:**
- **Entry:** `vision.receipts` table in PostgreSQL (populated by conduit-mcp)
- **Processor:** `python/conduit/bridge/daemon.py` (polls every 30s)
- **Engine:** `python/conduit/wrp_kernel/engine.py` (5-step reduce)
- **Output:** `KernelState` (versioned, checkpointed to PostgreSQL)

### 3.2 JVM Pipeline

| Document | Type | Diagrams | Key Topics |
|----------|------|----------|------------|
| **[JVM_PIPELINE_FLOW.md](./JVM_PIPELINE_FLOW.md)** | Service Flow | 9 Mermaid | **Architecture Overview** (4 JVM services + MCP bridges + data stores), **terrain Flow** (8 controllers, 7 entities, polymorphic dependencies, startup seeding), **peb-kernel Execution Flow** (7-layer Maven architecture, 6-step governance pipeline, Merkle chain sequence diagram), **service-registry Lifecycle** (6 registry endpoints, 7 core entities + 9 lookup tables, deployment/health state machines, backend connection graph), **broker-gateway Routing** (3 profiles, 9-step routing, startup sequence), plus Key Data Structures |

**Key entry points:**
- **terrain:** `jvm/spring/terrain/src/` — topology queries via terrain-mcp
- **peb-kernel:** `jvm/spring/peb-kernel/peb-bootstrap/` — governance via peb-mcp
- **broker-gateway:** `jvm/spring/service-broker/broker-gateway/` — routing via service-registry
- **service-registry:** `jvm/spring/service-registry/` — registration + discovery

### 3.3 Cognitive Runtime Pipeline

| Document | Type | Diagrams | Key Topics |
|----------|------|----------|------------|
| **[COGNITIVE_RUNTIME_FLOW.md](./COGNITIVE_RUNTIME_FLOW.md)** | Data Flow | 7 Mermaid | **Architecture Overview** (NBK → IR → Cascade → MEEP with shared types), **NBK Flow** (5 primitives, graph construction, execution engine, trace/replay, CAL addressing, SCQL query, SOCO mutation rules), **IR State & Scheduling Flow** (SM-IR StateDAG, TEM-IR temporal causality, RL-IR role leasing, LS-IR WorkSurface/Arbitration/Dispatcher/Scheduler), **MEEP 6-Station Pipeline** (IRL classifier → IR resolver → Spec compiler → Lowering freeze → Scheduler → Replay engine, with sequence diagram and archetype templates), **Cascade Event Bus** (disk polling, offset tracking, NATS JetStream sidecar, envelope wrapping, inference bridge), plus Integration Matrix and Design Properties table |

**Key entry points:**
- **NBK:** `python/nbk/cli.py` — `python3 -m nbk.cli run`
- **IR:** `python/ir/` — library, imported by MEEP and NBK
- **Cascade:** `python/cascade/main.py` — `NATS_URL=... python3 main.py`
- **MEEP:** `python/meep/cli.py` — `echo "prompt" | python3 -m meep.cli`

---

## 4. Document Dependencies & Cross-References

```
ARCHITECTURE.md ──┬── references ── SERVICE_TOPOLOGY.md
                  │                      ├── Architecture Overview (8-layer)
                  │                      ├── Dependency Map (criticality groups)
                  │                      └── Port Allocation (25 services)
                  │
                  ├── references ── WRP_PIPELINE_FLOW.md
                  │                   ├── Data Flow Diagram
                  │                   ├── Timing & Sequence Diagram
                  │                   └── State Lifecycle Diagram
                  │
                  ├── references ── JVM_PIPELINE_FLOW.md
                  │                   ├── Architecture Overview (JVM)
                  │                   ├── terrain Flow
                  │                   ├── peb-kernel Execution Flow
                  │                   ├── service-registry Lifecycle
                  │                   └── broker-gateway Routing
                  │
                  └── references ── COGNITIVE_RUNTIME_FLOW.md
                                      ├── Architecture Overview (NBK→IR→Cascade→MEEP)
                                      ├── NBK Causal Graph Flow
                                      ├── IR State & Scheduling Flow
                                      ├── MEEP 6-Station Pipeline
                                      └── Cascade Event Bus Flow
```

### ARCHITECTURE.md Section → Document Map

| ARCH.md Section | Referenced Document | Relevant Subsection |
|-----------------|--------------------|--------------------|
| §III TypeScript Layer | `SERVICE_TOPOLOGY.md` | MCP servers, REST APIs |
| §IV JVM Layer | `JVM_PIPELINE_FLOW.md` | End of §IV — all 4 services |
| §V Python — Cognitive | `COGNITIVE_RUNTIME_FLOW.md` | nbk/ir/cascade/meep |
| §V Python — WRP | `WRP_PIPELINE_FLOW.md` | conduit bridge + wrp-kernel (in-process lib) |
| §VII Service Topology | `SERVICE_TOPOLOGY.md`, `WRP_PIPELINE_FLOW.md`, `JVM_PIPELINE_FLOW.md` | Architecture diagram, dependencies, ports |
| §X WorkRequest Pipeline | `WRP_PIPELINE_FLOW.md`, `JVM_PIPELINE_FLOW.md` | Plan lifecycle with JVM coordination |

---

## 5. Complete File Inventory (`audit/`)

| File | Type | Lines | Last Updated | Description |
|------|------|-------|-------------|-------------|
| `INDEX.md` | Index | — | 2026-06-28 | **This file** — master index of all docs |
| `ARCHITECTURE.md` | Architecture | 1,025 | 2026-06-28 | Full system architecture (canonical reference) |
| `SERVICE_TOPOLOGY.md` | Topology | 410 | 2026-06-28 | 8-layer Mermaid topology + dependency + port diagrams |
| `WRP_PIPELINE_FLOW.md` | Pipeline | 314 | 2026-06-28 | WRP data flow, sequence, state lifecycle diagrams |
| `JVM_PIPELINE_FLOW.md` | Pipeline | 717 | 2026-06-28 | JVM service flows: peb-kernel, terrain, service-registry, broker-gateway |
| `COGNITIVE_RUNTIME_FLOW.md` | Pipeline | 672 | 2026-06-28 | Python cognitive runtime: NBK, IR, Cascade, MEEP flow diagrams |
| `CROSS_REFERENCES.md` | Reference | 824 | — | Cross-reference indices |
| `ANALYSIS.md` | Analysis | 2,833 | — | Long-form analysis documents |
| `AGENT_ARCHITECTURE_README.md` | Reference | 342 | — | Agent architecture overview |
| `AGENT_FOLDER_MAP.md` | Reference | 131 | — | Agent directory map |

### Other `audit/` Subdirectories

| Directory | Description | File Count |
|-----------|-------------|------------|
| `ANALYSIS/` | Architectural analyses | 4 |
| `ARCHITECTURE/` | Architecture sub-documents | 6 |
| `ENGINEERING/` | Engineering logs | 18 |
| `INSPECTIONS/` | Inspection reports | 1 |
| `PROMPTS/` | Captured prompts | 47 |
| `RESPONSES/` | Captured responses | 25 |
| `REQUIREMENTS/` | Requirements documents | 1 |
| `SPECS/` | Specification documents | 25 |

---

## 6. Quick Navigation Guide

### I need to understand...

| Topic | Start With | Then See |
|-------|-----------|----------|
| The whole system | `ARCHITECTURE.md` | All pipeline flow docs |
| Service topology / ports | `SERVICE_TOPOLOGY.md` | `ARCHITECTURE.md §III, §VII, §XI` |
| WorkRequest plan lifecycle | `WRP_PIPELINE_FLOW.md` | `ARCHITECTURE.md §X` |
| JVM governance / Merkle chain | `JVM_PIPELINE_FLOW.md §3` (peb-kernel) | `ARCHITECTURE.md §IV` |
| Service registration / discovery | `JVM_PIPELINE_FLOW.md §4` (service-registry) | `ARCHITECTURE.md §IV.4` |
| API gateway routing | `JVM_PIPELINE_FLOW.md §5` (broker-gateway) | `ARCHITECTURE.md §IV.3` |
| Topology management | `JVM_PIPELINE_FLOW.md §2` (terrain) | `ARCHITECTURE.md §IV.1` |
| Causal graph execution | `COGNITIVE_RUNTIME_FLOW.md §2` (NBK) | `python/nbk/` source |
| Typed execution semantics | `COGNITIVE_RUNTIME_FLOW.md §3` (IR) | `python/ir/` source |
| Deterministic prompt pipeline | `COGNITIVE_RUNTIME_FLOW.md §4` (MEEP) | `python/meep/` source |
| Event bus + NATS publishing | `COGNITIVE_RUNTIME_FLOW.md §5` (Cascade) | `python/cascade/` source |

### I want to modify...

| Component | Source Directory | Relevant Doc |
|-----------|----------------|--------------|
| MCP server | `typescript/<name>/` | `ARCHITECTURE.md §III` |
| Spring Boot service | `jvm/spring/<name>/` | `JVM_PIPELINE_FLOW.md` + `ARCHITECTURE.md §IV` |
| WRP pipeline | `python/conduit/bridge/` or `python/conduit/wrp_kernel/` | `WRP_PIPELINE_FLOW.md` |
| Cognitive runtime | `python/nbk/`, `python/ir/`, `python/cascade/`, `python/meep/` | `COGNITIVE_RUNTIME_FLOW.md` |
| Harvest pipeline | `python/rover/`, `python/steward/` | `ARCHITECTURE.md §V` |
| AI / Vision | `python/vision/`, `python/tackle/` | `ARCHITECTURE.md §V` |
| Infrastructure | PostgreSQL, Redis, NATS, MongoDB | `SERVICE_TOPOLOGY.md` + `ARCHITECTURE.md §VI` |

---

*For questions about which document covers a specific component, check the [ARCHITECTURE.md](./ARCHITECTURE.md) table of contents first — it references all pipeline flow documents from the relevant sections.*
