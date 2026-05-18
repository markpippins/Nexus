# Event Grammar v3

## 0. Canonical Format

All events are stored as **Canonical Event Records (CER)**. Raw input is a transient ingestion format only — see [`CER_SPEC.md`](./CER_SPEC.md) for the full schema specification and [`CER_CCNF.md`](./CER_CCNF.md) for the canonical normalization function.

This document defines the event type taxonomy, causal grammar, and system constraints. The CER schema absorbs and extends these definitions.

---

## 1. Two-Tier System: Artifacts and Events

The system has exactly two tiers:

| Tier | Role | Source of truth |
|---|---|---|
| **Artifacts** | System state — records, files, persisted data | YES — authoritative |
| **Events** | Causal trace — what happened, why, in what order | NO — derived index |

### Invariant

Events never own truth. They reference truth.

Events are:
- Append-only
- Immutable
- Referential (no duplication of full artifacts)
- Reconstructible from artifacts if needed

---

## 2. Base Event Schema (CER)

Every event conforms to the CER base schema. All fields are always present (null/empty for missing values).

```json
{
  "event_id": "uuid",
  "event_version": 1,
  "ccnf_version": 1,
  "system": "nexus",
  "domain": "specification | execution | lowering | system | observation",
  "timestamp": 1730000000,
  "actor": {
    "type": "llm | user | system | agent",
    "id": "string",
    "session_id": "string"
  },
  "intent": {
    "type": "normalized_verb",
    "action": "create | update | delete | execute | validate | emit",
    "target_type": "node | edge | graph | state | artifact",
    "target_id": "type:id"
  },
  "identity": {
    "entity_key": "SHA256 hex",
    "type": "node | event | artifact | rule | graph",
    "scope": "executiongraph.v2 | specification | system",
    "collapse_key": "human-stable-key",
    "alias_keys": []
  },
  "causality": {
    "parent_event_ids": ["uuid"],
    "causal_chain_id": "uuid",
    "trace_depth": 0,
    "ordered": true
  },
  "artifact_refs": ["type:id"],
  "state_delta": [
    {
      "artifact_id": "type:id",
      "before_hash": "SHA256 hex | null",
      "after_hash": "SHA256 hex",
      "patch": {}
    }
  ],
  "payload": {
    "type": "structured | blob | reference",
    "data": {}
  },
  "compression": {
    "strategy": "full | delta | alias | synthetic",
    "lossless": true,
    "compression_version": 1
  },
  "signature": {
    "hash": "SHA256 hex",
    "signed_by": null
  }
}
```

| Field | Rule |
|---|---|
| `event_id` | Globally unique, monotonic |
| `event_version` | Schema version. Backwards compatible. Never reused |
| `ccnf_version` | CCNF epoch. Defines identity space. See [`CER_CCNF.md §11`](./CER_CCNF.md) |
| `domain` | Which plane this event belongs to |
| `timestamp` | Epoch seconds (int64). No timezone, no ISO strings |
| `actor` | Who/what caused this event |
| `intent` | Controlled vocabulary. See CCNF Step 4 |
| `identity` | Three-layer identity: entity_key (cryptographic), collapse_key (semantic), alias_keys (historical) |
| `causality` | Causal ancestry. `parent_event_ids[0]` is immediate parent. `causal_chain_id` is the root lineage |
| `artifact_refs` | Value-bound `type:id` pairs. Immutable per event. Must have ≥1 entry unless domain=system |
| `state_delta` | Artifact-scoped patches. One per artifact in artifact_refs. Null before_hash for create |
| `payload` | Event-specific structured data |
| `compression` | Compression strategy. FULL = complete state, DELTA = patch only, ALIAS = identity merge only, SYNTHETIC = reconstructed |
| `signature` | SHA256 of canonical serialization (CCNF Step 8) |

