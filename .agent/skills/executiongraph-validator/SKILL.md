---
name: executiongraph-validator
phase: cross-cutting (static pre-freeze + runtime in-scheduler)
status: specification
---

# ExecutionGraph Validator Skill

## Purpose

Dual-lane validator ensuring ExecutionGraph structural correctness (static, pre-freeze) and behavioral correctness (runtime, in-scheduler). Validation is hard gating logic — not advisory.

## References

- [Spec: Validator v1](../docs/VALIDATOR_SPEC.md)
- [Schema: Execution Graph Schema v3](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Spec: Lowering Pass](../docs/LOWERING_PASS.md)
- [Spec: Distributed Scheduler](../docs/DISTRIBUTED_SCHEDULER.md)
- [Failure Semantics](../skills/requirements-capture/FAILURE_SEMANTICS.md)
- [Event Grammar v2](../docs/EVENT_GRAMMAR.md)

## Input

- `graph: ExecutionGraph` — for static validation
- `node: ExecutionNode` — for runtime validation
- `event: Event` — for runtime validation
- `runtime_state: RuntimeState` — for runtime validation

## Output

- `violations: list<ValidationFailure>` — possibly empty

## Constraints

- MUST NOT mutate graph topology
- MUST NOT transition node states
- MUST NOT emit events directly (returns violations, caller decides action)
- MUST be deterministic — same inputs → same violations
- MUST be replay-independent — validation events do not affect replay

## Module Structure

```
validator/
  authority/
    layer_order_rules.rs       (AEI1)
    forbidden_edge_rules.rs    (AEI2)
    state_identity_rules.rs    (AEI3)
    exception_routing_rules.rs (AEI4)

  static/
    node_rules.rs
    edge_rules.rs
    control_rules.rs
    expansion_rules.rs

  runtime/
    state_machine.rs
    distributed_rules.rs
    dependency_rules.rs
    event_consistency.rs

  shared/
    error_types.rs
    rule_traits.rs
```

## Execution

### Entry Point: validate_authority

Pre-lowering existence gate. Runs after `mode-router` resolves `ExecutionState`, before the lowering pass begins. Validates system component topology, not ExecutionGraph structure.

```
function validate_authority(system: SystemContext) → list<ValidationFailure>:
    violations = []

    // Authority edge invariants (AEI1–AEI4)
    violations.extend(check_layer_ordering(system))          // AEI1
    violations.extend(check_forbidden_edges(system))          // AEI2
    violations.extend(check_state_identity(system))           // AEI3
    violations.extend(check_exception_routing(system))        // AEI4

    return violations
```

Precondition:
- `normalize-intent` has produced canonical `ExecutionState`
- `mode-router` has selected the execution pipeline
- System component graph is available

Postcondition:
- FATAL violation → ABORT, no lowering, no ExecutionGraph
- No violations → lowering is permitted to begin

### Entry Point: validate_static

```
function validate_static(graph: ExecutionGraph) → list<ValidationFailure>:
    violations = []

    // Static node rules (S1-S3, S8, S10)
    violations.extend(check_node_types(graph))         // S1
    violations.extend(check_executor_binding(graph))    // S2
    violations.extend(check_work_request_refs(graph))   // S3
    violations.extend(check_single_root(graph))         // S8
    violations.extend(check_node_expansion(graph))      // S10

    // Static edge rules (S4-S5)
    violations.extend(check_edge_closure(graph))        // S4
    violations.extend(check_acyclic(graph))             // S5

    // Static control rules (S6)
    violations.extend(check_control_semantics(graph))   // S6

    // Static expansion rules (S7, S9)
    violations.extend(check_resource_binding(graph))    // S7
    violations.extend(check_frozen_topology(graph))     // S9

    return violations
```

### Entry Point: validate_runtime

