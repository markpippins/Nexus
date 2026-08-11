# Nexus vision - API Reference

This document details every module, class, and method within the `vision` package.

## Module: `losm-host/losm/__init__.py`

## Module: `losm-host/losm/api/__init__.py`

## Module: `losm-host/losm/api/artifacts.py`

### Function: `list_artifacts(wr_id, db)`
### Function: `read_lineage(artifact_id, db)`
## Module: `losm-host/losm/api/branches.py`

### Function: `create_branch(wr_id, label, parent_branch_id, fork_point, db)`
### Function: `fork_branch(branch_id, label, db)`
### Function: `get_branch_info(branch_id, db)`
### Function: `list_branches(wr_id, db)`
### Function: `score_branch(branch_id, score, db)`
### Function: `merge_branch(branch_id, strategy, db)`
### Function: `discard_branch_endpoint(branch_id, db)`
### Function: `select_best_branch(wr_id, db)`
## Module: `losm-host/losm/api/receipts.py`

### Class: `ReceiptIngestResponse`

### Function: `ingest_receipt(receipt, db)`
## Module: `losm-host/losm/api/routes.py`

### Function: `get_kernel()`
### Function: `validate_graph(graph, kernel)`
## Module: `losm-host/losm/api/websocket.py`

### Function: `_handle_ws_command(msg_type, session_id, wr_id, payload, db)`
## Module: `losm-host/losm/api/work_requests.py`

### Class: `WorkRequestCreate`

### Class: `WorkRequestResponse`
- **Method**: `from_orm_with_metadata(cls, wr)`

### Function: `create_wr(payload, db)`
### Function: `read_wr(wr_id, db)`
### Function: `list_wr(skip, limit, db)`
### Function: `orchestrate_wr(wr_id, background_tasks, db)`
### Class: `TransitionRequest`

### Function: `transition_wr(wr_id, payload, db)`
### Function: `compile_plan(wr_id, plan)`
## Module: `losm-host/losm/app/__init__.py`

## Module: `losm-host/losm/app/main.py`

## Module: `losm-host/losm/config/__init__.py`

## Module: `losm-host/losm/config/settings.py`

### Function: `_env_bool(key, default)`
### Function: `_env_int(key, default)`
### Function: `get_path()`
## Module: `losm-ir/src/losm_ir/__init__.py`

## Module: `losm-ir/src/losm_ir/compiler.py`

### Function: `_now()`
### Function: `_new_id()`
### Function: `pass_normalize(raw_nodes, raw_edges)`
> Pass 1 — Normalize. Coerce raw flat work requests + edges into canonical DAG form: - Ensure every node has a wr_id - Set default fields (status=NEW, priority=5, depth=0) - Deduplicate nodes by wr_id - Remove self-referencing edges - Validate edge types

### Function: `pass_tenant_bind(nodes, envelope, tenant_id, trace_id, kernel_id)`
> Pass 2 — Tenant Binding. Resolve tenant_id, trace_id, kernel_id from: 1. The EventEnvelope (if provided) 2. Node metadata (per-node override) 3. Top-level defaults

### Function: `_build_adjacency(nodes, edges)`
> Build adjacency list (parent → children) from edges + parent_request_id.

### Function: `_compute_depth(node_id, adj, depth_cache, visited, max_depth)`
> Compute depth from root via BFS/DFS. Root nodes have depth 0.

### Function: `_find_root(nodes, adj)`
> Find the root node — a node with no incoming edges and no parent.

### Function: `pass_dag_construct(nodes, raw_edges)`
> Pass 3 — DAG Construction. Build the full WorkRequestDAG from normalized nodes and edges: - Resolve parent_request_id into edges - Compute depth for each node via DFS - Build adjacency list - Find root node

### Function: `_detect_cycles(adj)`
> DFS-based cycle detection.

### Function: `pass_structural_validate(dag)`
> Pass 4 — Structural Validation. Checks: - Cycle detection (DFS) - Orphan detection (nodes outside the root tree) - Depth constraint violation - Duplicate edge detection - Missing parent references

### Function: `pass_execution_compatibility(dag)`
> Pass 5 — Execution Compatibility. Verify all nodes have valid executor configuration: - Each node must have a known executor type or be a pure orchestration node - Orchestration nodes (status=COMPLETION) need no executor - Warn on nodes with incompatible status→executor mappings

