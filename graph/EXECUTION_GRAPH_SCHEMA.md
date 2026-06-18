>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Execution Graph Schema v2

## 1. Conceptual Overview

### 1.1 The Execution Graph as AST

The Execution Graph is a **typed Abstract Syntax Tree (AST)** representing the runtime program emitted by the agent compiler.

```
Domain Model:

  Specification     →   "what should happen"   (Phase 1)
  Execution         →   "what is happening"     (Phase 2, active)
  Observation       →   "what happened"         (Phase 2, recorded)
```

The compiler architecture produces two distinct graph structures:

| Graph | Phase | Role |
|---|---|---|
| WorkRequestGraph | 1 (Specification Compiler) | Abstract intent IR — no runtime bindings |
| ExecutionGraph | 2 (Execution Runtime) | Concrete runtime AST — typed nodes, bound executors, executable |

The relationship is:

```
WorkRequestGraph → [Execution Lowering Pass] → ExecutionGraph → [Scheduler]
```

The Scheduler is a **deterministic AST interpreter** — it evaluates the ExecutionGraph as a program, not as a workflow.

### 1.2 System Invariant

Nothing executes unless represented as an ExecutionGraph node. No scheduler tick transitions a node without an event. This invariant guarantees that the runtime AST is always the complete and authoritative description of the active program.

### 1.3 Conceptual Mapping

| Concept | Execution Graph Model |
|---|---|
| Program | ExecutionGraph |
| Instruction | ExecutionNode |
| Interpreter | Scheduler |
| Native Instruction | Executor |
| Execution Trace | Event Stream |

---

## 2. Phase Boundary Definition

### 2.1 The Lowering Pass

The boundary between Phase 1 and Phase 2 is Phase 1.5 — a formal **compiler lowering pass**. It transforms the abstract WorkRequestGraph (intent IR) into the concrete ExecutionGraph (runtime AST).

```
Phase 1 → WorkRequestGraph → [Lowering Pass] → ExecutionGraph → Phase 2
```

See [`LOWERING_PASS.md`](./LOWERING_PASS.md) for the full specification.

### 2.2 Input Contract

Phase 1 guarantees:

- A validated, internally consistent WorkRequestGraph
- No runtime bindings, executor references, or scheduling metadata
- Domain tag: `specification`

### 2.3 Lowering Responsibilities

| Responsibility | Description |
|---|---|
| **Validate** | Verify graph acyclic, capabilities known, inputs satisfiable |
| **Executor selection** | Each WorkRequest SHALL be matched to a concrete executor by capability |
| **Node expansion** | Each WorkRequest SHALL expand into exactly `[Prepare, Execute, Finalize]` nodes |
| **Dependency projection** | Abstract WorkRequest edges SHALL project to `Finalize(A) → Prepare(B)` |
| **Data channel resolution** | Data dependencies SHALL resolve to explicit artifact paths |
| **Constraint lowering** | Declarative constraints SHALL lower to scheduler hints |
| **State initialization** | All ExecutionNodes SHALL be initialized in `pending` state |
| **Freeze** | The assembled graph SHALL be frozen (topology immutable) |
| **Event emission** | The lowering pass MUST emit lowering events (ExecutionGraphCreated, ExecutorSelected, ExecutionNodeGenerated, DependencyLowered, LoweringComplete) |

### 2.4 Output

- ExecutionGraph — a frozen, fully materialized runtime AST
- Domain tag: `execution`
- All nodes in `pending` state
- All edges materialized to concrete node references
- Executor selections populated (deterministic, final)
- Expansion phases set: `prepare`, `execute`, `finalize` per node

### 2.5 Lowering Rule

```
∀ wr ∈ WorkRequestGraph:
    ∃ nodes ∈ ExecutionGraph | ∀ node ∈ nodes: node.work_request_id = wr.id
    ∧ node.lifecycle_state = pending
    ∧ node.internal_phase ∈ {prepare, execute, finalize}
    ∧ node.executor_selection ≠ null
```

---

## 3. Execution Graph as Typed AST

### 3.1 Core AST Properties

| Property | Rule |
|---|---|
| **Immutable topology** | The node/edge structure of the graph MUST NOT change after freezing. Only `lifecycle_state`, `outputs`, `event_refs` MAY mutate. |
| **Typed nodes** | Every node MUST have a type from the canonical set (§4) |
| **Typed edges** | Every edge MUST have a type from the canonical set (§5) |
| **Deterministic evaluation** | Given the same ExecutionGraph and executor outputs, the scheduler MUST produce identical state transitions and event stream |
| **Causal ordering** | Edge direction SHALL imply causal ordering — upstream nodes execute before downstream nodes |
| **Single root** | Every ExecutionGraph MUST have exactly one root node |