```
function validate_runtime(
    node: ExecutionNode,
    graph: ExecutionGraph,
    event: Event,
    runtime_state: RuntimeState
) → list<ValidationFailure>:
    violations = []

    // Runtime state machine rules (R1, R7)
    violations.extend(check_state_transition(node, event))    // R1
    violations.extend(check_event_state_consistency(node, event))  // R7

    // Runtime distributed rules (R2, R3, R8)
    violations.extend(check_claim_ownership(node, event))     // R2
    violations.extend(check_lease_validity(node, runtime_state))  // R3
    violations.extend(check_double_claim(event, runtime_state))   // R8

    // Runtime dependency rules (R5)
    violations.extend(check_dependency_readiness(node, graph)) // R5

    // Runtime event consistency rules (R6, R9, R10)
    violations.extend(check_executor_registry(node, runtime_state))  // R6
    violations.extend(check_failure_node_integrity(node, graph, runtime_state))  // R9
    violations.extend(check_control_execution(node, runtime_state))  // R10

    return violations
```

### Rule Implementations

#### Authority — Layer Ordering (AEI1)

```
LAYERS = {
    "control_plane":  0,
    "routing":        1,
    "execution":      2,
    "domain":         3,
    "observation":    4
}

function check_layer_ordering(system):
    violations = []
    for ref in system.component_references:
        source_layer = LAYERS[ref.source.layer]
        target_layer = LAYERS[ref.target.layer]
        if source_layer > target_layer:
            violations.push(ValidationFailure {
                phase: STATIC,
                rule_id: "AEI1",
                severity: FATAL,
                message: "Layer {ref.source.layer} ({ref.source}) references layer {ref.target.layer} ({ref.target}) — violates downward-only flow"
            })
    return violations
```

#### Authority — Forbidden Edge Patterns (AEI2)

```
DOMAIN_LAYER = {"requirements-capture", "peb-*", "execution-binding"}
ROUTING_LAYER = {"mode-router"}
CONTROL_PLANE_LAYER = {"normalize-intent", "pipeline-intent"}
EXECUTION_LAYER = {"execution-scheduler", "execution-runner", "execution-lowering"}
OBSERVATION_LAYER = {"event-replay", "observation-engine"}
EXCEPTION_LAYER = {"peb-exception-router", "failure-semantics"}

function check_forbidden_edges(system):
    violations = []
    for ref in system.component_references:
        // F1: domain → routing
        if ref.source in DOMAIN_LAYER and ref.target in ROUTING_LAYER:
            violations.push(fatal("AEI2/F1", ref))
        // F2: domain → control plane
        if ref.source in DOMAIN_LAYER and ref.target in CONTROL_PLANE_LAYER:
            violations.push(fatal("AEI2/F2", ref))
        // F3: execution → routing
        if ref.source in EXECUTION_LAYER and ref.target in ROUTING_LAYER:
            violations.push(fatal("AEI2/F3", ref))
        // F4: observation → any upstream (L0-L3)
        if ref.source in OBSERVATION_LAYER and ref.target in (DOMAIN_LAYER ∪ EXECUTION_LAYER ∪ ROUTING_LAYER ∪ CONTROL_PLANE_LAYER):
            violations.push(fatal("AEI2/F4", ref))
        // F5: exception → control plane
        if ref.source in EXCEPTION_LAYER and ref.target in CONTROL_PLANE_LAYER:
            violations.push(fatal("AEI2/F5", ref))
    return violations
```

#### Authority — State Identity (AEI3)

```
LAYER_TERMS = {
    "ExecutionState":      "control_plane",
    "RuntimeSnapshot":     "replay",
    "ReconstructedState":  "observation",
    "ExecutionFrame":      "kernel"
}

function check_state_identity(system):
    violations = []
    for term, owner_layer in LAYER_TERMS:
        usages = system.find_term_usages(term)
        for usage in usages:
            if usage.layer != owner_layer:
                violations.push(ValidationFailure {
                    phase: STATIC,
                    rule_id: "AEI3",
                    severity: FATAL,
                    message: "Term '{term}' used in {usage.layer} layer but owned by {owner_layer}"
                })
    return violations
```

#### Authority — Exception Routing Guard (AEI4)

```
function check_exception_routing(system):
    violations = []
    for ref in system.component_references:
        if ref.source == "peb-exception-router" and ref.target == "mode-router":
            violations.push(ValidationFailure {
                phase: STATIC,
                rule_id: "AEI4",
                severity: FATAL,
                message: "peb-exception-router → mode-router is a severed feedback edge. Exceptions are data, not control signals."
            })
    return violations
```

#### Static — Node Rules

