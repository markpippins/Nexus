---
name: execution-scheduler
phase: execution
status: implemented
---

# Execution Scheduler Skill

## Definition

The Scheduler is a deterministic interpreter over the ExecutionGraph AST. It is the only authority allowed to transition node lifecycle states.

```
Scheduler := Deterministic Interpreter over ExecutionGraph AST
```

Executors perform work. The Scheduler decides when work is allowed to exist.

## References
- [Schema: Execution Graph Schema v2 §8, §8.14](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Runtime: Phase 2 Execution Runtime v2 §4](../docs/PHASE2_EXECUTION_RUNTIME.md)
- [Event Grammar v2 §3.2, §4](../docs/EVENT_GRAMMAR.md)
- [Distributed: Distributed Scheduler v1](../docs/DISTRIBUTED_SCHEDULER.md)
- [Validator: ExecutionGraph Validator v1](../docs/VALIDATOR_SPEC.md)

## Input
- `ExecutionGraph` — frozen AST from lowering pass, all nodes `pending` with `executor_selection` populated
- `ExecutorRegistry` — available executor implementations
- `ResourceRegistry` — lockable resources (files, handles, instances)
- `PolicyConfig` — retry limits, timeouts, concurrency caps
- `RuntimeEvents` — events emitted by active executors (initially empty)
- `HostConfig` — host identity, capabilities, and distributed mode flag (single-host vs multi-host)
- `EventLog` — shared append-only event log (distributed mode only)

## Output
- `ExecutionGraph` — all nodes terminal
- `EventStream` — full causal trace of every transition
- `Artifacts` — RESPONSE_RECORDS, outputs, failure nodes

## Scheduler Authority Model

The scheduler alone may:

- Transition lifecycle states
- Allocate executors
- Grant resource access
- Initiate retries
- Materialize FailureNodes

The scheduler may NOT:

- Mutate graph topology
- Modify node definitions
- Fabricate outputs

## Interpreter Model

The scheduler evaluates the ExecutionGraph as a program:

```
Program     := ExecutionGraph
Instruction := ExecutionNode
```

Execution is event-driven incremental evaluation, not sequential execution.

### Canonical Execution Loop

```
while graph.has_runnable_nodes():
    ready_nodes = evaluate_readiness(graph)

    for node in ready_nodes:
        acquire_executor(node)   # validates pre-selected executor, does NOT re-select
        dispatch(node)

    process_runtime_events()
    update_node_states()

    # Runtime validator gate — pre-commit
    for each event in current_tick_events:
        violations = validate_runtime(event, affected_node, graph, runtime_state)
        fatals = violations.filter(v => v.severity == FATAL)
        errors = violations.filter(v => v.severity == ERROR)

        for v in fatals:
            if v.target.node_id in active_nodes:
                materialize_failure_node(v.target.node_id)
            emit_validation_failure(v)

        for v in errors:
            block_transition(v.target.node_id)
            emit_validation_failure(v)
        // warnings → log and continue
```

## Execution

### Step 1: Initialize
Before the first tick:

- Verify graph is frozen (topology locked)
- Verify all nodes in `pending` state
- Verify all nodes have `executor_selection` populated (lowering pass guarantee)
- Load ExecutorRegistry and ResourceRegistry
- Initialize RuntimeEvents queue (empty)
- Initialize RetryCounters per node
- Initialize ResourceLocks: all ResourceNodes → `FREE`

### Step 2: Scheduler Tick

Each tick executes atomically:

#### 2.1 Read runtime events
Consume all events emitted by active executors since last tick.

#### 2.2 Evaluate readiness
For every node NOT in a terminal state, evaluate the formal predicate:

```
is_ready(node) :=
    deps_satisfied(node)
    AND resources_available(node)
    AND policy_allows(node)
```

**Dependency conditions:**
```
∀ incoming_control_edges:
    upstream.state == SUCCEEDED
```

**Resource conditions:**
```
required_resources available AND no conflicting locks
```

**Policy conditions:**
```
retry_limit not exceeded AND time constraints satisfied
```

If a node was previously BLOCKED and all conditions are now met, transition `BLOCKED → READY`.

#### 2.3 Claim nodes (distributed mode only)