### 3.2 State Invariant

```
All runtime work is represented as ExecutionGraph nodes.
No executor runs without a corresponding node.
No artifact is produced without a node transition event.
The Scheduler is the sole authority for state transitions.
```

---

## 4. Type System

### 4.1 Base Node

Every node conforms to this base schema:

```json
{
  "id": "EX-001",
  "type": "TaskNode | ControlNode | ResourceNode | ObservationNode | SystemNode | FailureNode",
  "work_request_id": "WR-001",
  "internal_phase": "prepare | execute | finalize",
  "lifecycle_state": "pending | READY | CLAIMED | BOUND | RUNNING | SUCCEEDED | FAILED | SKIPPED | BLOCKED",
  "inputs": {},
  "outputs": {},
  "dependencies": ["EX-002"],
  "executor_selection": {
    "executorId": "euclidean-generator-v3",
    "executionMode": "sync",
    "resourceProfile": { "gpu": false }
  },
  "bound_execution": null,
  "scheduling_hints": {
    "priority": null,
    "concurrencyGroup": null,
    "resourceTags": []
  },
  "artifact_refs": [],
  "retry_policy": {
    "max_retries": 3,
    "backoff_strategy": "exponential | fixed | none",
    "fallback_executor": null
  },
  "claim": null,
  "runtime": {
    "allowed_hosts": null,
    "locality_hint": null
  },
  "event_refs": ["event_790", "event_791"]
}
```

#### Field: `claim`

Populated only in distributed mode during the claim protocol (§8.14). Contains:

```json
{
  "host_id": "host-1",
  "lease_id": "uuid",
  "lease_expiration": "2026-05-14T18:00:30Z"
}
```

`null` when unclaimed or in single-host mode.

#### Field: `runtime`

Contains runtime metadata set during lowering. `allowed_hosts` constrains which hosts may claim this node. `locality_hint` guides the scheduler toward data-affine hosts.

```json
{
  "allowed_hosts": ["host-1", "host-2"],
  "locality_hint": { "data_affinity": "artifact://path/data", "preferred_host": "host-with-data" }
}
```

`null` values mean no constraint.

---

### 4.2 Required Node Kinds

#### TaskNode

The fundamental executable unit.

| Field | Rule |
|---|---|
| `work_request_id` | MUST reference a valid specification-domain WorkRequest |
| `internal_phase` | MUST be one of: `prepare`, `execute`, `finalize` — set during lowering, immutable after |
| `executor_selection` | MUST be populated by the lowering pass (executor selection, not runtime acquisition) |
| `outputs` | MUST be populated on SUCCEEDED |

Used for: any unit of work that produces a tangible output.

#### PrepareNode

A TaskNode with `internal_phase = "prepare"`. Handles environment setup, resource acquisition, and input validation before the core computation runs.

```
PrepareNode ──[control]──→ ExecuteNode
```

| Field | Rule |
|---|---|
| `outputs` | Prepared environment context, passed as inputs to ExecuteNode |
| `executor_selection` | Same executor as the sibling ExecuteNode |

#### ExecuteNode

A TaskNode with `internal_phase = "execute"`. The primary computation — the core work of the WorkRequest.

```
PrepareNode ──[control]──→ ExecuteNode ──[control]──→ FinalizeNode
```

| Field | Rule |
|---|---|
| `inputs` | Includes prepared context from PrepareNode outputs |
| `outputs` | Raw computation results |

#### FinalizeNode