**Legacy adapter**: Pre-CER events with the old schema (`type`, `caused_by`, `root_prompt_id`, `data`) are adapted at replay time via the LegacyCERAdapter, which maps to this schema. See [`CER_SPEC.md §9`](./CER_SPEC.md).

---

## 3. Event Type System

### 3.1 Domain Tags

```
DomainTag := Specification | Execution | Lowering | System | Observation
```

Note: `Observation` domain events are **ephemeral** — emitted by the replay engine, never stored in the Event Log. They are documented here for taxonomy completeness only. See [`REPLAY_ENGINE.md §7`](./REPLAY_ENGINE.md) for the derivation rules.

### 3.2 Event Taxonomy by Domain

#### Specification Domain (design intent)

| Event Type | Required Parents | Creates/Mutates |
|---|---|---|
| `PromptSubmitted` | `null` (root) | `PROMPT_RECORDS/{id}` |
| `IntentDerived` | `PromptSubmitted` | `INTENT_RECORDS/{id}` |
| `RequirementCreated` | `IntentDerived` | `REQUIREMENTS/{id}` |
| `RequirementRefined` | `RequirementCreated` | `REQUIREMENTS/{id}` |
| `RequirementValidated` | `RequirementRefined` | `REQUIREMENTS/{id}` |
| `PromptNormalized` | `PromptSubmitted` | `PROMPT_RECORDS/{id}` |
| `ContextAttached` | `PromptSubmitted` | session context |

#### Lowering Domain (Phase 1.5 compiler pass)

| Event Type | Required Parents | Creates/Mutates |
|---|---|---|
| `ExecutionGraphCreated` | `WorkRequestCreated` | `EXECUTIONS/{id}` |
| `ExecutorSelected` | `ExecutionGraphCreated` | executor selection record |
| `ExecutionNodeGenerated` | `ExecutorSelected` | node expansion record |
| `DependencyLowered` | `ExecutionNodeGenerated` | edge projection record |
| `LoweringComplete` | `DependencyLowered` | `EXECUTIONS/{id}` |

#### Execution Domain (runtime — scheduler events)

| Event Type | Required Parents | Creates/Mutates |
|---|---|---|
| `WorkRequestCreated` | `RequirementValidated` | `WORKREQUESTS/{id}` |
| `WorkRequestRefined` | `WorkRequestCreated` | `WORKREQUESTS/{id}` |
| `NodeReadied` | `LoweringComplete` | `EXECUTIONS/{id}` lifecycle |
| `NodeClaimed` | `NodeReadied` | claim record |
| `NodeReleased` | `NodeClaimed` | claim release |
| `ExecutionBound` | `NodeClaimed` | `EXECUTIONS/{id}` lifecycle |
| `NodeExecutionStarted` | `ExecutionBound` | `EXECUTIONS/{id}` lifecycle |
| `ExecutionProgressed` | `NodeExecutionStarted` | `EXECUTIONS/{id}` lifecycle |
| `ExecutionSucceeded` | `NodeExecutionStarted` | `EXECUTIONS/{id}` lifecycle |
| `ExecutionFailed` | `NodeExecutionStarted` | `EXECUTIONS/{id}` lifecycle |
| `NodeSkipped` | `NodeReadied` | `EXECUTIONS/{id}` lifecycle |
| `NodeBlocked` | any prior event | `EXECUTIONS/{id}` lifecycle |
| `ExecutionHeartbeat` | `NodeExecutionStarted` | runtime signal |
| `ExecutionOutputProduced` | `NodeExecutionStarted` | intermediate output |
| `ExecutionGraphCompleted` | terminal node events | `EXECUTIONS/{id}` |
| `ResponseGenerated` | `ExecutionSucceeded` | `RESPONSE_RECORDS/{id}` |
| `ArtifactPersisted` | `ExecutionSucceeded` | artifact path |
| `HostHeartbeat` | any prior event | host liveness signal |
| `LeaseExpired` | `NodeClaimed` | lease expiry record |

#### System Domain (infrastructure)

