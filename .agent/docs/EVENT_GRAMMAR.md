# Event Grammar v2

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

## 2. Base Event Schema

Every event conforms to this base structure:

```json
{
  "event_id": "uuid",
  "type": "EventType",
  "timestamp": "ISO-8601",
  "domain": "specification | execution | observation | system",
  "caused_by": "event_id | null",
  "root_prompt_id": "prompt_ref",
  "artifact_refs": ["artifact/path"],
  "data": {}
}
```

| Field | Rule |
|---|---|
| `event_id` | Globally unique, monotonic |
| `type` | Strictly enumerated AST node class (see §3) |
| `domain` | Which plane this event belongs to |
| `caused_by` | Parent causal event. `null` only for `PromptSubmitted` |
| `root_prompt_id` | Root causal ancestor. Always set. |
| `artifact_refs` | Links to artifact paths. Must have ≥1 entry unless `type ∈ {SystemEvent, ErrorEvent}` |
| `data` | Small structured payload. No artifact duplication. |

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
  "rule_id": "S5 | R3 | R10",
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
caused_by = null
```

### Rule 2 — Causal continuity

Every non-root event must have a parent:
```
∀ event E ≠ PromptSubmitted: E.caused_by ≠ null
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

Given `root_prompt_id`, the system must be able to reconstruct the full causal chain of WorkRequests, Responses, and Execution sequence without external context.

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
- parent event (`caused_by`)
- root prompt (`root_prompt_id`)
- directly adjacent artifacts

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

### 7.1 Location

```
.pipeline/EVENTS/{domain}/{YYYY}/{MM}/{event-id}.json
```

### 7.2 Event contents (minimal, referential)

```json
{
  "event_id": "abc123",
  "type": "ExecutionStarted",
  "timestamp": "2026-05-14T12:00:00Z",
  "caused_by": "event_789",
  "root_prompt_id": "prompt_1",
  "artifact_refs": ["WORKREQUESTS/wr_12"],
  "data": {
    "executor": "midi-engine"
  }
}
```

### 7.3 Constraints

- Events are append-only
- Events are domain-partitioned
- Events are fully referential — no duplication of full artifact payloads
- Events are reconstructible from artifacts if the event log is lost
- Events are NOT authoritative state

---

## 8. System Invariant

```
Artifacts = System State
Events = Causal Trace over Artifact transitions
Graphs = Interpretations of Artifacts + Events
```