A TaskNode with `internal_phase = "finalize"". Commits outputs, releases resources, and finalizes side effects.

```
ExecuteNode ──[control]──→ FinalizeNode
```

| Field | Rule |
|---|---|
| `inputs` | Raw results from ExecuteNode outputs |
| `outputs` | Final committed outputs written to artifact paths |
| `artifact_refs` | MUST be populated on SUCCEEDED — references the persisted output |

#### ControlNode

Governs execution flow — sequencing, parallelism, branching, looping.

| Field | Rule |
|---|---|
| `control_type` | MUST be one of: `SEQUENCE`, `PARALLEL`, `CONDITIONAL`, `LOOP` |
| `executor_binding` | MUST be null (control nodes have no executor) |
| `lifecycle_state` | Transitions are instantaneous — see §8.5 |

| Type | Semantics | Children |
|---|---|---|
| `SEQUENCE` | Enable next child only after predecessor SUCCEEDED | Ordered list |
| `PARALLEL` | Enable all children simultaneously | Unordered set |
| `CONDITIONAL` | Evaluate predicate → activate one branch | Predicate + branches |
| `LOOP` | Reinsert child into READY after completion until predicate false | Body + predicate |

Used for: serial execution (`SEQUENCE`), parallel fan-out (`PARALLEL`), conditional branching (`CONDITIONAL`), iteration (`LOOP`).

#### ResourceNode

Represents a required resource — a file, a data source, a tool instance, a model handle.

| Field | Rule |
|---|---|
| `type` | MUST be one of: `FileHandle`, `ModelInstance`, `ToolHandle`, `DataSource` |
| `executor` | MUST reference a resource provider, not an execution engine |
| `resource_state` | `FREE | RESERVED | IN_USE` — managed by the scheduler's resource arbitrator |

Used for: locking a model instance, mounting a filesystem, acquiring an API handle.

#### ObservationNode

Represents a recording or inspection point. Produces no side effects; emits observation events.

| Field | Rule |
|---|---|
| `executor` | MUST be null or a read-only observer |
| `outputs` | MUST NOT mutate system state |

Used for: logging, metrics collection, audit checkpoints, trace points.

#### SystemNode

Represents infrastructure operations — retry scheduling, error routing, event publishing.

| Field | Rule |
|---|---|
| `type` | MUST be one of: `RetryScheduler`, `ErrorRouter`, `EventPublisher` |
| `lifecycle_state` | MUST be transparent to the scheduler — evaluated inline |

Used for: routing failed nodes to retry policies, publishing completion events asynchronously.

#### FailureNode

Represents a terminal failure. Materialized by the scheduler when recovery is exhausted or a fault is non-retryable.

| Field | Rule |
|---|---|
| `failure_class` | MUST be one of: `TransientFailure`, `DeterministicFailure`, `TimeoutFailure`, `DependencyFailure` |
| `lifecycle_state` | MUST be `FAILED` — terminal state |
| `causal_chain` | MUST contain the error trace linking back to originating node |

Used for: capturing the failure mode, linking to the `ExecutionFailed` event, preserving the causal chain for replay.

---

## 5. Edge Types

### 5.1 DataDependency

One node produces output consumed by another.

```
EX-001 ──[DataDependency]──→ EX-002
```

| Rule | Constraint |
|---|---|
| Source node MUST complete before target starts | `EX-001.state ∈ {SUCCEEDED}` |
| Target receives source outputs as inputs | `EX-002.inputs ⊆ EX-001.outputs` |

### 5.2 ControlDependency

One node must terminate (SUCCEEDED or FAILED) before another may proceed, without data transfer.

```
EX-001 ──[ControlDependency]──→ EX-002
```

| Rule | Constraint |
|---|---|
| Source node MUST terminate before target starts | `EX-001.state ∈ {SUCCEEDED, FAILED}` |
| No data transfer implied | `EX-002.inputs ⊈ EX-001.outputs` |

### 5.3 ResourceDependency

One node requires a resource held or produced by another.

```
EX-001 ──[ResourceDependency]──→ EX-002
```

| Rule | Constraint |
|---|---|
| Resource node MUST be in `SUCCEEDED` state with resource FREE | `EX-001.state = SUCCEEDED` |
| Target node MUST release resource after terminal transition | `EX-002.lifecycle_state ∈ TERMINAL ⇒ unlock(resource)` |

### 5.4 CausalEdge

Documents causality without ordering constraint. Used for traceability.

```
EX-001 ──[CausalEdge]──→ EX-002
```

| Rule | Constraint |
|---|---|
| No ordering constraint | `EX-001` and `EX-002` MAY execute in any order |
| Causal relationship is recorded for replay | The edge persists in the graph forever |

### 5.5 Lineage Constraints

```
∀ edge ∈ ExecutionGraph.Edges:
    edge.source ∈ ExecutionGraph.Nodes
    ∧ edge.target ∈ ExecutionGraph.Nodes
    ∧ edge.source ≠ edge.target

No self-loops. No dangling references. No orphan edges.
```

---

## 6. Node Lifecycle State Machine

### 6.1 State Set

```
pending | READY | CLAIMED | BOUND | RUNNING | SUCCEEDED | FAILED | SKIPPED | BLOCKED
```

### 6.2 Legal Transitions

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

### 6.3 Transition Diagram (Distributed)

```
                              +--→ SUCCEEDED
                              |
