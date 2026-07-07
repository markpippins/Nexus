# WRP v1.0 — WorkRequest Protocol Specification

**Status:** Active (supersedes `WORKREQUEST_SPEC.md` draft)
**Protocol Version:** 1.0
**Schema Version:** 1 (additive only)
**Date:** 2026-06-27

---

## 1. Overview

WRP (WorkRequest Protocol) is a **versioned event-sourced protocol** for
lifecycle-driven execution of WorkRequest objects across distributed cognitive
runtimes.

### Canonical Artifacts

| Artifact | Location | Format |
|----------|----------|--------|
| WorkRequest Schema | `schemas/wrp/work-request.schema.json` | JSON Schema (draft-07) |
| WRP Event Schema | `schemas/wrp/wrp-event.schema.json` | JSON Schema (draft-07) |
| State Machine | `schemas/wrp/wrp-state-machine.json` | JSON + adjacency matrix |
| WRP API | `schemas/wrp/wrp-api.yaml` | OpenAPI 3.0 |

### Design Principles

1. **Event-sourced** — All state changes are recorded as immutable events.
   Current state is a projection of the event stream, never stored directly.

2. **Versioned** — Three levels of versioning ensure backward compatibility:
   protocol, event schema, and WorkRequest instance.

3. **Deterministic** — Given the same event stream, any agent reconstructs the
   same state. No hidden state.

4. **Layered** — The 3-layer IR model (Intent → Binding → Execution) is
   preserved from the WorkRequest IR specification.

---

## 2. Versioning Strategy

### Three-Level Versioning

| Level | Scope | Semantics | Examples |
|-------|-------|-----------|----------|
| **Protocol** | `protocol_version` field | Major/minor semver for the protocol itself. Changes when state machine topology, event types, or API surface changes. | `1.0`, `1.1`, `2.0` |
| **Event Schema** | `version` field per event | Additive only — new fields may be added, existing fields never removed or retyped. Incremented per event type independently. | 1, 2, 3 |
| **WorkRequest** | `version` field per WR | Incremented on each modification of the WorkRequest (new events, retries, supersession). Resets on new WorkRequest creation. | 1, 2, 3 |

### Compatibility Rules

- Protocol version `MAJOR.MINOR` — MAJOR breaks compatibility, MINOR is additive.
- Event schema version is **additive only** — consumers MUST accept unknown fields.
- WorkRequest version is an opaque monotonic counter — used for concurrency control
  and retry detection.

---

## 3. State Machine

### 11-State Lifecycle

```
                      ┌──────────────────────────────────────┐
                      │                                      │
                      ▼                                      │
CREATED → INTAKE → PLANNING → CRITIQUE → SPECIFICATION → APPROVED
                                        ▲            │        │
                                        │            │        │
                                        └─────(re)───┘        │
                                                               ▼
                                                          QUEUED → EXECUTING → COMPLETED → ARCHIVED
                                                             │        │
                                                             │        │
                                                             ▼        ▼
                                                           FAILED (from any active state)
```

### States

| State | Category | Description |
|-------|----------|-------------|
| CREATED | Initial | WorkRequest created, not yet ingested |
| INTAKE | Active | Being validated, parsed, assigned |
| PLANNING | Active | Decomposition strategy being defined |
| CRITIQUE | Active | Plan under review |
| SPECIFICATION | Active | Detailed spec being written |
| APPROVED | Gate | Formally approved for execution |
| QUEUED | Active | Queued waiting for executor |
| EXECUTING | Active | Actively being executed |
| COMPLETED | Terminal | Successfully completed |
| ARCHIVED | Terminal | Archived — read-only |
| FAILED | Terminal | Failed — retry via new version |

### Adjacency Matrix

See `schemas/wrp/wrp-state-machine.json` for the formal 11×11 adjacency matrix.
Key transition rules:

- **Normal flow:** CREATED → INTAKE → PLANNING → CRITIQUE → SPECIFICATION → APPROVED → QUEUED → EXECUTING → COMPLETED → ARCHIVED
- **Revision loops:** CRITIQUE → PLANNING (re-plan), SPECIFICATION → CRITIQUE (re-review), APPROVED → SPECIFICATION (amend)
- **Failure:** FAILED reachable from INTAKE, PLANNING, CRITIQUE, SPECIFICATION, APPROVED, QUEUED, EXECUTING
- **Terminal states:** COMPLETED, ARCHIVED, FAILED — no onward transitions

---

## 4. Event Model

### Base Event Contract

