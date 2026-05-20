# Phase 2: Execution Runtime v2

## Core Idea

Phase 2 takes a frozen ExecutionGraph (produced by the Phase 1.5 lowering pass) and interprets it as a program via a deterministic Scheduler. The event stream is the verifiable causal trace of everything that happened.

Phase 2 does NOT reinterpret intent. It only instantiates it.

The full pipeline from Phase 1 through Phase 2:

```
Phase 1: WorkRequestGraph (intent IR)
    ↓
Phase 1.5: [Lowering Pass] → ExecutionGraph (frozen AST, all nodes pending)
    ↓
Phase 2: [Scheduler] → Event Stream
                            ↓
                    Artifacts (Response, Outputs)
```

**Think**: two-stage compiler + AST interpreter + event-sourced execution tracer + fault model.

---

## 1. Phase 2 Architecture

### 1.1 Two Layers (within Phase 2)

| Layer | Responsibility | Owner |
|---|---|---|
| **Scheduling** | Interpret ExecutionGraph: evaluate readiness, acquire executors, dispatch, observe, transition | Scheduler |
| **Storage** | Persist events and artifacts | Event System |

The lowering pass (Phase 1.5) runs before Phase 2 and produces the frozen ExecutionGraph. See [`LOWERING_PASS.md`](./LOWERING_PASS.md).

### 1.2 The Scheduler is the Interpreter

Phase 2 is not a workflow engine. It is a deterministic execution language runtime:

```
ExecutionGraph = Program
Scheduler      = Interpreter
Executors      = Native Instructions
Events         = Execution Trace
```

The Scheduler is the sole authority for:
- Transitioning node lifecycle states
- Allocating executors
- Granting resource access
- Initiating retries
- Materializing FailureNodes

The Scheduler may NOT:
- Mutate graph topology
- Modify node definitions
- Fabricate outputs

---

## 2. The Execution Graph

The Execution Graph is a frozen runtime instantiation of WorkRequests. Each node is an instruction in the AST program.

### 2.1 ExecutionNode

```json
ExecutionNode {
  "id": "EX-001",
  "type": "TaskNode | ControlNode | ResourceNode | ObservationNode | SystemNode | FailureNode",
  "work_request_id": "WR-001",
  "internal_phase": "prepare | execute | finalize",
  "lifecycle_state": "pending | READY | BOUND | RUNNING | SUCCEEDED | FAILED | SKIPPED | BLOCKED",
  "inputs": {},
  "outputs": {},
  "dependencies": ["EX-002"],
  "executor_selection": { "executorId": "...", "executionMode": "sync", "resourceProfile": {} },
  "bound_execution": null,
  "scheduling_hints": { "priority": null, "concurrencyGroup": null, "resourceTags": [] },
  "retry_policy": {
    "max_retries": 3,
    "backoff": "exponential"
  },
  "event_refs": ["event_790", "event_791"]
}
```

### 2.2 Key Distinction

| WorkRequest | ExecutionNode |
|---|---|
| "Generate Euclidean rhythm pattern" | `EuclideanGenerator v3` with params X, BOUND, RUNNING at time T |

WorkRequests are abstract specifications. ExecutionNodes are concrete runtime instructions.

---

## 3. Node Lifecycle State Machine

### 3.1 States

```
pending | READY | CLAIMED | BOUND | RUNNING | SUCCEEDED | FAILED | SKIPPED | BLOCKED
```

### 3.2 Transitions

```
Normal path (single-host):

pending → READY → BOUND → RUNNING → SUCCEEDED

Normal path (distributed):

pending → READY → CLAIMED → BOUND → RUNNING → SUCCEEDED

Failure path (retryable):

RUNNING → FAILED → READY → (CLAIMED →) BOUND → RUNNING → SUCCEEDED

Failure path (terminal):

RUNNING → FAILED

Skipped path:

READY → SKIPPED

Claim expiry:

CLAIMED → READY

Blocked path (any state):

pending | READY | CLAIMED | BOUND | RUNNING → BLOCKED
```

### 3.3 Mandatory Event Emission

| Transition | Event |
|---|---|
| pending → READY | `NodeReadied` |
| READY → CLAIMED | `NodeClaimed` |
| CLAIMED → READY | `LeaseExpired` |
| READY → BOUND | `ExecutionBound` |
| BOUND → RUNNING | `NodeExecutionStarted` |
| RUNNING → progress | `ExecutionProgressed` |
| RUNNING → SUCCEEDED | `ExecutionSucceeded` |
| RUNNING → FAILED | `ExecutionFailed` |
| FAILED → READY | `RetryEvent` |
| READY → SKIPPED | `NodeSkipped` |
| any → BLOCKED | `NodeBlocked` |

**No state change without an event.** This makes the Execution Graph fully reconstructible.

---

## 4. Scheduler (AST Interpreter)

### 4.1 Execution Loop

The scheduler evaluates the ExecutionGraph as a program via discrete ticks:

```
Tick:
    1. Read runtime events from executors
    2. Evaluate readiness for all non-terminal nodes
    3. Claim READY nodes (distributed only; READY → CLAIMED)
    4. Acquire executors for CLAIMED|READY nodes (→ BOUND)
    5. Dispatch bound nodes (BOUND → RUNNING)
    6. Commit all state transitions atomically
    7. Emit events for all transitions
```

### 4.5 Distributed Mode

The scheduler supports multi-host distributed operation via an optimistic claim protocol. See [`DISTRIBUTED_SCHEDULER.md`](./DISTRIBUTED_SCHEDULER.md) for the full specification.