pending → READY → CLAIMED → BOUND → RUNNING ──→ FAILED ──→ READY (retry)
   |         |         |         |                 |            |
   |         |    [lease expires] |                 +──→ FAILED (terminal)
   |         |         ↓         |                              |
   |         +──→ SKIPPED        +──→ BLOCKED ←─────────────────+
   |                              |
   +──────────────────────────────+
```

### 6.4 Mandatory Event Emission

| Transition | Event Type | Scope |
|---|---|---|
| pending → READY | `NodeReadied` | execution |
| READY → BOUND | `ExecutionBound` | execution |
| BOUND → RUNNING | `NodeExecutionStarted` | execution |
| RUNNING → RUNNING (progress) | `ExecutionProgressed` | execution |
| RUNNING → SUCCEEDED | `ExecutionSucceeded` | execution |
| RUNNING → FAILED | `ExecutionFailed` | execution |
| FAILED → READY (retry) | `RetryEvent` | system |
| READY → SKIPPED | `NodeSkipped` | execution |
| any → BLOCKED | `NodeBlocked` | execution |

**No state transition without a corresponding event. This is invariant.**

### 6.5 Illegal Transitions

```
pending → BOUND              (MISSING: READY)
READY → RUNNING              (MISSING: BOUND)
RUNNING → READY               (MISSING: FAILED)
SUCCEEDED → RUNNING           (terminal — no reverse)
FAILED → SUCCEEDED            (MUST go through retry cycle)
SKIPPED → READY               (terminal — no reverse)
```

Any illegal transition is a system violation and MUST terminate scheduling.

### 6.6 Retry Semantics

```
On FAILED:
  if error_class == TRANSIENT AND retry_count < max_retries:
    emit RetryEvent { retry_count, backoff_ms }
    transition: FAILED → READY
    increment retry_count
    scheduler waits backoff_ms before next readiness evaluation
  else if error_class == DETERMINISTIC OR retry_count >= max_retries:
    emit ExecutionFailed { terminal: true }
    materialize FailureNode
    propagate blocking effects to downstream nodes
```

---

## 7. Execution Lowering Algorithm

This section defines the lowering pass as a 7-step algorithm. See [`LOWERING_PASS.md`](./LOWERING_PASS.md) for the full specification with types, invariants, and formal rules.

### 7.1 Algorithm Signature

```
function lower(wrGraph: WorkRequestGraph): ExecutionGraph
```

### 7.2 Step 0 — Validate Input

Preconditions that MUST hold before lowering begins:

- Graph is acyclic
- All dependency targets exist
- Every `capability` is recognized by the ExecutorRegistry
- Every `inputs` spec is satisfiable

Failure → `LoweringError`, no graph produced.

### 7.3 Step 1 — Executor Selection

For each WorkRequest, select a concrete executor:

```
rule: WR.capability ∈ ExecutorRegistry.capabilities
```

Each WorkRequest maps to exactly one `ExecutorSelection { executorId, executionMode, resourceProfile }`.

### 7.4 Step 2 — Node Expansion

Each WorkRequest expands into exactly three ExecutionNodes with distinct `internal_phase` values:

```
WorkRequest WR
   ↓