In distributed mode, nodes require a claim before acquisition. Steps 2.4 and later proceed only for successfully claimed nodes.

For each READY node, call `distributed-coordination` to attempt a claim:

```
for each READY node:
    if host_can_execute(node, host.capabilities):
        result = distributed_coordination.claim(node, host_id, event_log)
        if result == ClaimWon:
            transition: READY → CLAIMED
            node.claim = { host_id, lease_id, lease_expiration }
            emit: NodeClaimed { node_id, host_id, lease_id, lease_expiration }
        else:
            // Claim lost — another host will execute this node
            continue
    else:
        // Host cannot execute this node — skip
        continue
```

In single-host mode, this step is skipped and `READY` transitions directly to acquisition.

#### 2.4 Acquire executors

For each CLAIMED (distributed) or READY (single-host) node, call `executor-binding`'s `acquire()` entry point. The executor was already selected by the lowering pass — the scheduler only validates runtime availability.

```
for each eligible node:
    result = executor_binding.acquire(node)
    if result.success:
        node.bound_execution = result.bound_execution
        transition: CLAIMED|READY → BOUND
        emit: ExecutionBound { node_id, executor_id, capability_contract }
        if node.lifecycle_state == CLAIMED:
            emit: NodeReleased { node_id, host_id, lease_id, reason: "acquired" }
    else if result.terminal:
        transition: CLAIMED|READY → FAILED
        emit: ExecutionFailed { node_id, error: result.error, terminal: true }
        materialize FailureNode
    else:
        // retryable (e.g., executor busy)
        transition: CLAIMED|READY → FAILED → READY
        emit: ExecutionFailed { node_id, error: result.error, terminal: false }
        emit: RetryEvent { node_id }
```

#### 2.5 Dispatch work
For each BOUND node, transfer execution authority to its executor:

```
BOUND → RUNNING
emit: NodeExecutionStarted { node_id, executor_id }
executor.start(node.inputs, workspace_context)
```

Dispatch is asynchronous. The scheduler does not wait.

#### 2.5 Process runtime events
Executors emit runtime events. The scheduler handles each:

| Event | Handler |
|---|---|
| `ExecutionHeartbeat` | Record timestamp, no state change |
| `ExecutionProgressed` | Record progress, no state change |
| `ExecutionOutputProduced` | Persist intermediate output, no state change |
| `ExecutionSucceeded` | `RUNNING → SUCCEEDED`, release resource locks |
| `ExecutionFailed` | `RUNNING → FAILED`, evaluate retry |

#### 2.6 Update node states
Apply all pending state transitions from event processing:

**On ExecutionSucceeded:**
```
RUNNING → SUCCEEDED
emit: ExecutionSucceeded { node_id, outputs_ref }
unlock(resource, node) for all resources held by node
persist outputs to .pipeline/RESPONSE_RECORDS/{node_id}.json
```

**On ExecutionFailed:**
```
RUNNING → FAILED
emit: ExecutionFailed { node_id, error, error_class }
unlock(resource, node)
```

**Then evaluate retry:**
```
if error_class == TRANSIENT AND retry_count < max_retries:
    FAILED → READY
    emit: RetryEvent { retry_count, backoff_ms }
    wait(backoff_ms)
else:
    materialize FailureNode
    for each downstream:
        any → BLOCKED
        emit: NodeBlocked { cause: failure_node_id }
```

**Lease expiry (distributed mode):**
```
for each claimed node where now > node.claim.lease_expiration:
    if node.lifecycle_state == CLAIMED:
        transition: CLAIMED → READY
        emit: LeaseExpired { node_id, host_id, lease_id }
        node.claim = null
```

**Host crash detection (distributed mode):**
```
for each host_id where no HostHeartbeat received for LEASE_DURATION_MS * 2:
    for each node claimed by host_id:
        emit: LeaseExpired { node_id, host_id, lease_id }
        transition: CLAIMED → READY (local state)
```

### Step 3: Resource Arbitration

The scheduler owns all resource locks. No executor acquires resources directly.

```
lock(resource, node)    → RESERVED (on readiness evaluation)
acquire(resource, node) → IN_USE (on BOUND → RUNNING)
unlock(resource, node)  → FREE (on terminal transition)
```