| Event Type | Required Parents | Creates/Mutates |
|---|---|---|
| `ErrorEvent` | any | error record |
| `SystemEvent` | any | system log |
| `RetryEvent` | `ExecutionFailed` | retry counter |
| `ValidationFailure` | any | validation violation record |

#### ValidationFailure event schema

```json
{
  "type": "ValidationFailure",
  "domain": "System",
  "phase": "STATIC | RUNTIME",
  "target": {
    "graph_id": "...",
    "node_id": "optional",
    "edge_id": "optional"
  },
  "rule_id": "S5 | R3 | R10 | HAEC | HAEC_DISTRIBUTED_MISMATCH | FATAL_EVALUATION_FAILURE",
  "severity": "WARN | ERROR | FATAL",
  "message": "...",
  "context": {}
}
```

**Invariant**: `ValidationFailure ∉ Execution semantics; FailureNode ∈ Execution semantics`. Validation failure events are annotations on state transitions, never inputs to state computation. Replay ignores validation events — `replay(event_log) == state` regardless.

#### Replay Observations (ephemeral — emitted by replay engine, NOT stored)

| Type | Emitted By | Purpose |
|---|---|---|
| `StateSnapshot` | Replay engine at cursor | Full state dump |
| `NodeStateTransitionView` | Replay engine at cursor | Human-readable node transition |
| `SchedulerQueueView` | Replay engine at cursor | Ready/claimed/running/blocked queues |
| `LeaseGraphView` | Replay engine at cursor | Current lease ownership graph |
| `DependencyChainView` | Replay engine at cursor | Causal chain for a given node |

**Invariant**: `ReplayObservations ∉ EventLog`. These are derived projections of replay, never stored.

#### Observation View AST (ephemeral — emitted by Phase 3 Observation Engine, NOT stored)

| Type | Source | Purpose |
|---|---|---|
| `GraphView` | Observation Engine | Structural interpretation of ExecutionGraph over time |
| `NodeView` | Observation Engine | Per-node lifecycle timeline and trace |
| `TraceView` | Observation Engine | Causal chain reconstruction for a node |
| `DependencyView` | Observation Engine | Derived DAG from runtime behavior |
| `FailureView` | Observation Engine | Semantic failure reconstruction |
| `SystemView` | Observation Engine | Distributed system perspective |

**Invariant**: `ObservationView ∉ EventLog`. These are semantic interpretations of execution history, never stored.

**Boundary rule**: `ReplayObservations ∩ ObservationView = ∅`. Replay-level observations are mechanical (low-level VM introspection). View AST observations are semantic (high-level interpretation). They are never mixed.

---

## 4. Structural Grammar Rules

### Rule 1 — Root constraint

Only one root per causal tree:
```
PromptSubmitted := root node
causality.parent_event_ids = []
```

### Rule 2 — Causal continuity

Every non-root event must have a parent:
```
∀ event E ≠ PromptSubmitted: |E.causality.parent_event_ids| ≥ 1
```

No orphan events allowed.

### Rule 3 — Type lineage constraints

```
PromptSubmitted
  → IntentDerived

IntentDerived
  → RequirementCreated | ResponseGenerated

RequirementCreated
  → RequirementRefined

RequirementRefined
  → RequirementValidated

RequirementValidated
  → WorkRequestCreated

WorkRequestCreated
  → ExecutionGraphCreated | WorkRequestRefined

ExecutionGraphCreated
  → ExecutorSelected

ExecutorSelected
  → ExecutionNodeGenerated (× N)

ExecutionNodeGenerated
  → DependencyLowered (× M)

DependencyLowered
  → LoweringComplete

LoweringComplete
  → NodeReadied

NodeReadied
  → NodeClaimed | NodeSkipped

NodeClaimed
  → ExecutionBound | LeaseExpired

ExecutionBound
  → NodeExecutionStarted

NodeExecutionStarted
  → ExecutionProgressed
  → ExecutionSucceeded | ExecutionFailed | ErrorEvent

ExecutionSucceeded
  → ResponseGenerated

ExecutionFailed
  → RetryEvent (retryable)
  → FailureNode materialized (terminal)

NodeSkipped | NodeBlocked | ExecutionHeartbeat | ExecutionOutputProduced
  → ExecutionGraphCompleted
```