[PrepareNode] → [ExecuteNode] → [FinalizeNode]
```

| Phase | Role |
|---|---|
| `prepare` | Environment setup, resource acquisition, input validation |
| `execute` | Core computation |
| `finalize` | Output commit, resource release |

Intra-expansion edges connect them in sequence:

```
PrepareNode ──[control]──→ ExecuteNode ──[control]──→ FinalizeNode
```

### 7.5 Step 3 — Dependency Projection

WorkRequest edges project to ExecutionNode edges. `WR_A → WR_B` becomes:

```
FinalizeNode(A) ──[control]──→ PrepareNode(B)
```

| WR Edge Type | Projected As |
|---|---|
| `data` | `Finalize(A) → Prepare(B)` + data channel edge |
| `ordering` | `Finalize(A) → Prepare(B)` (control edge only) |
| `resource` | `Finalize(A) → Prepare(B)` + resource tag propagation |

### 7.6 Step 4 — Data Channel Resolution

For each data dependency, create an explicit artifact reference:

```
ExecutionEdge {
  from: FinalizeNode(A),
  to: PrepareNode(B),
  type: "data",
  artifactRef: ".pipeline/RESPONSE_RECORDS/{A.id}.json"
}
```

### 7.7 Step 5 — Constraint Lowering

Declarative WorkRequest constraints become concrete `scheduling_hints`:

| WorkRequest Constraint | Lowered Field |
|---|---|
| `requires: "gpu"` | `scheduling_hints.resourceTags = ["gpu"]` |
| `serialize: true` | `scheduling_hints.concurrencyGroup = "mutex:{WR.id}"` |
| `priority: "high"` | `scheduling_hints.priority = 1` |
| `timeout: "30s"` | `retry_policy.timeout_ms = 30000` |

### 7.8 Step 6 — Lifecycle Initialization

All nodes enter initial state:

```
lifecycle_state = pending
```

Metadata populated:

```json
{
  "createdFrom": "WRGraph-001",
  "createdAt": "<timestamp>",
  "version": "1"
}
```

### 7.9 Step 7 — Graph Assembly

Collect all expanded nodes, projected edges, and metadata. Validate integrity, then freeze.

**Freezing** means:
- No nodes may be added or removed
- No edges may be added or removed
- Edge direction may not change
- Node type may not change

Only `lifecycle_state`, `outputs`, `executor_selection`, `bound_execution`, `scheduling_hints`, and `event_refs` MAY mutate after freezing.

---

## 8. Scheduler: AST Interpreter

### 8.1 Definition

The Scheduler is a deterministic interpreter over the ExecutionGraph AST. The Scheduler is the only authority allowed to transition node lifecycle states.

```
Scheduler := Deterministic Interpreter over ExecutionGraph AST
```

Executors perform work. The Scheduler decides when work is allowed to exist.

### 8.2 Core Responsibility

The Scheduler repeatedly performs:

```
Select → Validate → Bind → Dispatch → Observe → Transition
```

on nodes of the ExecutionGraph.

### 8.3 Execution Loop (Canonical Form)

```
while graph.has_runnable_nodes():
    ready_nodes = evaluate_readiness(graph)

    for node in ready_nodes:
        bind_executor(node)
        dispatch(node)

    process_runtime_events()
    update_node_states()
```

### 8.4 Readiness Evaluation

A node becomes READY when all conditions are met:

#### Dependency Conditions
```
∀ incoming_control_edges:
    upstream.state == SUCCEEDED
```

#### Resource Conditions
```
required_resources available AND no conflicting locks
```

#### Policy Conditions
```
retry_limit not exceeded AND time constraints satisfied
```

#### Formal Predicate
```
is_ready(node) :=
    deps_satisfied(node)
    AND resources_available(node)
    AND policy_allows(node)
```

### 8.5 Executor Acquisition (READY → BOUND)

The scheduler acquires an executor for a READY node. Selection (which executor) was already done by the lowering pass (§7.3). The scheduler only confirms runtime availability.

```
Node has: executor_selection = { executorId, executionMode, resourceProfile }
Scheduler: validates executor_selection.executorId is available in ExecutorRegistry
```

Acquisition produces:

```
BoundExecution {
    node_id,
    executor_id: node.executor_selection.executorId,
    runtime_handle: registry.acquire(executor_selection.executorId),
    capability_contract
}
```

State transition:

```
READY → BOUND
```

#### Acquisition Constraints

- Executor capability MUST match `node.executor_selection` (validated, not re-selected)
- Resource permissions MUST be validated at runtime
- Environment MUST be resolved

#### Failure

If the selected executor is unavailable at runtime (e.g., concurrency limit reached, service down):

```
emit: ExecutionFailed { node_id, error: "executor_unavailable", terminal: false }
emit: RetryEvent { node_id, retry_count }
transition: READY → FAILED → READY (if retryable)
```

If the selected executor does not exist in the registry (system error):

```
emit: ExecutionFailed { node_id, error: "executor_not_found", terminal: true }
materialize FailureNode
transition: READY → FAILED
```

**The scheduler does NOT re-select executors. If the lowering-selected executor is unavailable, it retries or fails — it does not pick a different executor.**

### 8.6 Dispatch Semantics

Dispatch transfers execution authority to an executor.

```
dispatch(node):
    emit NodeExecutionStarted { node_id, executor_id }
    transition: BOUND → RUNNING
    executor.start(node)
```

The scheduler does NOT wait synchronously. Execution is asynchronous — the scheduler continues its tick loop and processes executor events when they arrive.

### 8.7 Observation Processing

Executors emit runtime events back to the scheduler:

| Event | Meaning |
|---|---|
| `ExecutionHeartbeat` | Executor is alive, still working |
| `ExecutionProgressed` | Partial progress made |
| `ExecutionOutputProduced` | Intermediate output available |
| `ExecutionSucceeded` | Work completed successfully |
| `ExecutionFailed` | Work failed |

The scheduler consumes these events and updates node states:

```
ExecutionSucceeded  →  RUNNING → SUCCEEDED
ExecutionFailed     →  RUNNING → FAILED
```

Then:

```
if retry_allowed:
    FAILED → READY (with backoff)
