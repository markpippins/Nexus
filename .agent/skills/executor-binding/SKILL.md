>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: executor-binding
phase: execution
status: implemented
---

# Executor Binding Skill

## Purpose
Provides two distinct operations:

1. **`select()`** — called by the lowering pass (Phase 1.5) to choose an executor for a WorkRequest by capability matching
2. **`acquire()`** — called by the scheduler (Phase 2) to confirm runtime availability of the selected executor and produce a BoundExecution

This separation reflects the compiler architecture: lowering selects, scheduler acquires.

## References
- [Spec: Lowering Pass v1 §5.3](../docs/LOWERING_PASS.md)
- [Schema: Execution Graph Schema v2 §8.5, §8.14](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Runtime: Phase 2 Execution Runtime v2 §5](../docs/PHASE2_EXECUTION_RUNTIME.md)
- [Distributed: Distributed Scheduler v1 §8](../docs/DISTRIBUTED_SCHEDULER.md)

## Input
- `ExecutorRegistry` — available executor manifest
- `node: ExecutionNode` — with `executor_selection` populated (for acquire) or `capability` (for select)

## Output
- `select()` → `ExecutorSelection { executorId, executionMode, resourceProfile }`
- `acquire()` → `BoundExecution { node_id, executor_id, runtime_handle, capability_contract }`

---

## Entry Point 1: select() — Called by Lowering

### Purpose
Given a WorkRequest's capability requirement, select the best matching executor from the registry.

### Execution
```
candidates = { e ∈ ExecutorRegistry | e.capabilities ⊇ WR.capability }
```

| Candidates | Action |
|---|---|
| 0 | Return error — lowering halts |
| 1 | Select directly |
| 2+ | Apply tiebreakers: cost model ↓, concurrency efficiency ↑, lexicographic |

### Output
```json
{
  "executorId": "euclidean-generator-v3",
  "executionMode": "sync",
  "resourceProfile": { "gpu": false, "memory_mb": 512 }
}
```

### Constraints
- MUST be deterministic — same capability + same registry → same selection
- MUST NOT access runtime state (concurrency, availability)
- Selection is static — it does not check whether the executor is currently available

---

## Utility: host_can_execute() — Called by Distributed Scheduler

### Purpose
Determines whether a given host can execute a node based on the node's `executor_selection` and the host's capabilities. Used by the distributed scheduler to filter candidate nodes before the claim protocol.

### Execution
```
host_can_execute(node, host_capabilities) ⇔
    node.executor_selection.executorId ∈ host_capabilities
```

### Usage in distributed mode
```
for node in ready_nodes:
    if host_can_execute(node, host.capabilities):
        claim(node)
```

If `host_can_execute` returns `false`, the host ignores the node. No routing layer is required — hosts self-select work.

---

## Entry Point 2: acquire() — Called by Scheduler

### Purpose
Given a READY node with a pre-populated `executor_selection`, confirm that the selected executor is available at runtime and produce a BoundExecution with a runtime handle.

### Execution
```
selection = node.executor_selection
executor = registry.find(selection.executorId)

if executor is None:
    // Selected executor no longer exists — system error
    return AcquisitionFailure { terminal: true, error: "executor_not_found" }

if executor.concurrency_slots_available() == 0:
    // Executor exists but busy — retryable
    return AcquisitionFailure { terminal: false, error: "executor_busy" }

handle = executor.acquire()
```

### Output
```json
{
  "node_id": "EX-003",
  "executor_id": "euclidean-generator-v3",
  "runtime_handle": "handle-abc123",
  "capability_contract": {
    "inputs_schema": { "pattern": "string", "steps": "int" },
    "outputs_schema": { "pattern": "string" },
    "constraints": { "max_concurrency": 2 }
  }
}
```

### Failure Handling

| Failure | Terminal | Scheduler action |
|---|---|---|
| Executor not found | Yes | Materialize FailureNode, transition FAILED |
| Executor busy | No | Retry: FAILED → READY with backoff |
| Resource quota exceeded | Depends | Retry or fail per retry_policy |

### Constraints
- MUST NOT re-select executors — only validates the pre-selected one
- MUST NOT modify `executor_selection` (owned by lowering)
- MUST release runtime handle on node terminal transition