```
function check_node_types(graph):
    violations = []
    for node in graph.nodes:
        if node.type not in {TaskNode, ControlNode, ResourceNode,
                             ObservationNode, SystemNode, FailureNode}:
            violations.push(ValidationFailure {
                phase: STATIC,
                rule_id: "S1",
                severity: FATAL,
                target: { graph_id: graph.id, node_id: node.id },
                message: "Invalid node type: {node.type}"
            })
    return violations

function check_executor_binding(graph):
    violations = []
    for node in graph.nodes:
        if node.type == TaskNode and node.executor_selection == null:
            violations.push(ValidationFailure {
                phase: STATIC,
                rule_id: "S2",
                severity: FATAL,
                target: { graph_id: graph.id, node_id: node.id },
                message: "TaskNode missing executor binding"
            })
    return violations

function check_work_request_refs(graph):
    violations = []
    for node in graph.nodes:
        if node.work_request_id not in WorkRequestGraph.work_requests:
            violations.push(ValidationFailure {
                phase: STATIC,
                rule_id: "S3",
                severity: FATAL,
                target: { graph_id: graph.id, node_id: node.id },
                message: "Orphan node: no matching WorkRequest"
            })
    return violations

function check_single_root(graph):
    if len(graph.roots) != 1:
        return [ValidationFailure {
            phase: STATIC,
            rule_id: "S8",
            severity: FATAL,
            target: { graph_id: graph.id },
            message: "Graph has {len(graph.roots)} roots, expected 1"
        }]
    return []
```

#### Static — Edge Rules

```
function check_edge_closure(graph):
    violations = []
    for edge in graph.edges:
        if edge.source not in graph.nodes:
            violations.push(ValidationFailure {
                phase: STATIC, rule_id: "S4", severity: FATAL,
                target: { graph_id: graph.id, edge_id: edge.id },
                message: "Edge source not in graph"
            })
        if edge.target not in graph.nodes:
            violations.push(ValidationFailure {
                phase: STATIC, rule_id: "S4", severity: FATAL,
                target: { graph_id: graph.id, edge_id: edge.id },
                message: "Edge target not in graph"
            })
    return violations

function check_acyclic(graph):
    visited = set()
    recursion_stack = set()

    function has_cycle(node_id):
        visited.add(node_id)
        recursion_stack.add(node_id)
        for edge in graph.edges where edge.source == node_id:
            if edge.target not in visited:
                if has_cycle(edge.target):
                    return true
            elif edge.target in recursion_stack:
                return true
        recursion_stack.remove(node_id)
        return false

    for root in graph.roots:
        if has_cycle(root.id):
            return [ValidationFailure {
                phase: STATIC, rule_id: "S5", severity: FATAL,
                target: { graph_id: graph.id },
                message: "Cycle detected in dependency graph"
            }]
    return []
```

#### Static — Control Rules

```
function check_control_semantics(graph):
    violations = []
    for node in graph.nodes where node.type == ControlNode:
        outgoing = [e for e in graph.edges where e.source == node.id]
        incoming = [e for e in graph.edges where e.target == node.id]
        match node.control_type:
            case "Fork":
                if len(outgoing) < 2:
                    violations.push(failure("S6", ERROR, node.id,
                        "Fork requires ≥2 outgoing edges"))
            case "Join":
                if len(incoming) < 2:
                    violations.push(failure("S6", ERROR, node.id,
                        "Join requires ≥2 incoming edges"))
            case "Decision":
                if len(outgoing) != 2:
                    violations.push(failure("S6", ERROR, node.id,
                        "Decision requires exactly 2 outgoing edges"))
            case "Merge":
                if len(incoming) < 2:
                    violations.push(failure("S6", ERROR, node.id,
                        "Merge requires ≥2 incoming edges"))
            case "Sequence":
                if len(outgoing) != 1 or len(incoming) != 1:
                    violations.push(failure("S6", ERROR, node.id,
                        "Sequence must be linear chain"))
    return violations
```

#### Static — Expansion Rules