else:
    materialize FailureNode
    propagate blocking effects
```

### 8.8 Resource Arbitration

The scheduler owns all resource locks. No executor may acquire a resource directly.

```
lock(resource, node)      # scheduler grants
unlock(resource, node)    # scheduler releases
```

#### Guarantees

- No double ownership
- Deterministic allocation
- Deadlock avoidance enforced

#### Resource State Model

```
ResourceNode.state: FREE | RESERVED | IN_USE
```

| Transition | Trigger |
|---|---|
| FREE → RESERVED | Scheduler evaluates readiness and finds resource required |
| RESERVED → IN_USE | Node transitions to RUNNING |
| IN_USE → FREE | Node transitions to TERMINAL state |

### 8.9 Control Node Interpretation

ControlNodes alter scheduling rules:

#### SEQUENCE

Enable next child only after predecessor SUCCEEDED.

```
On child[i] SUCCEEDED:
    child[i+1].dependencies satisfied → mark READY
```

#### PARALLEL

Enable all children simultaneously.

```
On SEQUENCE node activated:
    ∀ child ∈ children: child.dependencies satisfied → mark READY
```

#### CONDITIONAL

Evaluate predicate → activate exactly one branch.

```
On CONDITIONAL node activated:
    branch = evaluate(predicate, inputs)
    activate(branch) → mark branch root READY
```

#### LOOP

Reinsert child into READY after completion until predicate false.

```
On child SUCCEEDED:
    if evaluate(loop_predicate, child.outputs):
        reinsert child as READY (loop iteration)
    else:
        lopp node SUCCEEDED
```

### 8.10 Tick Model

The interpreter advances in discrete ticks.

```
Tick :=
    1. Read runtime events from executors
    2. Evaluate readiness for all non-terminal nodes
    3. Bind executors to READY nodes (READY → BOUND)
    4. Dispatch bound nodes (BOUND → RUNNING)
    5. Commit all state transitions atomically
    6. Emit events for all transitions
```

#### Tick Properties

| Property | Rule |
|---|---|
| **Atomic** | All transitions in a tick are committed together or not at all |
| **Idempotent** | Replaying the same tick produces identical state |
| **Replayable** | Every tick is fully determined by the event history |

### 8.11 Completion Condition

```
ExecutionGraph.is_finished() ⇔
    ∀ node ∈ ExecutionGraph.Nodes:
        node.lifecycle_state ∈ TERMINAL_STATES
