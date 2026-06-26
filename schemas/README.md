# Nexus Schema Registry

Canonical type definitions for the Nexus cognitive runtime, expressed as JSON-LD.

## Structure

```
schemas/
├── context/
│   └── nexus-base.jsonld         ← Root vocabulary (no imports, imported by everything)
├── core/
│   ├── work-request.jsonld       ← WorkRequest DCO + lineage, intent, decomposition
│   ├── harvest.jsonld            ← SpecAgenda / SpecCandidate / HarvestedCode
│   ├── plan.jsonld               ← Conduit plan lifecycle (stages, tickets, receipts)
│   ├── event.jsonld              ← Cascade event types (IdeaCaptured, Step*, KernelPanic)
│   ├── service.jsonld            ← Service mesh: Service, Deployment, Server, Framework
│   └── agent-role.jsonld         ← Agent roles, permissions, model bindings
├── extensions/
│   ├── fact.jsonld               ← OLAP fact database (weather, stocks, calendar — ground truth)
│   ├── model-capability.jsonld   ← Model registry / capability description / routing
│   └── vector-snapshot.jsonld    ← Time-snapshot embeddings + similarity search
├── relationships/
│   ├── harvest-to-work-request.jsonld
│   ├── work-request-to-plan.jsonld
│   ├── event-to-service.jsonld
│   └── agent-to-model.jsonld
├── instances/
│   └── example-work-request.jsonld  ← Concrete instance demonstrating the schema
└── README.md
```

## How it works

Every instance in the system carries a `@context` field that points to one or more of these schemas.
The schemas define:

1. **The vocabulary** (`context/nexus-base.jsonld`) — what terms mean, their IRIs, types, and relationships
2. **Type definitions** (`core/`) — what properties a type has and what they're used for
3. **Extensions** (`extensions/`) — additional domains that build on core types
4. **Relationship mappings** (`relationships/`) — cross-domain links that connect the graph

## Usage

A JSON-LD instance references the schemas it conforms to:

```json
{
  "@context": [
    "https://nexus.local/schema/context/nexus-base.jsonld",
    "https://nexus.local/schema/core/work-request.jsonld"
  ],
  "id": "nexus:wr/example-001",
  "type": "WorkRequest",
  ...
}
```

This makes the instance self-describing: a consumer can resolve the `@context` URL
to understand what every field means and how it relates to other types.

## Canonical vs Projected

These schemas are the **canonical source of truth** for the Nexus type system.
Everything else is a projection:

| Projection | Generator |
|-----------|-----------|
| Pydantic models | Python codegen (planned) |
| TypeScript types | Angular codegen (planned) |
| PostgreSQL DDL + pgvector | SQL codegen (planned) |
| Markdown files | Projection pipeline (planned) |