### Function: `pass_policy_annotate(dag)`
> Pass 6 — Policy Annotation. Annotate each node with applicable governance policies: - Root nodes get 'root_governance' policy - Leaf nodes get 'leaf_optimization' policy - Nodes with BLOCKED/FAILED status get 'recovery_required' policy - Branch nodes get 'branch_tracking' policy

### Function: `compile_dag(raw_nodes, raw_edges, envelope, tenant_id, trace_id, kernel_id, stop_on_error)`
> Run all 6 compilation passes in order. Args: raw_nodes: List of flat work request dicts (must have wr_id). raw_edges: Optional list of edge dicts. envelope: Optional EventEnvelope for routing context. tenant_id, trace_id, kernel_id: Top-level scoping. stop_on_error: If True, stop at the first pass that produces errors. Returns: CompilationResult with the final DAG (or partial DAG on error).

### Function: `find_shortest_path(dag, source_wr_id, target_wr_id)`
> BFS shortest path between two nodes in the DAG.

### Function: `get_subtree(dag, root_wr_id)`
> Extract a subtree rooted at the given node.

## Module: `losm-ir/src/losm_ir/constraints.py`

### Class: `ConstraintViolation`
- **Method**: `__init__(message, witness)`

## Module: `losm-ir/src/losm_ir/critique.py`

### Class: `CritiqueIssue`

### Class: `CritiqueIR`

## Module: `losm-ir/src/losm_ir/dag.py`

### Class: `EventEnvelope`
> Wraps every DAG operation with routing context.

Fields:
    event_id: Unique ID for this envelope (UUID).
    wrp_id: The WorkRequest protocol version (e.g. "1.1").
    type: Event type — mirrors the operation being performed.
    timestamp: When the event was emitted.
    version: Event schema version.
    causation_id: ID of the event that *caused* this event.
    correlation_id: ID that groups related events into a conversation.
    tenant_id: Tenant/namespace scope for multi-tenant routing.
    trace_id: Distributed tracing trace ID.
    kernel_id: Logical kernel/execution-unit ID.


### Class: `EdgeType`
> Semantic edge types between WorkRequest nodes.


### Class: `WorkRequestNode`
> A single node in the WorkRequest DAG.

Fields:
    wr_id: UUID of this work request (mirrors WorkRequestDCO.id).
    parent_request_id: Optional parent WR UUID (direct lineage).
    intent: Human-readable intent/goal of this work request.
    status: Current operational status (from WorkStatus enum).
    priority: Numeric priority (1-10, higher = more important).
    depth: Depth from root (0 = root node).
    children: Child node WR IDs (from edges / parent refs).
    edge_type: The edge type linking this node to its parent.
    metadata: Arbitrary metadata/key-value annotations.
    compiled_properties: Properties set by the compilation pipeline.


### Class: `DAGEdge`
> An explicit edge in the WorkRequest DAG.

Stored in work_request_edges.  Edges are the canonical representation;
parent_request_id on the node is a denormalized shortcut.


### Class: `WorkRequestDAG`
> The full recursive WorkRequest DAG.

This is the top-level compiled artifact — a tree (or forest) of
WorkRequestNodes connected by explicit edges, scoped to a logical
operation via tenant_id/trace_id.

Fields:
    dag_id: Unique ID for this DAG instance.
    root_wr_id: The root work request UUID (entry point).
    nodes: All nodes keyed by wr_id.
    edges: All explicit edges.
    tenant_id: Tenant/namespace scope.
    trace_id: Distributed trace ID.
    kernel_id: Logical kernel ID.
    depth: Maximum depth from root.
    total_nodes: Total node count.
    compilation_status: Result of the last compilation run.
    compilation_errors: Errors from the last compilation run.
    compiled_at: When the DAG was last compiled.
    metadata: Arbitrary DAG-level metadata.


### Class: `CompilationPass`
> The 6 deterministic passes of the WRP v1.1 compilation pipeline.


### Class: `CompilationResult`
> Result of running a single compilation pass (or all 6).


### Class: `StructuralValidationIssue`
> An issue found during structural validation (Pass 4).