```
function check_resource_binding(graph):
    violations = []
    for node in graph.nodes where node.type == ResourceNode:
        executor = ExecutorRegistry[node.executor_selection.executor_id]
        if executor.type != "resource_provider":
            violations.push(ValidationFailure {
                phase: STATIC, rule_id: "S7", severity: FATAL,
                target: { graph_id: graph.id, node_id: node.id },
                message: "ResourceNode executor is not a resource provider"
            })
    return violations

function check_frozen_topology(graph):
    if graph.mutability != true:
        return [ValidationFailure {
            phase: STATIC, rule_id: "S9", severity: FATAL,
            target: { graph_id: graph.id },
            message: "Graph already frozen before validation"
        }]
    return []

function check_node_expansion(graph):
    work_requests = set(n.work_request_id for n in graph.nodes)
    violations = []
    for wr_id in work_requests:
        nodes_for_wr = [n for n in graph.nodes where n.work_request_id == wr_id]
        phases = set(n.internal_phase for n in nodes_for_wr)
        if phases != {"prepare", "execute", "finalize"}:
            violations.push(ValidationFailure {
                phase: STATIC, rule_id: "S10", severity: FATAL,
                target: { graph_id: graph.id },
                message: "WorkRequest {wr_id} missing one of [prepare, execute, finalize]"
            })
    return violations
```

#### Runtime — State Machine Rules

```
function check_state_transition(node, event):
    allowed = {
        pending:    {READY},
        READY:      {CLAIMED, SKIPPED},
        CLAIMED:    {BOUND, READY},          // READY on lease expiry
        BOUND:      {RUNNING},
        RUNNING:    {SUCCEEDED, FAILED, SKIPPED, BLOCKED},
        FAILED:     {READY},                 // retry
        SUCCEEDED:  {},
        SKIPPED:    {},
        BLOCKED:    {}
    }
    event_state = derive_target_state(event)
    if event_state not in allowed[node.lifecycle_state]:
        return [ValidationFailure {
            phase: RUNTIME, rule_id: "R1", severity: FATAL,
            target: { node_id: node.id },
            message: "Illegal transition: {node.lifecycle_state} → {event_state}"
        }]
    return []

function check_event_state_consistency(node, event):
    expected_state = {
        NodeExecutionStarted:  RUNNING,
        ExecutionSucceeded:    SUCCEEDED,
        ExecutionFailed:       FAILED,
        NodeSkipped:           SKIPPED,
        NodeBlocked:           BLOCKED
    }
    if event.type in expected_state:
        if node.lifecycle_state != expected_state[event.type]:
            return [ValidationFailure {
                phase: RUNTIME, rule_id: "R7", severity: FATAL,
                target: { node_id: node.id },
                message: "Event {event.type} but node state is {node.lifecycle_state}"
            }]
    return []
```

#### Runtime — Distributed Rules

```
function check_claim_ownership(node, event):
    if event.type == NodeClaimed and node.lifecycle_state == CLAIMED:
        if node.claim.host_id != event.host_id:
            return [ValidationFailure {
                phase: RUNTIME, rule_id: "R2", severity: FATAL,
                target: { node_id: node.id },
                message: "Claim owner mismatch: {node.claim.host_id} vs {event.host_id}"
            }]
    return []

function check_lease_validity(node, runtime_state):
    if node.lifecycle_state == CLAIMED and node.claim != null:
        if runtime_state.now > node.claim.timestamp + node.claim.lease_duration:
            return [ValidationFailure {
                phase: RUNTIME, rule_id: "R3", severity: ERROR,
                target: { node_id: node.id },
                message: "Lease expired for node {node.id}"
            }]
    return []

function check_double_claim(event, runtime_state):
    if event.type == NodeClaimed:
        active_claims = [c for c in runtime_state.leases.values()
                        where c.node_id == event.node_id and not c.expired]
        if len(active_claims) > 0:
            return [ValidationFailure {
                phase: RUNTIME, rule_id: "R8", severity: ERROR,
                target: { node_id: event.node_id },
                message: "Double claim detected for {event.node_id}"
            }]
    return []
```

#### Runtime — Dependency Rules

```
function check_dependency_readiness(node, graph):
    if event.type == NodeExecutionStarted or lifecycle_change_to(RUNNING):
        unsatisfied = []
        for dep_id in node.dependencies:
            dep_node = graph.nodes[dep_id]
            if dep_node.lifecycle_state not in {SUCCEEDED, SKIPPED}:
                unsatisfied.append(dep_id)
        if unsatisfied:
            return [ValidationFailure {
                phase: RUNTIME, rule_id: "R5", severity: ERROR,
                target: { node_id: node.id },
                message: "Unsatisfied dependencies: {unsatisfied}"
            }]
    return []
```

