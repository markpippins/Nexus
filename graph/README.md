# Graph — Capability & Workflow Model

The `graph/` directory defines the type system for constructing structured
outcomes from uncertain knowledge under constraints. It is the concrete
location for the capability decomposition model described across multiple
architecture transcripts.

The core claim: **workflows assume a capability graph, not a domain.**
Software is one domain of application.

## The Three Universal Node Types

Every capability in the system is one of three types:

| Node Type | Role | Behavior | Error Handling |
|-----------|------|----------|----------------|
| **Inference** | Proposes reality | Probabilistic, LLM-driven | Must be validated; can be wrong |
| **Deterministic** | Stabilizes reality | Pure function, guaranteed result | Fails or succeeds; no gray area |
| **External Tool** | Delegates computation | Network/API/database call | Retry or fail; no partial result |

## Capability Graph

The capability graph is the registry of all available nodes across the system.
Capabilities are:

- Single-purpose
- Composability
- Swappable (same interface, different implementation)
- Independently testable
- Multi-workflow-usable

## Workflow Graph

A workflow is a typed directed acyclic graph over the capability graph:

```
Inference Node → Deterministic Node → External Tool → Inference Node
```

Workflows define *structure*, not *intelligence*. The intelligence lives in
the inference nodes; the structure comes from how they connect.

## Core Design Question

> Where is inference allowed, where do rules apply, and where does state
> become committed?

Every component in the system answers three questions:

1. **Can this component infer?** (make probabilistic judgments)
2. **What rules constrain it?** (deterministic boundaries)
3. **When does it commit state?** (irreversible transitions)

This replaces "what framework do we use" with "where is uncertainty resolved."

## Relationship to the Rest of Nexus

| Nexus Concept | Graph Role |
|---------------|------------|
| Atten (knowledge substrate) | Provides canonical state that graph nodes read/write |
| Vision | Inference nodes that interpret state |
| Deterministic | Deterministic nodes that enforce constraints |
| Tool Layer | External tool nodes that delegate computation |
| WorkRequest | Commitment boundary — entry point into a workflow execution |
| PEB | Governs invariant validation across graph transitions |
| RCL | External constraint boundary around all graph execution |
| Cascade | Event backbone that records graph execution events |
| Voyager | External tool (filesystem observation) registered in the graph |

## Directory Structure

```
graph/
├── README.md              -- This file
├── schema/                -- Type definitions for nodes, edges, workflows
├── capability/            -- Declared capabilities (registered nodes)
├── workflow/              -- Workflow definitions (typed process graphs)
└── examples/              -- Domain-agnostic examples
```