### Class: `CycleInfo`
> Cycle detection result.


### Class: `DAGPath`
> Resolved path between two nodes in the DAG.


## Module: `losm-ir/src/losm_ir/execution.py`

### Class: `ExecutionStatus`

### Class: `StepResult`

### Class: `ExecutionIR`

## Module: `losm-ir/src/losm_ir/execution_receipt.py`

### Class: `MutationRecord`

### Class: `ExecutionReceipt`

## Module: `losm-ir/src/losm_ir/executor_registry.py`

### Class: `InvocationContract`

### Class: `ExecutorRegistration`

### Class: `ExecutorRegistry`

## Module: `losm-ir/src/losm_ir/graph.py`

### Class: `Node`

### Class: `Edge`

### Class: `Graph`
- **Method**: `_equal(other)`

## Module: `losm-ir/src/losm_ir/invariant.py`

### Class: `InvariantType`

### Class: `InvariantState`

### Class: `InvariantSeverity`

### Function: `validate_lifecycle_transition(current, target)`
### Function: `lifecycle_advance_by_score(current, score)`
### Class: `Invariant`
> A single validated invariant with lifecycle state and scoring.

Fields:
    invariant_id: Unique identifier.
    name: Human-readable name.
    description: What this invariant enforces.
    invariant_type: STRUCTURAL, SEMANTIC, or GOVERNANCE.
    state: Current lifecycle state.
    score: Current validation score [0.0, 1.0].
    severity: Severity if violated.
    scope: Node IDs or system scope this invariant applies to (empty = all).
    depends_on: Other invariant IDs that must pass first.
    expression: Optional predicate expression (reserved for future use).
    validates_systems: Systems/nodes this invariant validates.
                      Used for non-circular check.
    metadata: Arbitrary metadata.


### Class: `Violation`
> A single invariant violation found during validation.


### Class: `InvariantValidationResult`
> Result of running an invariant against a DAG.


### Class: `InvariantRegistry`
> Registry of invariants with lifecycle management and scoring.

- **Method**: `register(invariant)`
- **Method**: `replace(invariant)`
- **Method**: `get_fixed_point_set()`

### Class: `InvariantEngine`
> Validates invariants against compiled WorkRequestDAGs.

Core operations:
  - validate(invariant, dag) — single invariant against DAG
  - validate_all(registry, dag) — all invariants against DAG
  - check_fixed_point(new_invariant, registry) — fixed-point constraint
  - check_non_circular(invariant) — non-circular validation

- **Method**: `validate(invariant, dag, execution_receipt)`
- **Method**: `validate_all(registry, dag, execution_receipt)`
- **Method**: `check_fixed_point(new_invariant, registry, dag)`
- **Method**: `check_non_circular(invariant, registry)`
  - Invariant cannot be validated solely by systems it modifies.
- **Method**: `_validate_structural(invariant, dag)`
- **Method**: `_validate_semantic(invariant, dag, execution_receipt)`
- **Method**: `_validate_governance(invariant, dag)`

## Module: `losm-ir/src/losm_ir/plan.py`

### Class: `ExecutionStep`

### Class: `PlanIR`

## Module: `losm-ir/src/losm_ir/spec.py`

### Class: `SpecStep`

### Class: `SpecIR`

## Module: `losm-ir/src/losm_ir/states.py`

### Class: `WorkflowState`
> IR-level / simplified lifecycle phase.

Designed for protocol contracts and high-level status reporting.
This is a *projection* of the operational WorkStatus — see
work_status_to_phase() for the mapping.


### Class: `WorkStatus`
> Canonical operational pipeline state.

This is the authoritative lifecycle enum — the DB column
(PlanningTask.status) uses it, and the transition validation table
is keyed on these values.


### Function: `work_status_to_phase(s)`
> Project an operational WorkStatus onto its lifecycle phase. This is a many-to-one compression — multiple operational states map to the same IR-level phase.

## Module: `losm-ir/src/losm_ir/trace.py`

### Class: `TraceOutput`

### Function: `trace_hash(trace)`
### Class: `TraceFamily`
- **Method**: `__init__(traces)`
- **Method**: `__eq__(other)`

## Module: `losm-ir/src/losm_ir/transition.py`

