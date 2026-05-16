# Event Replay Engine v1 — Temporal AST Interpreter

## 1. Conceptual Definition

The Event Replay Engine is a deterministic reconstruction of ExecutionGraph state over time by re-applying a totally ordered event log. It is a **temporal interpreter**, not an executor.

```
Replay Engine = Deterministic fold over EventLog → RuntimeSnapshot
```

## 2. System Role

```
Prompt → Compiler → ExecutionGraph
                          ↓
                    Scheduler (forward execution)
                          ↓
                    Event Log (truth)
                          ↓
            ┌─────────────┴─────────────┐
            ↓                           ↓
   Runtime State               Replay Engine
 (live system view)        (temporal reconstruction)
                                  ↓
                            Checkpoints (cache)
                                  ↓
                            Debugger / Inspector
```

## 3. Core Model: Event → State Transition

Replay is a pure fold over events:

```
State₀ ──E1──→ State₁ ──E2──→ State₂ ──...──→ Stateₙ
```

### 3.1 Formal Function

```
function replay(events: EventLog, initialState: RuntimeSnapshot): RuntimeSnapshot
    state = initialState
    for event in events:
        state = apply(state, event)
    return state
```

### 3.2 Event Application

```
function apply(state: RuntimeSnapshot, event: Event): RuntimeSnapshot
    switch event.type:
        case NodeReadied:       return applyNodeReadied(state, event)
        case NodeClaimed:       return applyNodeClaimed(state, event)
        case ExecutionBound:    return applyExecutionBound(state, event)
        case NodeExecutionStarted: return applyNodeExecutionStarted(state, event)
        case ExecutionProgressed:  return applyExecutionProgressed(state, event)
        case ExecutionSucceeded:   return applyExecutionSucceeded(state, event)
        case ExecutionFailed:      return applyExecutionFailed(state, event)
        case NodeSkipped:          return applyNodeSkipped(state, event)
        case NodeBlocked:          return applyNodeBlocked(state, event)
        case RetryEvent:           return applyRetryEvent(state, event)
        case LeaseExpired:         return applyLeaseExpired(state, event)
        case HostHeartbeat:        return applyHostHeartbeat(state, event)
        case ExecutionGraphCreated: return applyExecutionGraphCreated(state, event)
        case ExecutorSelected:     return applyExecutorSelected(state, event)
        case ExecutionNodeGenerated: return applyExecutionNodeGenerated(state, event)
        case DependencyLowered:    return applyDependencyLowered(state, event)
        case LoweringComplete:     return applyLoweringComplete(state, event)
        case ExecutionGraphCompleted: return applyExecutionGraphCompleted(state, event)
        case ArtifactPersisted:    return applyArtifactPersisted(state, event)
        case ResponseGenerated:    return applyResponseGenerated(state, event)
        case ErrorEvent:           return applyErrorEvent(state, event)
        // ... all known event types
```

### 3.3 Determinism Rule

```
∀ state, event:
    apply(state, event) is pure
```

No randomness. No I/O. No side effects.

## 4. Reconstructed State

The replay engine reconstructs three layers of state.

### 4.1 Per-Node State

```json
{
  "node_id": "EX-001",
  "lifecycle_state": "pending | READY | CLAIMED | BOUND | RUNNING | SUCCEEDED | FAILED | SKIPPED | BLOCKED",
  "owner_host": null,
  "executor_instance": null,
  "outputs": null,
  "retries": 0,
  "claim": null,
  "artifact_refs": []
}
```

### 4.2 Scheduler State

```json
{
  "ready_queue": ["EX-002", "EX-003"],
  "claimed_nodes": {"EX-004": "host-1"},
  "running_nodes": {"EX-005": "host-2"},
  "blocked_nodes": ["EX-006"],
  "retry_counters": {"EX-007": 2}
}
```

### 4.3 Distributed State

```json
{
  "host_registry": {
    "host-1": { "last_heartbeat": "...", "capabilities": ["..."] }
  },
  "leases": {
    "EX-004": { "host_id": "host-1", "lease_id": "...", "expires_at": "..." }
  }
}
```

## 5. Replay Modes

### 5.1 Full Replay