In distributed mode:
- Each host runs an identical scheduler instance
- Hosts claim nodes via the event log (no locking)
- `READY → CLAIMED → BOUND` replaces `READY → BOUND`
- `HostHeartbeat` events signal liveness
- `LeaseExpired` releases orphaned claims

### 4.2 Readiness Gate

An ExecutionNode becomes READY iff:

- All upstream dependencies are SUCCEEDED
- Required resources are available (no conflicting locks)
- Retry limit not exceeded
- Time constraints satisfied

### 4.3 Scheduling Decision Points

The scheduler is invoked repeatedly:

1. After a node completes → evaluate downstream nodes for readiness
2. On executor available → bind and dispatch waiting nodes
3. On resource released → re-evaluate blocked nodes
4. On timeout → transition overdue nodes to FAILED

### 4.4 Resource Arbitration

The scheduler owns all resource locks. Resource state model:

```
FREE → RESERVED → IN_USE → FREE
```

Locks are acquired during readiness evaluation and released when a node reaches a terminal state.

---

## 5. Executor Model

An executor is any system capable of executing an ExecutionNode instruction:

```json
Executor {
  "start": "(inputs, context) → execution_handle",
  "capabilities": [...],
  "constraints": {...}
}
```

### 5.1 Executor Contract

Executors:
- Receive `inputs` and a `WorkspaceContext`
- Produce `outputs` on success
- Emit runtime events (Heartbeat, Progress, Succeeded, Failed)
- Do NOT see the graph, other nodes, or scheduling state

### 5.2 Asynchronous Execution

Execution is asynchronous:

```
scheduler.bind_and_dispatch(node)  → returns immediately
...                                → scheduler continues tick loop
executor emits ExecutionSucceeded  → scheduler processes in next tick
```

---

## 6. Event → Artifact Production

Artifacts are produced by ExecutionNodes, recorded by events.

### 6.1 Artifact Paths

| Artifact | Path |
|---|---|
| Response records | `.pipeline/RESPONSE_RECORDS/{node_id}.json` |
| Execution summaries | `.pipeline/EXECUTIONS/run-summary.json` |
| Schedule plans | `.pipeline/EXECUTIONS/schedule-plan.json` |

### 6.2 Production Flow

```
Node SUCCEEDED
  → write outputs to .pipeline/RESPONSE_RECORDS/{node_id}.json
  → emit ArtifactPersisted event with artifact_ref
  → scheduler evaluates downstream readiness
```

---

## 7. Fault Model

### 7.1 Failure Classes

| Class | Retryable | Cause |
|---|---|---|
| Transient | Yes | Network error, resource contention |
| Deterministic | No | Bad input, violated constraint |
| Timeout | Yes | Executor exceeded deadline |
| Dependency failure | Propagates | Upstream node terminal-failed |
| Resource exhaustion | Depends | OOM, file handles, quota |

### 7.2 Recovery

```
On FAILED:
  if retryable AND retries remaining:
    FAILED → READY, backoff, reschedule
  else:
    materialize FailureNode
    propagate blocking to dependents
```

### 7.3 Failure is a Node

Terminal failures produce `FailureNode` instances in the ExecutionGraph. Causal chains remain intact through replay.

---

## 8. Phase 2 Pipeline (Within Runtime)

Phase 2 begins after the lowering pass (Phase 1.5) has produced a frozen ExecutionGraph:

```
From Phase 1.5: ExecutionGraph (frozen AST, all nodes pending)
    ↓
Scheduler Tick Loop:
    ├── Evaluate readiness (pending → READY)
    ├── Claim nodes (distributed: READY → CLAIMED)
    ├── Acquire executors (CLAIMED|READY → BOUND)
    ├── Dispatch (BOUND → RUNNING)
    ├── Process runtime events
    └── Commit transitions
    ↓
All nodes TERMINAL (SUCCEEDED | FAILED | SKIPPED | BLOCKED)
    ↓
ExecutionGraphCompleted event
```
WorkRequestGraph (IR-2)
    ↓
Lowering Pass (freeze topology)
    ↓
ExecutionGraph (frozen AST, all nodes pending)
    ↓
Scheduler Tick Loop:
    ├── Evaluate readiness (pending → READY)
    ├── Bind executors (READY → BOUND)
    ├── Dispatch (BOUND → RUNNING)
    ├── Process runtime events
    └── Commit transitions
    ↓
All nodes TERMINAL (SUCCEEDED | FAILED | SKIPPED | BLOCKED)
    ↓
ExecutionGraphCompleted event
```

---

## 9. Key Conceptual Shift

| Phase | Question |
|---|---|
| Phase 1 | "What should the system do?" |
| Phase 2 | "What is the system doing right now, and what can we prove about it afterward?" |

Phase 2 is fundamentally about:
- Determinism of trace
- Observability
- Reproducibility
- Controlled nondeterminism (where necessary)

---

## 10. Relationship Between Phases

```
PHASE 1 (Specification Compiler)
  Prompt → Requirements → WorkRequests
  ↓
  Handoff: WorkRequestGraph
  ↓
PHASE 1.5 (Lowering Compiler)
  WorkRequestGraph → validate → select executors → expand → project → assemble
  ↓
  Handoff: ExecutionGraph (frozen)
  ↓
PHASE 2 (Execution Runtime)
  ExecutionGraph → Scheduler → Events → Outputs
```

### Rules

- Phase 1 can be replayed without side effects
- Phase 1.5 is deterministic — same input always produces identical ExecutionGraph
- Phase 2 cannot be meaningfully replayed without producing events
- Phase 2 never reinterprets Phase 1 intent
- The Scheduler is the sole authority for node state transitions
- The Scheduler does not re-select executors (lowering selects, scheduler acquires)
- Every transition emits an event — no silent state