### Class: `ValidationResult`
> Immutable result of a transition validation.

Attributes:
    allowed: True if from_state->to_state is a legal transition.
    reason: Human-readable explanation when not allowed, or None.


### Function: `validate_transition(from_state, to_state)`
> Pure function. Given two states, returns whether the transition is legal. Args: from_state: The current state (must be a key in VALID_TRANSITIONS). to_state: The desired next state. Returns: ValidationResult with allowed=True/False and a reason for failures.

### Class: `TransitionError`
> Raised when a caller attempts an invalid transition.


## Module: `losm-ir/src/losm_ir/traversal.py`

### Class: `TraversalStrategy`

### Class: `ExecutionMode`

### Class: `ExecutionResult`

### Class: `ExecutionContext`
> Immutable context for a single traversal run.

All fields are fixed for the duration of the traversal.  No field
may be mutated once construction completes.

Fields:
    tenant_id: Tenant/namespace scope.
    trace_id: Distributed tracing trace ID.
    strategy: Which traversal strategy to use.
    kernel_id: Logical kernel/execution-unit ID.
    mode: Execution mode — NORMAL or EXPERIMENTAL.
          Probabilistic policies are active only in EXPERIMENTAL mode.


### Class: `HierarchicalExecutionReceipt`
> Tree-structured execution receipt.

Unlike the flat ExecutionReceipt (v1.0), this receipt forms a tree
that mirrors the DAG traversal.  Each receipt carries its children's
receipts, enabling both top-down and bottom-up analysis.

Fields:
    node_id: The WorkRequestNode ID this receipt covers.
    tenant_id: Tenant scope (from ExecutionContext).
    trace_id: Trace scope (from ExecutionContext).
    result: The execution result for this node.
    children: Child receipts (tree structure).
    status: The node's status at traversal time.
    error: Error message if result is FAILED or BLOCKED.
    started_at: When this node's traversal began.
    completed_at: When this node's traversal completed.
    metadata: Arbitrary metadata annotations.

- **Method**: `find(node_id)`
- **Method**: `all_results()`
- **Method**: `is_complete()`

### Class: `ProbabilisticPolicy`

### Class: `TraversalEngine`
> Traverses a compiled WorkRequestDAG and produces hierarchical receipts.

The engine is stateless with respect to the traversal — all state
is captured in the returned receipt tree.  Call execute() to run.

Dispatch rules:
  - child FAILED -> parent BLOCKED (failure propagation)
  - child BLOCKED -> parent BLOCKED (block propagation)
  - parent advances (PENDING) only when all children succeed
  - parent CRITIQUE triggers CRITIQUE on all children
  - Recursive Boundary: child WorkRequests enter PendingExecutionQueue

- **Method**: `__init__(dag, context)`
- **Method**: `execute()`
- **Method**: `_make_receipt(node_id, result, children, error, now)`
- **Method**: `_receipt_terminal(node, now)`
- **Method**: `_execute_dfs()`
- **Method**: `_traverse_dfs(node_id)`
- **Method**: `_execute_bfs()`
- **Method**: `_apply_bfs_dispatch_rules(receipt)`
- **Method**: `_execute_topological()`
- **Method**: `_get_child_ids(node)`
- **Method**: `_apply_probabilistic_policies(node_id, receipt)`

## Module: `losm-ir/src/losm_ir/validation.py`

### Class: `ValidationStatus`

### Class: `ValidationIssue`

### Class: `ValidationIR`

## Module: `losm-ir/src/losm_ir/work_request.py`

### Class: `WorkRequestIntent`

### Class: `WorkRequestStep`

### Class: `WorkRequestDecomposition`

### Class: `WorkRequestRequirements`

### Class: `WorkRequestResourceLimits`

### Class: `WorkRequestConstraints`

### Class: `CompletionCondition`

### Class: `WorkRequestSuccessCriteria`

### Class: `WorkRequestExecutionState`

### Class: `MergeHistoryItem`

### Class: `WorkRequestLineage`

### Class: `ProducedFile`

### Class: `IntermediateOutput`

### Class: `WorkRequestArtifacts`

### Class: `WorkRequestMetadata`

### Class: `WorkRequestDCO`

## Module: `losm-kernel/src/losm_kernel/__init__.py`