Every WRP event has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_id` | UUID | ✓ | Unique event identifier |
| `wrp_id` | UUID | ✓ | WorkRequest this event belongs to |
| `type` | string | ✓ | Event type (see below) |
| `timestamp` | ISO 8601 | ✓ | When the event was emitted |
| `version` | integer | ✓ | Event schema version (additive) |
| `causation_id` | UUID | | ID of the event that caused this one |
| `correlation_id` | UUID | | Groups related events across WRs |
| `payload` | object | | Event-type-specific data |

### Event Types

| Type | Trigger | State Transition |
|------|---------|-----------------|
| `wrp.created` | WorkRequest created | → CREATED |
| `wrp.intaked` | WorkRequest ingested | CREATED → INTAKE |
| `wrp.planned` | Plan defined | INTAKE → PLANNING |
| `wrp.critiqued` | Review submitted | PLANNING → CRITIQUE |
| `wrp.specified` | Spec completed | CRITIQUE → SPECIFICATION |
| `wrp.approved` | Approval granted | SPECIFICATION → APPROVED |
| `wrp.queued` | Queued for execution | APPROVED → QUEUED |
| `wrp.executing` | Execution started | QUEUED → EXECUTING |
| `wrp.completed` | Execution succeeded | EXECUTING → COMPLETED |
| `wrp.archived` | Archived | COMPLETED → ARCHIVED |
| `wrp.failed` | Execution failed | * → FAILED |
| `wrp.event` | Generic event | No state change |
| `wrp.note` | Annotation | No state change |

### Causality

Events form a DAG via `causation_id`:

- `causation_id` = `event_id` of the preceding event in the causal chain
- `correlation_id` groups events across WorkRequests (e.g., a parent WR and
  its children)

This enables full audit replay: given the first event, the entire causal
chain can be reconstructed.

---

## 5. API Reference

### Endpoints

| Method | Path | Operation | Description |
|--------|------|-----------|-------------|
| POST | `/api/wrp/v1/work-requests` | `createWorkRequest` | Create a new WorkRequest |
| POST | `/api/wrp/v1/work-requests/{wrpId}/events` | `emitEvent` | Emit a lifecycle event |
| GET | `/api/wrp/v1/work-requests/{wrpId}` | `getWorkRequestState` | Get current state |
| GET | `/api/wrp/v1/work-requests/{wrpId}/replay` | `replayWorkRequest` | Replay events to reconstruct state |

Full OpenAPI spec at `schemas/wrp/wrp-api.yaml`.

### createWorkRequest

Creates a WorkRequest in CREATED state. The request body must conform to the
WorkRequest schema. On success, returns the created WorkRequest and the
`wrp.created` event. The system immediately transitions to INTAKE.

### emitEvent

Emits a lifecycle event. The event type determines the target state. The
system checks the adjacency matrix — if the transition is invalid (e.g.,
COMPLETED → PLANNING), the request is rejected with HTTP 422.

### getWorkRequestState

Returns the current projected state of a WorkRequest — its status, version,
execution state, and recent event history. This is the canonical read path.

### replayWorkRequest

Reconstructs state by replaying events. Supports two modes:

- **snapshot** (default): Uses checkpoint snapshots for efficiency, replaying
  only events since the last snapshot.
- **full**: Replays every event from the beginning — used for audit and
  verification.

Optionally accepts `atVersion` to reconstruct state at a specific version.

---

## 6. Schema Compatibility

### Relationship to Existing Schemas

The WRP schemas in `schemas/wrp/` are designed as a **formalization layer**
over the existing JSON-LD definitions:

| JSON-LD (existing) | JSON Schema (new) | Relationship |
|--------------------|-------------------|--------------|
| `core/work-request.jsonld` | `wrp/work-request.schema.json` | JSON-LD defines RDF types; JSON Schema adds validation, versioning, `$id` |
| `core/event.jsonld` | `wrp/wrp-event.schema.json` | JSON-LD defines event taxonomy; JSON Schema adds base contract with causation/correlation |

Both coexist. The JSON-LD schemas remain the semantic ontology; the JSON
Schemas are the validation and transport contracts.

### Backward Compatibility

- All new fields are optional (appear in `properties` but not `required`).
- The `events` array in `work-request.schema.json` is read-only — events
  are appended via the API, not embedded.
- Schema `$id` URIs are versioned for independent evolution.

---

## 7. Cross-System Integration

### wrp-kernel: in-process library, not an HTTP service

The `wrp-kernel` state-machine engine is an **in-process Python library** at
`python/conduit/wrp_kernel/` (`engine.py`, `identity.py`, `graph.py`,
`lineage.py`, `delta.py`, `snapshot.py`). It is NOT a standalone HTTP service,
MCP server, or daemon, and it does not bind a port. The bridge daemon (and any
other Conduit-side caller) imports `wrp_kernel` and calls
`KernelEngine.reduce(delta)` directly.

Consequence for §5 (API Reference): the WRP endpoints listed there describe
the **WRP contract** exposed by the upstream Conduit / API-Gateway boundary.
The kernel itself is reached by in-process function call from there, not by
HTTP. Canonical reconciliation: `mcp_server_standalone_discrepancies` in
`nexus/graph/nexus-knowledge-graph.json`.

### Conduit Bridge

WRP WorkRequests map to Conduit plans via the cross-reference relation
`wrp:implemented_by_plan` and `wrp:tracked_by_plan`. See the WRP
cross-reference taxonomy at plan #0175 and the architecture decision
recorded 2026-06-27.

### Nebula Projection

WRP artifacts are projected into Nebula's stratified knowledge graph via
the Conduit→Nebula bridge (plan #0174). The projection pipeline converts
WRP WorkRequests → Nebula documents → chunks → cross-references.

### Event Store

All WRP events should be persisted in an append-only event store. The event
store is the source of truth — the current state is always a derived
projection. See plan #0181 (Temporal Graph Versioning) for branching and
snapshot semantics.

---

> **Note:** `wrp-kernel` referenced in §7 is an in-process Python library (see note above). Earlier revisions of `WRP_PIPELINE_FLOW.md`, `ARCHITECTURE.md`, `SERVICE_TOPOLOGY.md`, and `INDEX.md` listed `wrp-kernel` as a standalone MCP server on port 3103. That description has been reconciled; the canonical note is `mcp_server_standalone_discrepancies` in `nexus/graph/nexus-knowledge-graph.json`.

## 8. Protocol Evolution

### Adding New States

To add a new state to the state machine:
1. Increment protocol MINOR version (e.g., `1.0` → `1.1`)
2. Add the state to the `states` map in `wrp-state-machine.json`
3. Add the corresponding row and column to the adjacency matrix
4. Define the new event type in `wrp-event.schema.json`
5. Update this spec document

### Adding New Event Types

New event types are additive — they don't require a protocol version bump
unless they change the state machine topology.

### Deprecation

Deprecated features are marked with a `deprecated` annotation in the schema
and remain valid for at least one protocol MINOR version before removal.