Reconstruct entire execution from scratch:

```
∅ → apply(E1..En)
```

Used for: debugging, audit, verification.

### 5.2 Incremental Replay (Checkpointed)

Start from saved snapshot:

```
checkpoint.state + apply(Ek+1..En)
```

Used for: fast recovery, partial recomputation.

### 5.3 Time-Travel Replay (Point-in-Time)

```
replay(events[0..k])
```

Used for: debugging failures, inspecting intermediate outputs.

### 5.4 Branch Replay (Hypothetical)

```
replay(events[0..k] + hypothetical_events)
```

Used for: what-if analysis, optimization simulation.

## 6. Replay Cursor

### 6.1 Definition

```typescript
type ReplayCursor = {
  eventIndex: number  // position in EventLog
  time: timestamp     // logical time at this position
}
```

### 6.2 Operations

| Operation | Implementation |
|---|---|
| **Step forward** | `cursor.eventIndex += 1; apply(state, events[cursor.eventIndex])` |
| **Step back** | Not physical undo — recompute: `replay(events[0..cursor.eventIndex-1])` |
| **Jump** | `replay(events[0..target])` |

Back is always recompute. No event is ever un-applied. This guarantees determinism.

## 7. Observability Model

### 7.0 Boundary Clarification

The replay engine produces **low-level mechanical observations** (state snapshots, queue views). The Phase 3 Observation Engine produces **high-level semantic View AST objects** (GraphView, NodeView, TraceView, etc.). These are separate layers with separate concerns.

```
Replay Engine (this document)
    ↓
  ReplayObservations ← structural, mechanical, machine-level
    ↓
Observation Engine (OBSERVATION_MODEL.md)
    ↓
  View AST ← interpretive, semantic, user-facing
```

Rule: Replay observations MUST NOT be used as input to Observation Engine semantic reducers.

### 7.1 Principle

Observation events are **ephemeral**. They are derived projections of replay, not part of execution truth.

```
EventLog (source of truth)
    ↓
Replay Engine (fold)
    ↓
Derived Views (observations) — ephemeral, in-memory only
```

### 7.2 Invariant

```
ObservationEvents ∉ EventLog
ObservationEvents = f(replay(state))
```

### 7.3 Observation Event Types

| Type | Purpose |
|---|---|
| `StateSnapshot` | Full state dump at cursor position |
| `NodeStateTransitionView` | Human-readable node state change |
| `SchedulerQueueView` | Snapshot of ready/claimed/running/blocked queues |
| `LeaseGraphView` | Current lease ownership graph |
| `DependencyChainView` | Causal chain for a given node |

### 7.4 Storage

Observation events are:
- Emitted in-memory only
- Optionally streamed to a debugger UI
- Optionally logged as a "debug trace" (separate from Event Log)
- **NOT** stored in `.pipeline/EVENTS/Observation/`
- **NOT** part of the canonical event stream

## 8. Checkpoint Model

### 8.1 Purpose

Checkpoints are **cache artifacts** that accelerate replay. They are not canonical truth.

```
EventLog (truth, authoritative)
    ↓
Replay Engine (derivation)
    ↓
Checkpoint (optimization artifact, deletable)
```

### 8.2 Checkpoint Object

```json
{
  "checkpoint_id": "ckpt-0500",
  "event_index": 500,
  "event_hash": "sha256-of-event-500",

  "execution_graph_state": {
    "nodes": { "EX-001": { ... node state ... }, ... },
    "edges": [...]
  },

  "scheduler_state": {
    "ready_queue": [...],
    "running_nodes": {...},
    "blocked_nodes": [...],
    "retry_counters": {...}
  },

  "distributed_state": {
    "host_registry": {...},
    "leases": {...}
  },

  "timestamp": "2026-05-14T18:00:00Z"
}
```

### 8.3 Invariant

```
replay(events[0..k]) == checkpoint.state
```

Must hold for any valid checkpoint at index k.

### 8.4 Placement

```
.pipeline/EXECUTIONS/
    checkpoint-0500.json
    checkpoint-1000.json
    checkpoint-1500.json
```

### 8.5 Creation Rule

