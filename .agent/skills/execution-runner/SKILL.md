---
name: execution-runner
phase: execution
status: implemented
---

# Execution Runner Skill

## Purpose
The dispatch + observation sub-cycle within the scheduler tick. Invokes executors for BOUND nodes, collects runtime events, and feeds them back to the scheduler for state transitions.

This skill is called by the scheduler during each tick. It has no independent authority to transition node states.

## References
- [Schema: Execution Graph Schema v2 §8.6–8.7](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Runtime: Phase 2 Execution Runtime v2 §5](../docs/PHASE2_EXECUTION_RUNTIME.md)
- [Event Grammar v2 §3.2](../docs/EVENT_GRAMMAR.md)

## Input
- `nodes: ExecutionNode[]` — subset of nodes in `BOUND` state
- `ExecutorRegistry` — runtime instances for each bound executor
- `WorkspaceContext` — target paths, artifact directories

## Output
- Execution nodes dispatched (BOUND → RUNNING)
- Runtime events emitted to scheduler event queue
- Intermediate artifacts persisted

## Execution

### Step 1: Dispatch each node
For every BOUND node received from the scheduler:

```
dispatch(node):
    node.lifecycle_state = RUNNING
    emit: NodeExecutionStarted {
        execution_node_id: node.id,
        executor_id: node.bound_execution.executor_id,
        timestamp
    }

    handle = executor_registry.start(
        executor_id: node.bound_execution.executor_id,
        inputs: node.inputs,
        context: WorkspaceContext
    )
```

The executor `start` call is non-blocking. It returns immediately with an execution handle.

### Step 2: Collect runtime events
Executors emit events asynchronously. The runner collects these and places them on the scheduler's RuntimeEvents queue:

| Event | Payload | Collect action |
|---|---|---|
| `ExecutionHeartbeat` | `{ node_id, timestamp, status }` | Forward to scheduler queue |
| `ExecutionProgressed` | `{ node_id, progress_pct, partial_output_ref }` | Forward to scheduler queue |
| `ExecutionOutputProduced` | `{ node_id, output_path, output_type }` | Persist output, forward event |
| `ExecutionSucceeded` | `{ node_id, outputs }` | Persist outputs, forward event |
| `ExecutionFailed` | `{ node_id, error, error_class }` | Forward event |

### Step 3: Persist intermediate outputs
On `ExecutionOutputProduced`:

```
output_path = ".pipeline/RESPONSE_RECORDS/{node_id}/intermediate/{sequence}.json"
write(output_path, output_data)
node.artifact_refs.append(output_path)
```

### Step 4: Persist final outputs
On `ExecutionSucceeded`:

```
output_path = ".pipeline/RESPONSE_RECORDS/{node_id}.json"
write(output_path, node.outputs)
node.artifact_refs.append(output_path)
emit: ArtifactPersisted {
    execution_node_id: node.id,
    artifact_path: output_path,
    artifact_type: "response_record"
}
```

### Step 5: Return to scheduler
Return all collected runtime events to the scheduler's event queue. The scheduler processes these in the next tick's update_node_states phase.

## Executor Contract

Executors called by this skill MUST:

- Accept `(inputs: dict, context: WorkspaceContext) → execution_handle`
- Emit runtime events during execution
- Signal completion via `ExecutionSucceeded` or `ExecutionFailed`
- NOT modify the graph or scheduling state
- NOT acquire resources directly (scheduler grants all locks)

## Constraints
- MUST NOT transition node lifecycle states (scheduler sole authority)
- MUST NOT modify graph topology
- MUST NOT fabricate event data
- Events MUST be referential — no duplication of full artifact payloads in event bodies
- Every artifact MUST be traceable to its originating ExecutionNode
