>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: execution-lowering
phase: lowering
status: implemented
---

# Execution Lowering Skill

## Purpose
Transforms a validated WorkRequestGraph into a frozen ExecutionGraph. This is Phase 1.5 of the compiler — the formal lowering pass between intent IR and runtime AST.

Lowering is deterministic, stateless, and produces no side effects beyond event emission and the ExecutionGraph artifact.

## References
- [Spec: Lowering Pass v1](../docs/LOWERING_PASS.md)
- [Schema: Execution Graph Schema v2](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Event Grammar v2 §3.2](../docs/EVENT_GRAMMAR.md)
- [Validator: ExecutionGraph Validator v1](../docs/VALIDATOR_SPEC.md)

## Input
- `WorkRequestGraph` — validated IR from Phase 1
- `ExecutorRegistry` — available executor manifest
- `ResourceProfileRegistry` — resource cost models

## Output
- `ExecutionGraph` — frozen AST, all nodes in `pending` state, executors selected, dependencies projected

## Execution

### Step 0: Validate input
Precondition checks. If any fails, emit `LoweringError` and halt.

| Check | Failure |
|---|---|
| Graph is acyclic | Report cycle path, halt |
| All dependency targets exist | Report dangling ref, halt |
| Every `capability` is recognized | Report unknown capability, halt |
| Every `inputs` spec is satisfiable | Report missing fields, halt |

```
validate(wrGraph):
    assert isAcyclic(wrGraph.dependencies)
    assert all refs resolve(wrGraph.dependencies, wrGraph.workRequests)
    assert all capabilities known(wrGraph.workRequests, ExecutorRegistry)
    assert all inputs satisfiable(wrGraph.workRequests)
```

### Step 1: Select executors
For each WorkRequest, call `executor-binding` skill's `select()` entry point:

```
for each WR in wrGraph.workRequests:
    selection = executor_binding.select(WR.capability, WR.inputs)
    emit: ExecutorSelected {
        work_request_id: WR.id,
        executor_id: selection.executorId,
        execution_mode: selection.executionMode
    }
```

Selection is deterministic. Ties are broken by cost model, then lexicographic.

### Step 2: Expand nodes
Each WorkRequest becomes 3 ExecutionNodes (prepare, execute, finalize):

```
for each WR in wrGraph.workRequests:
    prepare = ExecutionNode {
        id: generateId(WR.id, "prepare"),
        workRequestRef: WR.id,
        internal_phase: "prepare",
        executor_selection: selection,
        lifecycle_state: "pending",
        inputs: WR.inputs,
        scheduling_hints: empty
    }

    execute = ExecutionNode {
        id: generateId(WR.id, "execute"),
        workRequestRef: WR.id,
        internal_phase: "execute",
        executor_selection: selection,
        lifecycle_state: "pending",
        inputs: WR.inputs,
        scheduling_hints: empty
    }

    finalize = ExecutionNode {
        id: generateId(WR.id, "finalize"),
        workRequestRef: WR.id,
        internal_phase: "finalize",
        executor_selection: selection,
        lifecycle_state: "pending",
        outputs: WR.outputs,
        scheduling_hints: empty
    }

    emit: ExecutionNodeGenerated {
        node_id: prepare.id,
        work_request_id: WR.id,
        internal_phase: "prepare"
    }
    emit: ExecutionNodeGenerated {
        node_id: execute.id,
        work_request_id: WR.id,
        internal_phase: "execute"
    }
    emit: ExecutionNodeGenerated {
        node_id: finalize.id,
        work_request_id: WR.id,
        internal_phase: "finalize"
    }

    // Intra-expansion edges
    execGraph.addEdge(prepare.id, execute.id, "control")
    execGraph.addEdge(execute.id, finalize.id, "control")
```

### Step 3: Project dependencies
Convert WorkRequest edges to ExecutionNode edges. Each `WR_A → WR_B` becomes `Finalize(A) → Prepare(B)`:

```
for each dep in wrGraph.dependencies:
    sourceFinalize = findNode(dep.from, "finalize")
    targetPrepare = findNode(dep.to, "prepare")

    edge = ExecutionEdge {
        from: sourceFinalize.id,
        to: targetPrepare.id,
        type: dep.type === "data" ? "data" : "control"
    }

    if dep.type === "data":
        edge.artifactRef = resolveArtifactRef(sourceFinalize)

    execGraph.addEdge(edge)
    emit: DependencyLowered {
        from_node: sourceFinalize.id,
        to_node: targetPrepare.id,
        edge_type: edge.type,
        artifact_ref: edge.artifactRef
    }
```

### Step 4: Resolve data channels
For each data dependency edge, create an explicit artifact reference:

```
Path convention: .pipeline/RESPONSE_RECORDS/{finalize_node_id}.json
```

The scheduler will write to this path when the finalize node completes.

### Step 5: Lower constraints
Convert declarative WorkRequest constraints into scheduling hints:

```
for each WR in wrGraph.workRequests:
    for each node in expandedNodes(WR):
        node.scheduling_hints = lowerConstraints(WR.constraints)
        node.retry_policy = deriveRetryPolicy(WR.constraints)
```

### Step 6: Initialize lifecycle
All nodes enter `pending` state. Graph metadata set.

```
execGraph.metadata = ExecutionMetadata {
    createdFrom: wrGraph.id,
    createdAt: now(),
    version: "1"
}

emit: ExecutionGraphCreated {
    execution_graph_id: execGraph.id,
    source_work_request_graph_id: wrGraph.id,
    node_count: execGraph.nodes.length,
    edge_count: execGraph.edges.length
}
```

### Step 7: Assemble graph
Final assembly:

```
execGraph.nodes = all expanded nodes
execGraph.edges = intra-expansion edges + projected edges
```

### Step 7.5: Static validator gate

Before freezing, validate structural soundness:

```
violations = validate_static(execGraph)
fatals_or_errors = violations.filter(v => v.severity in {ERROR, FATAL})
if fatals_or_errors.length > 0:
    emitValidationFailures(fatals_or_errors)
    ABORT  // no ExecutionGraph produced
// warnings only → proceed
```

See [`VALIDATOR_SPEC.md`](../../docs/VALIDATOR_SPEC.md) for S1–S10 rules and severity model.

### Step 8: Freeze and emit

```
execGraph.freeze()

emit: LoweringComplete {
    execution_graph_id: execGraph.id,
    node_count,
    edge_count
}
```

Return frozen `ExecutionGraph` to pipeline router.

## Validation

| Check | Step | Failure |
|---|---|---|
| Graph acyclic | 0 | Halt, LoweringError |
| Capabilities known | 0 | Halt, LoweringError |
| All WRs expanded | 2 | System error |
| Edge projection targets exist | 3 | System error |
| Node IDs unique | 7 | System error |
| Static validator (S1–S10) | 7.5 | Halt, emit ValidationFailure |

## Constraints
- MUST be deterministic — same input always produces same output
- MUST NOT execute any work
- MUST NOT transition any node out of `pending` state
- MUST emit events for every selection, expansion, and projection
- MUST freeze the graph before returning (topology immutable after lowering)