**Guarantees:**
- No double ownership
- Deterministic allocation
- Deadlock avoidance enforced

### Step 4: Control Node Interpretation

#### SEQUENCE
Enable next child only after predecessor SUCCEEDED.

```
On child[i] SUCCEEDED:
    child[i+1].dependencies satisfied → mark READY
```

#### PARALLEL
Enable all children simultaneously.

```
On PARALLEL node activated:
    ∀ child ∈ children: child.dependencies satisfied → mark READY
```

#### CONDITIONAL
Evaluate predicate → activate exactly one branch.

```
branch = evaluate(predicate, node.inputs)
activate(branch) → mark branch root READY
```

#### LOOP
Reinsert child into READY after completion until predicate false.

```
On child SUCCEEDED:
    if evaluate(loop_predicate, child.outputs):
        reinsert child as READY
    else:
        loop node SUCCEEDED
```

### Step 5: Completion Detection

After every tick, evaluate:

```
ExecutionGraph.is_finished() ⇔
    ∀ node ∈ ExecutionGraph.Nodes:
        node.lifecycle_state ∈ TERMINAL_STATES
```

**Terminal states:**
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

Write summary to `.pipeline/EXECUTIONS/run-summary.json`.

## Tick Properties

| Property | Rule |
|---|---|
| **Atomic** | All transitions in a tick are committed together or not at all |
| **Idempotent** | Replaying the same tick with same inputs produces identical results |
| **Replayable** | Every tick is fully determined by the event history |

## Concurrency Model

The scheduler is **logically single-threaded**.

Implementation MAY be parallel, but observable behavior MUST equal:

```
serial deterministic interpreter
```

No randomness allowed inside scheduling decisions.

## Replay Semantics

The scheduler must support:

```
replay(events) → reconstructed_state
```

**Rules:**
- State is derivable from event history
- Scheduler is stateless under replay — all state is reconstructed from events
- Given the same event stream, replay MUST produce identical final state

## Validation

| Check | Tick phase | Failure behavior |
|---|---|---|---|
| Graph is frozen | Init | Halt, emit SystemError |
| All nodes in pending | Init | Reject graph |
| All nodes have executor_selection | Init | Reject graph (lowering invariant violated) |
| Claim conflict resolved deterministically | Claim | First NodeClaimed in event log wins |
| No executor acquisition failure | Acquire | Materialize FailureNode |
| Lease expiry handled | Update | CLAIMED → READY |
| No resource deadlock | Readiness | Halt, emit DeadlockDetected |
| Runtime validator (R1–R10) | Pre-commit | Block transition or inject FailureNode |
| Tick commits atomically | Commit | Rollback, emit SystemError |

## Error Handling

| Error | Response |
|---|---|---|
| Executor acquisition failure (terminal) | Materialize FailureNode, propagate BLOCKED |
| Executor acquisition failure (retryable) | Transition FAILED → READY, retry with backoff |
| Claim conflict lost | Skip node, continue to next ready node |
| Lease expired before bound | Re-attempt claim (with backoff) |
| Host crash detected | Emit LeaseExpired, transition CLAIMED → READY |
| Resource deadlock detected | Halt scheduler, emit DeadlockDetected |
| Executor crash (no events) | Treat as TRANSIENT failure, retry |
| Illegal state transition detected | Terminate scheduler, emit SystemError |
| Event persistence failure | Retry with backoff, emit SystemError if exhausted |

## Scheduler Invariants

1. **Topology Immutability** — Graph structure never changes after freezing
2. **Single Authority** — Only scheduler transitions node states
3. **Observable Execution** — Every transition emits an event
4. **Executor Isolation** — Executors cannot affect scheduling
5. **Causal Traceability** — Every node state change has a parent cause

## Constraints
- MUST NOT mutate graph topology
- MUST NOT modify node definitions
- MUST NOT fabricate outputs
- MUST NOT re-select executors (lowering selects, scheduler acquires)
- MUST NOT claim nodes whose executor_selection is not in host capabilities
- MUST emit events for every state transition
- MUST produce deterministic schedules given identical graphs and policies
- MUST honor all edge types (DataDependency, ControlDependency, ResourceDependency)