#### Runtime — Event Consistency Rules

```
function check_executor_registry(node, runtime_state):
    if event.type == ExecutionBound:
        if node.executor_selection.executor_id not in runtime_state.executor_registry:
            return [ValidationFailure {
                phase: RUNTIME, rule_id: "R6", severity: FATAL,
                target: { node_id: node.id },
                message: "Executor {node.executor_selection.executor_id} not in registry"
            }]
    return []

function check_failure_node_integrity(node, graph, runtime_state):
    if node.lifecycle_state == FAILED:
        has_failure_node = any(n.type == FailureNode and n.work_request_id == node.work_request_id
                              for n in graph.nodes)
        if not has_failure_node:
            return [ValidationFailure {
                phase: RUNTIME, rule_id: "R9", severity: FATAL,
                target: { node_id: node.id },
                message: "Node FAILED but no FailureNode found"
            }]
    return []

function check_control_execution(node, runtime_state):
    if node.type == ControlNode:
        active_successors = count_active_successors(node, runtime_state)
        match node.control_type:
            case "Sequence":
                if active_successors > 1:
                    return [failure("R10", ERROR, node.id,
                        "Sequence: multiple active successors")]
            case "Conditional":
                if active_successors != 1:
                    return [failure("R10", ERROR, node.id,
                        "Conditional: expected exactly 1 active branch")]
            case "Parallel":
                // all branches eligible — no constraint violation
            case "Loop":
                // predicate determines continuation — no constraint violation
    return []
```

### Severity Dispatch

Validators return violations. The caller (lowering adapter or scheduler adapter) applies severity rules:

```
function dispatch_violations(violations, context):
    for v in violations:
        emit_validation_failure_event(v)

    fatals = [v for v in violations where v.severity == FATAL]
    errors = [v for v in violations where v.severity == ERROR]

    if context == STATIC:
        if len(fatals) > 0 or len(errors) > 0:
            ABORT  // no ExecutionGraph produced
        // warnings only → proceed to freeze

    if context == RUNTIME:
        for v in fatals:
            if v.target.node_id != null and v.target.node_id in active_nodes:
                materialize_failure_node(v.target.node_id)
            // else: ValidationFailure only, no AST mutation
        for v in errors:
            block_transition(v.target.node_id)
        // warnings → continue
```

## Validation

| Check | Failure |
|---|---|
| Graph is DAG | Static FATAL |
| All nodes have valid types | Static FATAL |
| All TaskNodes have executor bindings | Static FATAL |
| Single root exists | Static FATAL |
| All expansion contracts satisfied | Static FATAL |
| State transitions follow allowed matrix | Runtime FATAL |
| Claim ownership matches event origin | Runtime FATAL |
| Lease has not expired | Runtime ERROR |
| No concurrent RUNNING instances | Runtime FATAL |
| Dependencies satisfied before execution | Runtime ERROR |
| Executor exists in registry | Runtime FATAL |
| Events match current node state | Runtime FATAL |
| FailureNode exists for every FAILED node | Runtime FATAL |

## Error Handling

| Error | Response |
|---|---|
| Graph not provided to static validator | Return empty violations, caller error |
| Event missing for runtime validation | Skip event-dependent rules |
| Executor registry unavailable | Return EXECUTOR_NOT_FOUND violations |
| Runtime state incomplete | Skip dependent rules, log warning |
| Validator internal error | Return FATAL ValidationFailure |

## Adapters

### Lowering Adapter (in execution-lowering)

```
Step 7: Assemble graph
  → validate_static(graph)
  → if FATAL or ERROR: ABORT
  → if WARN only: log and continue
Step 8: Freeze graph
```

### Scheduler Adapter (in execution-scheduler)

```
Tick: observe → validate_runtime(event, node, state) → commit
  → FATAL + node context: materialize FailureNode
  → FATAL + no node context: emit ValidationFailure only
  → ERROR: block transition
  → WARN: log
  → empty: commit
```