```

#### Terminal States

```
SUCCEEDED | FAILED | SKIPPED | BLOCKED
```

On completion:

```
emit: ExecutionGraphCompleted {
    total_nodes,
    succeeded_count,
    failed_count,
    skipped_count,
    blocked_count,
    total_duration_ms
}
```

### 8.12 Concurrency Model

The scheduler is **logically single-threaded**.

Implementation MAY be parallel, but observable behavior MUST equal:

```
serial deterministic interpreter
```

No randomness allowed inside scheduling decisions.

### 8.13 Replay Semantics

The event replay engine is a separate system from the scheduler. See [`REPLAY_ENGINE.md`](./REPLAY_ENGINE.md) for the full specification.

```
Scheduler (forward):  ExecutionGraph → EventLog
Replay Engine (reverse): EventLog → RuntimeSnapshot
```

#### Round-Trip Invariant

```
Replay(trace(Scheduler(ExecutionGraph))) = RuntimeSnapshot
```

Replaying the event trace produced by a scheduler execution reconstructs the original execution state. This is the core identity of the system.

#### Replay Rules

- State is derivable from event history — no hidden memory
- Scheduler is stateless under replay
- Given the same event stream, replay MUST produce identical final state
- Replay MUST NOT execute nodes, call executors, or mutate external systems

#### Debugger Semantics

The replay engine enables:
- `inspect(node_id, time)` — node state at any point
- `trace(node_id)` — causal event chain for a node
- `dependency_chain(node_id)` — upstream dependency chain

The ExecutionGraph becomes a fully debuggable program AST.

### 8.14 Distributed Interpretation

The scheduler supports distributed operation across multiple hosts. See [`DISTRIBUTED_SCHEDULER.md`](./DISTRIBUTED_SCHEDULER.md) for the full specification.

#### Key Differences from Single-Host Mode

| Aspect | Single-Host | Distributed |
|---|---|---|
| Lifecycle | `READY → BOUND` | `READY → CLAIMED → BOUND` |
| Concurrency | Logically single-threaded | N identical interpreters |
| Coordination | Scheduler controls all | Optimistic claim protocol |
| State visibility | In-memory | Derived from shared event log |

#### Claim Protocol (Summary)

The claim protocol replaces locking:

1. Scheduler discovers READY nodes where `host_can_execute(node)`
2. Scheduler emits `NodeClaimed` to shared event log
3. Conflict resolution: earliest `NodeClaimed` in event log wins
4. Winner transitions `READY → CLAIMED` and proceeds to acquire executor
5. Losers ignore the node — it will be executed by the winner

#### Lease Model

Claims are time-bound:

- Default lease duration: 30s (configurable)
- Host MUST maintain lease via heartbeat
- Expired lease → `CLAIMED → READY` → node rescheduled

---

## 9. Fault Model

### 9.1 Failure Classes

| Class | Retryable | Cause |
|---|---|---|
| **Transient** | Yes | Network error, resource contention, temporary unavailability |
| **Deterministic** | No | Bad input, violated constraint, missing executor |
| **Timeout** | Yes | Executor exceeded deadline |
| **Dependency failure** | Propagates | Upstream node FAILED or BLOCKED |
| **Resource exhaustion** | Depends | Out of memory, file handles, quota |
| **Host crash** | Yes | Detected via missing HostHeartbeat; lease expires, node rescheduled |
| **Network partition** | Yes | Hosts continue locally; reconciliation via event log ordering |

### 9.2 Recovery Strategies

| Strategy | Applicable To | Behavior |
|---|---|---|
| **Retry** | Transient, Timeout | `FAILED → READY`, increment counter, backoff, reschedule |
| **Fallback** | Transient, Deterministic | Route to `retry_policy.fallback_executor` |
| **Propagate** | Dependency failure | Mark downstream nodes as BLOCKED, emit `NodeBlocked` |
| **Terminate** | Exhausted retries, hard error | Materialize `FailureNode`, emit `ExecutionFailed` (terminal) |
| **Lease expiry** | Host crash, network partition | `CLAIMED → READY`, node rescheduled via claim protocol |
| **Partition heal** | Network partition | Event log reconciliation; duplicate events are idempotent |

### 9.3 Failure is a Node

Every terminal failure SHALL materialize a `FailureNode` in the ExecutionGraph. This ensures:

- Failures are part of the runtime AST, not external to it
- Causal chains remain intact through replay
- Downstream nodes can depend on failure nodes deterministically

### 9.4 Distributed Failure Materialization

In distributed mode, any host may detect a failure and materialize a `FailureNode`:

```
Host crash detection (any host):
    1. Observe: no HostHeartbeat(host_id) for LEASE_DURATION_MS * 2
    2. For each node claimed by host_id:
         emit: LeaseExpired { node_id, host_id }
         transition: CLAIMED → READY
    3. Affected nodes are re-claimed by remaining hosts
```

The first `LeaseExpired` event in the log wins — duplicates are idempotent.

### 9.4 Failure Materialization by the Scheduler

```
On terminal failure (no retry possible):
    1. transition: RUNNING → FAILED
    2. materialize: FailureNode {
           id: "EX-F-{source_id}",
           failure_class: classify(error),
           lifecycle_state: FAILED,
           causal_chain: [source_node_id, error_event_id],
           outputs: { error: error_context }
       }
    3. emit: ExecutionFailed { terminal: true, failure_node_id }
    4. For each downstream node:
           transition: any → BLOCKED (if dependency_failure)
           emit: NodeBlocked { cause: failure_node_id }
```

---

## 10. Relationship to Event Grammar

### 10.1 Separation of Concerns

| Concept | Lives In | Role |
|---|---|---|
| ExecutionGraph | Runtime memory + `EXECUTIONS/` artifact | Authoritative structure of the active program |
| Events | `.pipeline/EVENTS/Execution/` | Causal projection of graph transitions |
| Artifacts | `.pipeline/RESPONSE_RECORDS/` etc. | State produced by execution |

### 10.2 Rules

- Events describe **transitions** of ExecutionGraph nodes — they do not describe the graph itself
- Events MUST NOT duplicate artifact contents (referential only)
- The ExecutionGraph is the authoritative execution structure; the event stream is a **causal projection** of graph execution
- Given the ExecutionGraph + full event stream, the system SHALL reconstruct the complete execution timeline
- Given only the event stream, the system SHALL reconstruct the ExecutionGraph topology (but not artifact contents)

### 10.3 Correspondence

```
ExecutionGraph State Transition → Event Type