```
if (event_index % CHECKPOINT_INTERVAL == 0 OR hot_state_change):
    write_checkpoint(event_index, state)
```

Where:
- `CHECKPOINT_INTERVAL` = tuning parameter (default 100)
- `hot_state_change` = large fan-out, failure cascade, or distributed state change

### 8.6 Restoration

```
load_checkpoint(k):
    state = checkpoint[k].execution_graph_state
    resume replay from event_index k+1
```

### 8.7 Rules

- Checkpoints are **deletable at any time** — no correctness impact, only performance
- Checkpoints are **regenerable** — `replay(events[0..k])` produces identical state
- Checkpoints must be verified on load: `state.event_hash == sha256(events[k])`

## 9. Round-Trip Invariant

This is the core mathematical identity of the system:

```
ExecutionTrace = Replay(EventLog)
EventLog = trace(Scheduler(ExecutionGraph))
```

Therefore:

```
Replay(trace(x)) = x
```

The replay engine applied to the trace of a scheduler execution reconstructs the original execution state. This is the round-trip invariant.

## 10. Relationship to the Scheduler

| Component | Direction | Meaning |
|---|---|---|
| **Scheduler** | Forward execution | Produces events |
| **Replay Engine** | Backward reconstruction | Consumes events |

They are **inverse interpreters** over the same semantics:

```
Scheduler: ExecutionGraph → EventLog (forward)
Replay:    EventLog → RuntimeSnapshot (reverse)
```

## 11. Distributed Replay Semantics

Replay is identical in distributed mode. The replay engine does not care how many schedulers existed or which host produced which event:

```
Scheduler₁ ──┐
Scheduler₂ ──┼──→ Shared EventLog ──→ Replay Engine
Scheduler₃ ──┘
```

**Key property**: Only event order matters. The replay engine is agnostic to the number of schedulers.

## 12. Debugger Semantics

Replay enables a fully debuggable program AST:

### 12.1 Node Inspection

```
inspect(node_id: str, cursor: ReplayCursor) → NodeState
```

Returns the state of a specific node at the given cursor position.

### 12.2 Causal Trace

```
trace(node_id: str) → Event[]
```

Returns the ordered sequence of events that affected the given node.

### 12.3 Dependency Timeline

```
dependency_chain(node_id: str) → Node[]
```

Returns the upstream dependency chain for a node at its point of execution.

## 13. Invariants

### 13.1 Deterministic Replay

```
replay(events) always produces identical state
```

### 13.2 Event Sufficiency

EventLog is sufficient to reconstruct full execution state. No hidden memory allowed.

### 13.3 No Side Effects

Replay MUST NOT:
- Execute nodes
- Call executors
- Mutate external systems
- Persist observation events

It is **pure interpretation**.

### 13.4 Ordering Integrity

Events MUST be totally ordered before replay. Partial ordering is not replayable.

### 13.5 Validation Independence

Replay is a pure fold — it does not validate. `ValidationFailure` events are `System`-domain annotations that replay passes through transparently. They do not affect reconstructed state.

```
replay(event_log) == state  (regardless of ValidationFailure presence)
```

Replay output is semantic state, not a correctness judgment. Validation authority belongs exclusively to the `executiongraph-validator` (static/runtime lanes). The replay engine has no validation authority.

## 14. Failure Semantics During Replay

Replay does NOT "fix" failures. It reconstructs them faithfully:

- `FAILED` nodes remain `FAILED`
- Retries are replayed
- Lease expirations are reproduced
- The round-trip invariant holds for failed executions too

This is critical for forensic correctness.

## 15. Architectural Position

```
Compiler → IR → Scheduler → EventLog → ReplayEngine → Debugger
                                              ↓
                                        Checkpoints (cache)
```

This forms a complete deterministic execution + reconstruction system — effectively a **reversible distributed virtual machine**.

## 16. What This Completes

| Property | Achievement |
|---|---|
| Compilation correctness | Phase 1 + Lowering |
| Execution determinism | Single-host scheduler |
| Distributed determinism | Multi-host scheduler with claim protocol |
| Temporal reconstruction | Replay Engine |
| Full auditability | Replay(EventLog) = any past state |
