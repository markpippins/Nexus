# Workflow Definitions

This directory contains typed process graphs — workflows composed from
capabilities registered in the capability graph.

A workflow is:

- A directed acyclic graph of nodes
- Each node references a capability by id
- Edges define data flow, control flow, or validation
- One entry point, one output node
- Domain-agnostic structure with domain-specific implementations

## Structure

Each workflow file defines the graph and references capability ids.
Actual capability implementations live in `graph/capability/`.

```
workflow/
├── README.md
├── plan-execution.json     -- PlanExecutionWorkflow (conduit/temporal)
├── filesystem-scan.json    -- Filesystem observation workflow (Voyager)
└── document-ingest.json    -- DocLing ingestion workflow
```