pending → READY                 → NodeReadied
READY → BOUND                   → ExecutionBound
BOUND → RUNNING                 → NodeExecutionStarted
RUNNING → RUNNING (progress)    → ExecutionProgressed
RUNNING → SUCCEEDED             → ExecutionSucceeded
RUNNING → FAILED                → ExecutionFailed
FAILED → READY (retry)          → RetryEvent
READY → SKIPPED                 → NodeSkipped
any → BLOCKED                   → NodeBlocked
(executor runtime)              → ExecutionHeartbeat
(executor runtime)              → ExecutionOutputProduced
(graph complete)                → ExecutionGraphCompleted
```

---

## 11. Scheduler Invariants (Critical)

### 11.1 Topology Immutability

Graph structure never changes after freezing. Only the scheduler MAY modify `lifecycle_state`, `outputs`, `executor_binding`, `bound_execution`, and `event_refs`.

### 11.2 Single Authority

Only the scheduler transitions node lifecycle states. Executors, observers, and external systems MUST NOT modify node state.

### 11.3 Observable Execution

Every state transition emits an event. No silent transitions. No hidden state.

### 11.4 Executor Isolation

Executors cannot affect scheduling. They receive inputs, produce outputs, and emit runtime events. They do not see the graph, other nodes, or scheduling state.

### 11.5 Causal Traceability

Every node state change has a parent cause recorded in the event stream. Root causes trace back to a prompt via the `caused_by` chain.

---

## 12. Architectural Guarantees

### 12.1 Determinism

Given the same ExecutionGraph and same executor outputs, the scheduler SHALL produce identical state transitions and identical event stream.

### 12.2 Replayability

Given an ExecutionGraph and its full event stream, a new runtime instance SHALL reconstruct the complete execution timeline without external context. Replay SHALL be deterministic.

### 12.3 Auditability

Every artifact SHALL be traceable to the ExecutionNode that produced it. Every ExecutionNode SHALL be traceable to the WorkRequest and requirement that defined it. Every requirement SHALL be traceable to the prompt that originated it.

### 12.4 Time-Travel Debugging

Given a frozen ExecutionGraph and its event stream, the system SHALL reconstruct the state of any node at any tick in the execution timeline. This enables inspection of intermediate states, inputs, and outputs.

---

## 13. Validation Rules

Validation rules for the ExecutionGraph are formally specified in [`VALIDATOR_SPEC.md`](./VALIDATOR_SPEC.md).

### 13.1 Relationship to This Document

Rules previously distributed across this document are consolidated into the canonical validator:

| Previous Location | Rule |
|---|---|
| §2 Lowering Responsibilities | S1–S10 |
| §3 Core AST Properties | S8, S9 |
| §5 Node Kind Validation | S1 |
| §6 Edge Type Constraints | S4, S5 |
| §7 Lifecycle State Machine | R1 |
| §8.6 Illegal State Transitions | R1, R3 |
| §8.7 Acquisition Constraints | R6 |
| §8.8 Resource Arbitration | S7 |
| §11 Scheduler Invariants | Cross-cutting |

### 13.2 Canonical Source

The authoritative validation rule set is:

- **Static rules S1–S10**: [`VALIDATOR_SPEC.md §3`](./VALIDATOR_SPEC.md)
- **Runtime rules R1–R10**: [`VALIDATOR_SPEC.md §4`](./VALIDATOR_SPEC.md)
- **Failure event model**: [`VALIDATOR_SPEC.md §2.3`](./VALIDATOR_SPEC.md)
- **Severity dispatch**: [`VALIDATOR_SPEC.md §4.4`](./VALIDATOR_SPEC.md)

### 13.3 Integration

- Lowering pass calls `validate_static(graph)` before freeze (see [`LOWERING_PASS.md §5.10`](./LOWERING_PASS.md))
- Scheduler calls `validate_runtime(event, node, state)` inside tick loop (see [`DISTRIBUTED_SCHEDULER.md §10`](./DISTRIBUTED_SCHEDULER.md))

### 12.5 Distributed Execution Readiness

The ExecutionGraph is a directed acyclic graph with no hidden dependencies. Any subgraph with all its dependencies satisfied MAY be dispatched to a remote scheduler instance. The event stream SHALL remain the single causal trace regardless of execution topology.