## Module: `losm-kernel/src/losm_kernel/constraints.py`

### Class: `ConstraintSystem`
- **Method**: `__init__()`
- **Method**: `add(rule)`
- **Method**: `validate(morphism, g)`

### Function: `no_cycles(morphism, graph)`
## Module: `losm-kernel/src/losm_kernel/core.py`

### Function: `graph_to_dict(g)`
### Class: `LOSMKernel`
- **Method**: `__init__(constraints)`
- **Method**: `validate_graph(g)`
  - Validate a graph against registered constraints without applying any morphism.
- **Method**: `apply(morphism, g)`
- **Method**: `run(program, env, max_iters)`

## Module: `losm-kernel/src/losm_kernel/morphism.py`

### Class: `Morphism`
- **Method**: `__call__(g)`

### Function: `compose()`
### Class: `Env`
- **Method**: `__init__()`
- **Method**: `bind(identifier, morphism)`
- **Method**: `resolve(identifier)`

### Function: `plan_morphism_func(g)`
### Function: `compile_morphism_func(g)`
### Function: `execute_morphism_func(g)`
## Module: `losm-kernel/src/losm_kernel/tbel.py`

### Class: `TBELError`

### Class: `TRACE_REGISTRY`
- **Method**: `register(cls, trace_id, trace_data)`
- **Method**: `get(cls, trace_id)`

### Function: `tbel_filter(output)`
### Function: `emit(output)`
## Module: `losm-kernel/src/losm_kernel/tesl.py`

### Function: `compute_trace_family(morphism_program, G0, env, kernel, max_iters)`
### Function: `equivalent(m1, m2, G0_space, env, kernel)`
## Module: `losm-kernel/src/losm_kernel/types.py`

## Module: `losm-kernel/tests/__init__.py`

## Module: `losm-shell/__init__.py`

## Module: `losm-shell/src/losm_shell/__init__.py`

## Module: `losm-shell/src/losm_shell/lifecycle/__init__.py`

## Module: `losm-shell/src/losm_shell/lifecycle/orchestrator.py`

### Class: `PipelineCoordinator`
- **Method**: `__init__(step_handler)`
- **Method**: `_transition_or_fail(current_state, target)`
  - Validate a transition. Raises TransitionError if not allowed.

## Module: `losm-shell/src/losm_shell/lifecycle/transition.py`

## Module: `losm-shell/src/losm_shell/planning/__init__.py`

## Module: `losm-shell/src/losm_shell/planning/compiler.py`

### Class: `PlanCompiler`
- **Method**: `compile(plan, plan_id)`

## Module: `losm-shell/src/losm_shell/runtime/__init__.py`

## Module: `losm-shell/src/losm_shell/runtime/executor.py`

### Class: `ExecutionStep`
- **Method**: `__init__(step_id, dependencies, payload)`

### Class: `StepResult`
- **Method**: `__init__(step_id, status, logs)`

### Class: `ExecutionResult`
- **Method**: `__init__(execution_id, status, step_results, failure_summary)`

### Class: `DAGExecutor`
- **Method**: `_receipt_to_step_result(receipt)`

## Module: `losm-shell/src/losm_shell/runtime/handler.py`

### Function: `register_morphism(name, morphism)`
> Register a morphism for use by KernelStepHandler.

### Function: `resolve_morphism(name)`
> Look up a morphism by name from the registry.

### Class: `ExecutionContext`
> Bag of context for step execution.

Carries the identity of the work request and execution,
plus any payload the caller wants to pass through.


### Class: `StepHandler`
> Protocol for step execution semantics.

DAGExecutor never knows what a step *means*:
- KernelStepHandler → calls losm-kernel transformations
- LLMStepHandler → calls an LLM
- ToolStepHandler → calls an external tool
- NullStepHandler → returns SUCCESS (default)

The handler is the execution boundary. Everything downstream
is a semantic runtime component.


### Class: `NullStepHandler`
> Default handler that always returns SUCCESS.

Preserves current behavior while establishing the protocol boundary.


### Class: `KernelStepHandler`
> StepHandler that delegates to LOSMKernel for graph transformation steps.

Interprets ExecutionStep.payload as a kernel instruction:

- ``{"morphism": "plan"}`` → calls ``kernel.apply(plan_morphism, graph)``
- ``{"morphism": "compile"}`` → calls ``kernel.apply(compile_morphism, graph)``
- ``{"morphism": "execute"}`` → calls ``kernel.apply(execute_morphism, graph)``
- ``{"program": [...], "env": {...}}`` → calls ``kernel.run(program, env)``
- anything else → SUCCESS no-op receipt

- **Method**: `__init__(kernel, graph)`
- **Method**: `graph()`
  - Current graph state after applied transformations.

## Module: `losm-store/src/losm_store/__init__.py`

## Module: `losm-store/src/losm_store/branch_manager.py`

### Class: `BranchManager`
- **Method**: `fork_state(db, wr_id, label, fork_point, parent_branch_id)`
- **Method**: `add_artifact_to_branch(db, branch_id, wr_id, artifact_type, content, parent_artifact_id)`
- **Method**: `score_branch(db, branch_id, score)`
- **Method**: `get_branch_info(db, branch_id)`
- **Method**: `list_branches(db, wr_id)`
- **Method**: `select_best(db, wr_id)`
- **Method**: `discard(db, branch_id)`
- **Method**: `merge(db, branch_id, strategy)`

## Module: `losm-store/src/losm_store/ingestor.py`

### Class: `ExecutionReceiptIngestor`
- **Method**: `ingest(db, receipt_payload)`
- **Method**: `_reject(db, ingest_row, receipt, planning_task, reason)`
  - Record a rejection governance event. Does NOT mutate task status.

## Module: `losm-store/src/losm_store/models.py`

### Function: `_table_args()`
### Class: `ArtifactType`

### Class: `PlanningTask`
- **Method**: `updated_at()`
  - Backwards-compat: mapped to recorded_on_dt in PostgreSQL.
- **Method**: `__repr__()`

### Class: `Artifact`
- **Method**: `__repr__()`

### Class: `ReceiptIngestRecord`

### Class: `GovernanceEvent`

### Class: `LifecycleEvent`
- **Method**: `__repr__()`

### Class: `Branch`
- **Method**: `updated_at()`
  - Backwards-compat: mapped to recorded_on_dt in PostgreSQL.
- **Method**: `__repr__()`

### Class: `BranchArtifact`
- **Method**: `__repr__()`

### Class: `WorkRequestEdge`
- **Method**: `__repr__()`

## Module: `losm-store/src/losm_store/repository.py`

### Function: `create_work_request(db, intent, constraints, priority, context_data)`
### Function: `get_work_request(db, wr_id)`
### Function: `get_work_request_by_wr_id(db, wr_id)`
> Look up a work request by its business-key UUID (wr_id column).

### Function: `update_work_request(db, wr_id, intent, constraints, priority, context_data, status)`
> Partially update a work request by its business-key UUID.

### Function: `delete_work_request(db, wr_id)`
> Hard-delete a work request by its business-key UUID. Returns True if a row was deleted, False if not found.

### Function: `list_work_requests(db, skip, limit)`
### Function: `list_all_artifacts(db, wr_id, skip, limit)`
### Function: `get_artifacts_by_wr(db, wr_id)`
### Function: `get_artifact_lineage(db, artifact_id)`
### Function: `list_all_branches(db, wr_id, skip, limit)`
### Function: `create_branch(db, wr_id, label, parent_branch_id, fork_point)`
### Function: `get_branch(db, branch_id)`
### Function: `get_branches_by_wr_id(db, wr_id)`
### Function: `update_branch_score(db, branch_id, score)`
### Function: `merge_branch(db, branch_id, merge_strategy)`
### Function: `discard_branch(db, branch_id)`
### Function: `create_branch_artifact(db, branch_id, wr_id, artifact_type, content, parent_artifact_id, score)`
### Function: `get_branch_artifacts(db, branch_id)`
### Function: `create_edge(db, parent_wr_id, child_wr_id, edge_type, metadata_json)`
### Function: `get_edges_by_parent(db, wr_id)`
### Function: `get_edges_by_child(db, wr_id)`
### Function: `delete_edge(db, edge_id)`
## Module: `losm-store/src/losm_store/session.py`

### Function: `get_db()`
