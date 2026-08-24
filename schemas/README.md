# Nexus Schema Registry

Canonical type definitions for the Nexus cognitive runtime, organized into five
layers by artifact kind. The registry is split by *what each artifact is* —
ontology (graph/vocabulary), validation (JSON-Schema), protocol (transport +
lifecycle contracts), projection manifests (derived-artifact declarations), and
migrations (SQL).

## Structure

```
schemas/
├── ontology/                     ← JSON-LD graph + vocabulary (canonical type system)
│   ├── context/
│   │   └── nexus-base.jsonld     ← Root vocabulary (no imports, imported by everything)
│   ├── core/
│   │   ├── work-request.jsonld   ← WorkRequest DCO + lineage, intent, decomposition
│   │   ├── harvest.jsonld        ← SpecAgenda / SpecCandidate / HarvestedCode
│   │   ├── plan.jsonld           ← Conduit plan lifecycle (stages, tickets, receipts)
│   │   ├── event.jsonld          ← Cascade event types (IdeaCaptured, Step*, KernelPanic)
│   │   ├── service.jsonld        ← Service mesh: Service, Deployment, Server, Framework
│   │   ├── agent-role.jsonld     ← Agent roles, permissions, model bindings
│   │   ├── knowledge-graph.jsonld← Graph type definition (canonical; SQL is a projection)
│   │   ├── knowledge-steward.jsonld
│   │   └── stratification-ontology.json
│   ├── extensions/
│   │   ├── fact.jsonld           ← OLAP fact database (weather, stocks, calendar — ground truth)
│   │   ├── model-capability.jsonld ← Model registry / capability description / routing
│   │   └── vector-snapshot.jsonld  ← Time-snapshot embeddings + similarity search
│   ├── relationships/
│   │   ├── harvest-to-work-request.jsonld
│   │   ├── work-request-to-plan.jsonld
│   │   ├── event-to-service.jsonld
│   │   ├── agent-to-model.jsonld
│   │   └── wrp-crossref-taxonomy.jsonld
│   └── instances/
│       └── example-work-request.jsonld  ← Concrete instance demonstrating the schema
├── validation/                   ← JSON-Schema validation contracts
│   ├── wrp/
│   │   ├── work-request.schema.json    ← Canonical WorkRequest IR (11-state WRP machine)
│   │   └── wrp-event.schema.json       ← WRP lifecycle event envelope
│   └── authority/
│       └── authority-matrix.json       ← Single-canonical-authority registry (governance data)
├── protocol/                     ← WRP transport + lifecycle contracts
│   ├── wrp-api.yaml              ← OpenAPI transport contract (4 core endpoints)
│   └── wrp-state-machine.json    ← Formal 11-state machine + adjacency matrix
├── projection-manifests/         ← Derived-artifact declarations + outputs
│   ├── projection-manifest.jsonld ← Which schemas project to which artifacts
│   └── knowledge-graph.sql       ← PostgreSQL DDL projection of the graph ontology
├── migrations/                   ← SQL migrations (not canonical authorities)
│   ├── resolution/               ← SOL resolution schema (canonical SQL home)
│   └── tackle/                   ← runtime-loaded migrations for tackle-srv bootstrap
└── README.md
```

## How it works

Every instance in the system carries a `@context` field that points to one or
more of the ontology schemas. The schemas define:

1. **The vocabulary** (`ontology/context/nexus-base.jsonld`) — what terms mean,
   their IRIs, types, and relationships
2. **Type definitions** (`ontology/core/`) — what properties a type has and
   what they're used for
3. **Extensions** (`ontology/extensions/`) — additional domains that build on
   core types
4. **Relationship mappings** (`ontology/relationships/`) — cross-domain links
   that connect the graph

URLs follow files: a schema at `schemas/ontology/core/work-request.jsonld` is
identified as `https://nexus.local/schema/ontology/core/work-request.jsonld`.
The JSON-LD resolver (`tools/authority/check_jsonld.py`, `make jsonld-check`)
enforces that every `@context` URL resolves and every prefix/vocabulary
reference is declared — the URL namespace is a checked local registry, not a
documentation-only convention.

## Usage

A JSON-LD instance references the schemas it conforms to:

```json
{
  "@context": [
    "https://nexus.local/schema/ontology/context/nexus-base.jsonld",
    "https://nexus.local/schema/ontology/core/work-request.jsonld"
  ],
  "id": "nexus:wr/example-001",
  "type": "WorkRequest",
  ...
}
```

This makes the instance self-describing: a consumer can resolve the `@context`
URL to understand what every field means and how it relates to other types.

## Layer conventions

| Layer | Kind | Authority |
|---|---|---|
| `ontology/` | JSON-LD graph + vocabulary | Canonical type system (matrix-listed where a JSON-Schema canonical exists; graph form otherwise) |
| `validation/` | JSON-Schema + authority matrix | Canonical validation contracts; matrix entries for wrp/work_request, wrp_event, wrp_state_machine |
| `protocol/` | OpenAPI + state machine | WRP transport + lifecycle contracts (wrp_state_machine authority) |
| `projection-manifests/` | Manifest + derived outputs | Projection registry (checked by `check_authority.py`); never canonical sources |
| `migrations/` | SQL | Runtime-loaded / manual migrations — **not** canonical authorities |

## Canonical vs Projected

The ontology and validation layers are the **canonical source of truth** for
the Nexus type system. Everything else is a projection:

| Projection | Generator |
|-----------|-----------|
| Pydantic models | Python codegen (`python/conduit/generated/`, peb-kernel precedent) |
| TypeScript types | Angular codegen (planned — TS emitter not installed) |
| PostgreSQL DDL + pgvector | `projection-manifests/knowledge-graph.sql` (manual, digest-locked) |
| Markdown files | Projection pipeline (planned) |

Projection declarations and their executable verification live in
`projection-manifests/projection-manifest.jsonld` (`make contract-audit` runs
`exists` / `digest` / `regenerate` checks on every active projection).
