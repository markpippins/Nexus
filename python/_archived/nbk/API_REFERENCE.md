# Nexus nbk - API Reference

This document details every module, class, and method within the `nbk` package.

## Module: `__init__.py`

## Module: `cli.py`

### Function: `build_example()`
> Build the canonical ETL pipeline example.

### Function: `cmd_run(args)`
### Function: `cmd_info(args)`
### Function: `cmd_dot(args)`
### Function: `cmd_scql(args)`
> Demonstrate SCQL-style queries on the kernel.

### Function: `main()`
## Module: `core.py`

### Class: `NodeDef`
> A named computation node in the causal graph.


### Class: `Edge`
> A causal dependency edge: ``to`` cannot execute before ``from``.


### Class: `Trace`
> An immutable record of a single node execution.


### Class: `Lease`
> Permission binding a node to an executor for a scope.


### Function: `make_address(realm, graph, trajectory, node_id, version)`
> Build a CAL address from components. Format: ``cal://{realm}/{graph}/{trajectory}/{node}/{version}``

### Function: `parse_address(address)`
> Parse a CAL address into its components.

### Function: `_content_hash()`
## Module: `kernel.py`

### Class: `NexusBootstrapKernel`
> A self-modifying causal graph execution engine.

Usage::

    k = NexusBootstrapKernel(realm="dev", graph="my-pipeline")

    k.add_node("extract", extract_fn)
    k.add_node("transform", transform_fn)
    k.add_edge("extract", "transform")

    k.schedule_leases()          # assign executors
    n = k.execute_ready_nodes()  # run one tick
    k.replay()                   # reconstruct state from traces

- **Method**: `__init__(realm, graph)`
- **Method**: `add_node(node_id, fn)`
  - Register a computation node.
- **Method**: `add_edge(from_id, to_id)`
  - Add a causal dependency: ``to_id`` needs ``from_id`` first.
- **Method**: `nodes()`
- **Method**: `edges()`
- **Method**: `node_states()`
- **Method**: `get_node(node_id)`
- **Method**: `dependencies(node_id)`
  - Return the node IDs that ``node_id`` depends on.
- **Method**: `dependents(node_id)`
  - Return nodes that depend on ``node_id``.
- **Method**: `dependencies_satisfied(node_id)`
  - Check if all upstream dependencies have been computed.
- **Method**: `lease_valid(node_id)`
  - Check if the node has a valid lease binding.
- **Method**: `ready_nodes()`
  - Return nodes that are ready to execute (deps met + lease valid).
- **Method**: `resolve_inputs(node_id)`
  - Gather the output states of all upstream dependencies.
- **Method**: `execute_ready_nodes()`
  - Execute all ready nodes (topological tick). Returns the number of nodes executed this tick.
- **Method**: `execute_node(node_id)`
  - Force-execute a single node (bypasses readiness check). Useful for testing or for nodes with manual execution policy.
- **Method**: `_execute_one(node_id)`
- **Method**: `replay()`
  - Reconstruct the full state by replaying all traces in order. Returns the final state dict (node_id → output).
- **Method**: `schedule_leases(executors, strategy)`
  - Assign every unleased node to an executor.
- **Method**: `add_lease(node_id, executor_id)`
  - Manually bind a node to an executor.
- **Method**: `address_of(node_id, trajectory)`
  - Return the CAL address for a given node.
- **Method**: `resolve(address)`
  - Resolve a CAL address to the underlying node definition.
- **Method**: `query(predicate)`
  - Query the execution graph. Parameters ---------- predicate : callable or None A function ``(node_id, node_def, state) → bool``. If None, returns all nodes. Returns ------- list[dict] Matching rows with keys: node_id, metadata, state, lease, deps, dependents.
- **Method**: `mutate(rule)`
  - Apply a mutation rule and return the list of affected node ids.
- **Method**: `run_cycle(max_iterations)`
  - Run the execute → query → mutate loop. Returns total nodes executed.
- **Method**: `reset()`
  - Clear execution state but keep graph structure.
- **Method**: `snapshot()`
  - Return a serialisable snapshot of current kernel state.
- **Method**: `_require_node(node_id)`
- **Method**: `_would_cycle(start, target)`
  - BFS from start — if we reach target, adding edge would cycle.

### Class: `MutationRule`
> Base class for graph mutation rules (SOCO layer).

- **Method**: `applies(node_id, node, kernel)`
  - Return True if this rule should be applied to the given node.
- **Method**: `apply(node_id, kernel)`
  - Apply the rule to the kernel. Returns list of affected node IDs.

## Module: `rules.py`

### Class: `CollapseChainRule`
> Collapse a linear chain A→B→C into a single fused node.

Applies when a node has exactly one upstream and one downstream
dependency, forming a pure pipeline segment.

- **Method**: `applies(node_id, node, kernel)`
- **Method**: `apply(node_id, kernel)`

### Class: `MergeIdleLeasesRule`
> Rebind idle nodes (unexecuted) to a shared executor.

Reduces executor fragmentation by consolidating unassigned or
idle leases under a single executor.

- **Method**: `__init__(target_executor)`
- **Method**: `applies(node_id, node, kernel)`
- **Method**: `apply(node_id, kernel)`

## Module: `tests/__init__.py`

