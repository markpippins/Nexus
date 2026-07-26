# nebula-srv

**Express API server for the Nexus Resource Management System (RMS).**
Serves as the primary REST API backend for the Nebula knowledge graph, pipeline orchestration, and system hierarchy management.

**Port:** `3101`
**Base URL:** `http://localhost:3101/api`
**Database:** PostgreSQL (schema: `nebula`, search_path: `nebula`)
**Cache:** Redis (block segmentation, inbox pointers, session state)
**Auth:** None (internal service)

---

## Quick Start

```bash
# Install dependencies
npm install

# Start in development mode (hot-reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The server expects a PostgreSQL database at `localhost:5432` with user `pguser` and database `nexus`.
Configure via environment or modify `src/index.ts` for custom connection settings.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  nebula-srv                      │
│         Express.js REST API (port 3101)          │
├─────────────────────────────────────────────────┤
│                                                  │
│  GET/POST/PATCH/PUT/DELETE /api/*               │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  PostgreSQL (nebula schema)                  │ │
│  │  - systems, subsystems, features             │ │
│  │  - requirements, harvests, candidates        │ │
│  │  - plans, work sessions, agent records       │ │
│  │  - knowledge graph entities & edges          │ │
│  │  - open questions, agendas, specs, etc.       │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  Redis (block segmentation)                  │ │
│  │  - inbox pointers                            │ │
│  │  - conversation snapshots & segments         │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Data Flow

1. **Frontend** (nebula-ui / conduit-ui) sends HTTP requests to `http://localhost:3101/api/*`
2. **nebula-srv** processes the request, queries PostgreSQL / Redis, and returns JSON
3. **Cross-references** connect entities across the knowledge graph (requirements → plans, harvests → candidates, etc.)
4. **Bitemporal history** is maintained for specs, info tabs, and audit files via `_history` tables with `recorded_on_dt` / `recorded_until_dt`

---

## API Overview

The full REST API is documented comprehensively in **[API-SPEC.md](./API-SPEC.md)** (53 sections, 2900+ lines).

| Section | Endpoint Group | Description |
|---------|---------------|-------------|
| 2 | `/health`, `/api/health` | Liveness + DB connectivity check |
| 3–5 | `/api/systems`, `/api/subsystems`, `/api/features` | System hierarchy CRUD with nested nesting |
| 6–9 | `/api/requirements` | Requirement CRUD, dependencies, kanban moves, compilation |
| 10 | `/api/systems/:id/folders` | Organizational system folders |
| 11 | `/api/sessions` | Work session lifecycle |
| 12 | `/api/features/move`, `/api/subsystems/move`, `/api/systems/demote/:id` | Complex transactional re-parenting |
| 13 | `/api/workspaces` | Workspace directory registration |
| 14 | `/api/docs` | Disk-read documentation files |
| 15–16 | `/api/plans`, `/api/*/implementation-plans` | Implementation plan lifecycle |
| 17 | `/api/audit` | Audit file sync & regeneration |
| 18 | `/api/preferences` | User preference key-value store |
| 19–20 | `/api/harvests`, `/api/harvest-candidates` | Harvest pipeline CRUD + promotion |
| 21 | `/api/intent-records` | Intent record management |
| 22–23 | `/api/specifications`, `/api/agendas` | Bitemporal specs & deliberation agendas |
| 24–25 | `/api/assessments`, `/api/observations` | Assessment & observation records |
| 26 | `/api/roles` | Governance role definitions |
| 27 | `/api/open-questions` | Open question management with answers & participants |
| 28 | `/api/search` | Cross-entity full-text search & semantic vector search |
| 29 | `/api/counts` | Aggregate row counts across 13 tables |
| 30 | Block Segmentation | Conversation snapshot & block management (internal) |
| 31 | `/api/cross-references` | Entity cross-reference CRUD |
| 32 | `/api/evidence-links` | Evidence-to-knowledge-entity links |
| 33 | `/api/agent-records` | Durable agent audit entries |
| 34 | `/api/op-registry` | Operation registry (intent → opcode sequences) |
| 35–36 | `/api/knowledge/entities`, `/api/knowledge/edges` | Knowledge graph nodes & edges |
| 37 | `/api/projections` | DB→filesystem markdown projections |
| 38 | `/api/conduit/deleted-plans` | Soft-deleted conduit plans |
| 39 | `/api/execution/requests`, `/api/execution/leases`, `/api/execution/attempts`, `/api/execution/receipts`, `/api/execution/state` | Execution lifecycle management |
| 40 | `/api/execution/receipts` | Execution receipt CRUD |
| 41 | `/api/architect-specs` | Architect specification audit trail |
| 42 | `/api/artifact-provenance` | Artifact provenance tracing |
| 43 | `/api/systems/:id/info` | System info tabs (bitemporal) |
| 44 | `/api/inbox-pointer/:role` | Per-role inbox pointer (Redis-backed) |
| 45 | `/api/cpf` | Compilation Readiness Framework |
| 46 | `/api/import`, `/api/seed` | Data import & seeding utilities |
| 47 | `/api/refresh-stats` | Materialized view refresh |
| 48 | `/api/harvest-candidates/:id/spawn-plan`, `/api/harvest-candidates/discover` | Spawn conduit plans from candidates & auto-discovery |
| 49 | `/api/agendas/:id/finalize` | Finalize deliberation agendas |
| 50 | `/api/specifications/:id/link-requirements` | Link requirements to specifications |
| 51 | `/api/agent-records/search` | Advanced agent record search |
| 52 | `/api/op-registry/fork`, `/api/op-registry/:id/deprecate`, `/api/op-registry/:id/supersede` | OP Registry fork, deprecation & supersession |
| 53 | `/api/execution/leases/*`, `/api/execution/attempts`, `/api/execution/state` | Lease acquire/renew/release, attempts, state summary |