### Rule 4 — Artifact binding

Every event must create, mutate, or reference at least one artifact:
```
∀ event E: |E.artifact_refs| ≥ 1 OR E.type ∈ {SystemEvent, ErrorEvent}
```

No pure-log events.

### Rule 5 — Immutability

Once emitted, an event is never modified. State changes produce new events.

### Rule 6 — Deterministic replay

Given `causal_chain_id`, the system must be able to reconstruct the full causal chain of WorkRequests, Responses, and Execution sequence without external context.

---

## 5. Semantic Rules

### 5.1 No meaning-free events

An event is invalid if it:
- does not change system state
- AND does not affect downstream decisions
- AND is not needed for replay or debugging

### 5.2 Single responsibility

Each event represents exactly one causal decision, state transition, or execution boundary.

### 5.3 Causal locality

Events reference only:
- parent event (`causality.parent_event_ids[0]`)
- causal chain root (`causality.causal_chain_id`)
- directly adjacent artifacts (`artifact_refs`)

No long-range arbitrary links unless explicitly tagged.

### 5.4 No hidden state mutation

If system behavior changes, it must be visible as `Event → Artifact mutation → new Event`. No silent updates.

---

## 6. Compact Production Grammar

```
Execution := PromptSubmitted
  → IntentDerived
    → (RequirementCreated → RequirementRefined* → RequirementValidated)
      → WorkRequestCreated
      → NodeReadied
            → NodeClaimed
              → ExecutionBound
                → NodeExecutionStarted
              → (ExecutionProgressed)*
                → ExecutionSucceeded | ExecutionFailed
                  → (RetryEvent → NodeReadied)* | ResponseGenerated
```

Where:
- `→` is causality
- `*` is zero or more repetitions
- `|` is branching
- Terminal failures materialize FailureNode and emit NodeBlocked to dependents

---

## 7. Storage Model

### 7.1 CER Canonical Store

All events are stored as CER in a domain-partitioned, causal-chain-indexed layout:

```
.pipeline/
  events/
    cer/
      {domain}/
        {causal_chain_id}/
          events.log      ← sequential CER events (JSON lines format)
          index.json      ← event offset index (event_id → byte offset)
```

### 7.2 Legacy Events (Pre-CER)

Raw legacy events remain at their original location, untouched:

```
.pipeline/events/legacy/{domain}/{YYYY}/{MM}/{event-id}.json
```

These are readable at replay via the LegacyCERAdapter — see [`CER_SPEC.md §9`](./CER_SPEC.md).

### 7.3 Storage Constraints

- Events are append-only within each `events.log`
- Events are domain-partitioned and causal-chain-indexed
- Events are fully referential — no duplication of full artifact payloads
- Events are reconstructible from artifacts if the event log is lost
- Events are NOT authoritative state

---

## 8. System Invariant

```
Artifacts = System State
 CER Events = Causal Trace over Artifact transitions
   Graphs = Interpretations of Artifacts + Events
   Snapshots = Derived compression of CER history (deletable, regenerable)
```

---

## 9. CER Versioning

Events carry three independent version axes. See [`CER_SPEC.md §2`](./CER_SPEC.md) for full specification.

| Axis | Field | Role |
|---|---|---|
| Schema version | `event_version` | Structure changes. Backwards compatible |
| Compression version | `compression.compression_version` | Compression algorithm changes |
| Domain version | `identity.scope` | Execution semantics version |

**Versioning rule:**

Events are immutable across schema versions. Transformation happens via adapters, never mutation:

```
v1 event → v2 reader → normalized CER
```