---

## Key Features

### System Hierarchy
Systems → Subsystems → Features provides a nested organizational tree. Each entity supports full CRUD with cascade deletes. Subsystems auto-assign colors from a 12-color palette.

### Requirements Pipeline
Full lifecycle: creation → kanban moves (with optimistic concurrency) → status transitions → auto-compilation to WorkRequest IR → conduit plan creation. Status normalization maps common variants (e.g., `"in progress"` → `"InProgress"`).

### Knowledge Graph
Entities indexed in `knowledge.graph_entities` with typed edges in `knowledge.graph_edges`. Supports vector similarity search, cross-references, and evidence links.

### Harvest Pipeline
Conversation transcripts → harvest records → candidate extraction → intent promotion → plan generation. Candidates can be promoted directly to conduit plans with cross-reference links.

### Execution Framework
Work requests with state machine lifecycle (DRAFT → COMPILED → ADMITTED → READY → LEASED → EXECUTING → COMPLETED/FAILED). Lease-based mutual exclusion, attempt tracking, and receipt chaining.

### Bitemporal History
Specifications, system info tabs, and audit files maintain full version history via `recorded_on_dt` / `recorded_until_dt` columns, enabling point-in-time reconstruction.

### Pagination Convention
All list endpoints use a consistent pagination pattern:
- `page` — 1-indexed (default 1)
- `pageSize` — items per page (default 100, max 100)
- Response: `{ "items": [...], "total": N, "page": P, "pageSize": S }`

---

## Environment

The server uses hardcoded defaults in `src/index.ts`. To customize, either modify the source or set the `PORT` environment variable:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3101` | Server listen port |
| PG host | `localhost` | PostgreSQL host |
| PG port | `5432` | PostgreSQL port |
| PG user | `pguser` | Database user |
| PG password | `pgpass` | Database password |
| PG database | `nexus` | Database name |
| PG search_path | `nebula` | Default schema |

---

## Project Structure

```
nebula-srv/
├── src/
│   ├── index.ts                           # Express server entry point
│   ├── routes.ts                          # All REST API route handlers (~7300 lines)
│   ├── block-segmentation.service.ts      # Conversation snapshot/block management
│   ├── crossref-taxonomy.ts               # Cross-reference type enumeration
│   ├── evidence-link-types.ts             # Evidence link type enumeration
│   └── services/
│       └── block-segmentation-redis.service.ts  # Redis-backed block segmentation + inbox pointers
├── migrations/                            # Database migration files
├── tests/                                 # Test files (e2e)
├── API-SPEC.md                            # Full REST API specification (42 sections)
├── package.json
└── tsconfig.json
```

---

## Related Services

| Service | Port | Description |
|---------|------|-------------|
| **nebula-srv** | `3101` | This service — REST API for Nebula RMS |
| **nebula-mcp** | `3102` | MCP server for agent tool access to Nebula |
| **conduit-mcp** | `3100` | MCP server for conduit pipeline operations |
| **conduit** (Python) | `3103` | WRP Kernel Runtime FastAPI |
| **tackle-mcp** | `3400` | Role memory + procedure registry |
| **assembly-srv** | `3107` | Assembly forum REST API |
| **nebula-ui** | — | Angular frontend for Nebula |
