---
name: observation-engine
phase: post-execution (Phase 3)
status: specification
---

# Observation Engine Skill

## Purpose

Semantic interpretation of execution history. The Observation Engine produces high-level View AST objects from reconstructed ReconstructedState. It does not participate in execution, compilation, or replay truth — it is a pure read-only projection layer.

## References

- [Spec: Observation Model v1](../docs/OBSERVATION_MODEL.md)
- [Spec: Event Replay Engine v1](../docs/REPLAY_ENGINE.md)
- [Schema: Execution Graph Schema v3](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Event Grammar v2](../docs/EVENT_GRAMMAR.md)

## Input

- `eventLog: EventLog` — totally ordered, append-only event stream
- `executionGraph: ExecutionGraph` — frozen AST
- `query: ObservationQuery` — specifies view type, scope, temporal mode
- `replayEngine: ReplayEngine` — delegate for state reconstruction

## Output

- `view: ObservationView` — typed View AST node (ephemeral, in-memory only)

## Constraints

- MUST NOT modify EventLog, ExecutionGraph, or any system state
- MUST NOT persist views to EventLog
- MUST NOT use replay-level observations as reducer input
- MUST be deterministic — same history + same query → same view
- MUST respect causal order in temporal projections

## Architecture Boundary

```
                  ┌─────────────────────┐
                  │     EventLog        │
                  └──────────┬──────────┘
                             ↓
                  ┌─────────────────────┐
                  │   Replay Engine     │  (pure fold, mechanical)
                  └──────────┬──────────┘
                             ↓
                  ┌─────────────────────┐
                  │  ReconstructedState     │  (reconstructed)
                  └──────────┬──────────┘
                             ↓
                  ┌─────────────────────┐
                  │ Observation Engine  │  ← YOU ARE HERE
                  └──────────┬──────────┘
                             ↓
                  ┌─────────────────────┐
                  │     View AST        │  (ephemeral)
                  └─────────────────────┘
```

## Execution

### Step 1: Resolve temporal mode

Determine how to source ReconstructedState:

```
function resolveState(query, eventLog, replayEngine):
    match query.projection_time:
        case "SNAPSHOT":
            return replayEngine.replay(eventLog[0..query.end_event])
        case "REPLAY":
            return replayEngine.timeTravel(eventLog, query.cursor)
        case "LIVE":
            return replayEngine.replay(eventLog)
```

### Step 2: Dispatch query to view projector

```
function observe(query, eventLog, executionGraph, replayEngine):
    state = resolveState(query, eventLog, replayEngine)

    switch query.type:
        case "graph":      return projectGraphView(state, executionGraph)
        case "node":       return projectNodeView(state, query.node_id)
        case "trace":      return projectTraceView(state, query.node_id, eventLog)
        case "dependency": return projectDependencyView(state, executionGraph)
        case "failure":    return projectFailureView(state, eventLog)
        case "system":     return projectSystemView(state, eventLog)
```

### Step 3: View projectors

Each projector is a pure function from (state, optional params) → View AST.

#### GraphView

```
function projectGraphView(state, executionGraph):
    nodes = state.nodes
    lifecycle_counts = {
        state: count(nodes, lifecycle_state == state)
        for state in [pending, READY, CLAIMED, BOUND, RUNNING,
                      SUCCEEDED, FAILED, SKIPPED, BLOCKED]
    }
    return GraphView {
        observation_id: generateId(),
        source_range: { start_event: 0, end_event: state.cursor.eventIndex },
        projection_time: "SNAPSHOT",
        content: {
            total_nodes: len(nodes),
            node_counts_by_state: lifecycle_counts,
            completion_ratio: lifecycle_counts.SUCCEEDED / len(nodes),
            active_nodes: count(nodes where state in [RUNNING, BOUND, CLAIMED]),
            topology: {
                node_types: count_by(nodes, .node_type),
                parallel_regions: count_parallel_regions(executionGraph),
                sequential_depth: max_depth(executionGraph)
            }
        },
        ephemeral: true
    }
```

#### NodeView

```
function projectNodeView(state, node_id):
    node = state.nodes[node_id]
    event_chain = [e for e in state.event_log if e.node_id == node_id]

    return NodeView {
        observation_id: generateId(),
        type: "NodeView",
        projection_time: "REPLAY",
        source_range: {
            start_event: event_chain[0].index,
            end_event: event_chain[-1].index
        },
        content: {
            node_id,
            node_type: node.node_type,
            lifecycle: lifecycle_transitions(event_chain),
            current_state: node.lifecycle_state,
            outputs: node.outputs,
            retries: node.retries,
            executor: {
                selected: node.executor_selection,
                instance: node.executor_instance
            },
            timeline: [
                { event: e.type, timestamp: e.timestamp, state: derived_state(e) }
                for e in event_chain
            ]
        },
        ephemeral: true
    }
```

#### TraceView

```
function projectTraceView(state, node_id, eventLog):
    events = [e for e in eventLog if e.node_id == node_id]

    return TraceView {
        observation_id: generateId(),
        type: "TraceView",
        projection_time: "REPLAY",
        source_range: {
            start_event: events[0].index,
            end_event: events[-1].index
        },
        content: {
            node_id,
            causal_chain: [
                { event_id: e.event_id, type: e.type, caused_by: e.caused_by,
                  timestamp: e.timestamp }
                for e in events
            ],
            root_cause: find_root_cause(events),
            dependency_walk: walk_dependencies(state, node_id)
        },
        ephemeral: true
    }
```

#### DependencyView

```
function projectDependencyView(state, executionGraph):
    edges = executionGraph.edges

    return DependencyView {
        observation_id: generateId(),
        type: "DependencyView",
        projection_time: "SNAPSHOT",
        content: {
            total_edges: len(edges),
            edge_types: count_by(edges, .edge_type),
            critical_path: compute_critical_path(state, executionGraph),
            blocked_paths: [
                { path, blocked_by: find_blocking_node(state, path) }
                for path in find_blocked_chains(state, executionGraph)
            ],
            actual_order: derive_actual_execution_order(state),
            intended_order: derive_intended_order(executionGraph),
            efficiency: compare_actual_vs_intended(state, executionGraph)
        },
        ephemeral: true
    }
```

#### FailureView

```
function projectFailureView(state, eventLog):
    failure_nodes = [n for n in state.nodes if n.lifecycle_state == FAILED]
    retry_events = [e for e in eventLog if e.type == "RetryEvent"]

    return FailureView {
        observation_id: generateId(),
        type: "FailureView",
        projection_time: "REPLAY",
        content: {
            failure_count: len(failure_nodes),
            retry_count: len(retry_events),
            failure_nodes: [
                {
                    node_id: n.node_id,
                    failure_event: last_event_for(n.node_id, eventLog),
                    retries: n.retries,
                    classification: classify_failure(n, eventLog)
                }
                for n in failure_nodes
            ],
            propagation_graph: build_propagation_graph(failure_nodes, state),
            retry_trees: build_retry_trees(failure_nodes, retry_events, eventLog)
        },
        ephemeral: true
    }
```

#### SystemView

```
function projectSystemView(state, eventLog):
    heartbeats = [e for e in eventLog if e.type == "HostHeartbeat"]
    claims = [e for e in eventLog if e.type == "NodeClaimed"]
    leases = state.distributed.leases if state.distributed else {}

    return SystemView {
        observation_id: generateId(),
        type: "SystemView",
        projection_time: "SNAPSHOT",
        content: {
            host_count: len(state.distributed.host_registry),
            active_hosts: count_active_hosts(heartbeats),
            lease_count: len(leases),
            claim_events: len(claims),
            claim_conflicts: detect_claim_conflicts(claims),
            host_activity: build_host_activity_map(state.distributed.host_registry),
            load_distribution: compute_load_distribution(state),
            scheduler_efficiency: {
                avg_queue_length: compute_avg_queue_length(state),
                claim_success_rate: compute_claim_success_rate(claims, state)
            }
        },
        ephemeral: true
    }
```

### Step 4: Emit view

```
function emitView(view):
    match view.type:
        case "GraphView":     stream_to_ui("graph", view)
        case "NodeView":      stream_to_ui("node", view)
        case "TraceView":     stream_to_ui("trace", view)
        case "DependencyView": stream_to_ui("dependency", view)
        case "FailureView":   stream_to_ui("failure", view)
        case "SystemView":    stream_to_ui("system", view)
    return view  // caller decides retention
```

Views are ephemeral. The caller (UI, CLI, analytics pipeline) determines retention policy. The Observation Engine never persists.

## Query Interface

### Query Object

```json
{
  "type": "graph | node | trace | dependency | failure | system",
  "node_id": "EX-001",
  "projection_time": "LIVE | SNAPSHOT | REPLAY",
  "cursor": { "eventIndex": 500 },
  "scope": {
    "start_event": 0,
    "end_event": 1500
  }
}
```

### Response

```json
{
  "observation_id": "OBS-042",
  "type": "NodeView",
  "source_range": { "start_event": 200, "end_event": 850 },
  "projection_time": "REPLAY",
  "derived_from": {
    "event_log_hash": "abc123",
    "execution_graph_hash": "def456",
    "replay_state_hash": "ghi789"
  },
  "content": { ... },
  "ephemeral": true
}
```

## Validation

| Check | Failure |
|---|---|
| EventLog is immutable | Reject observation |
| ExecutionGraph is frozen | Reject observation |
| Derived_from hashes match | Warn on mismatch, continue |
| View is not persisted to EventLog | Enforced by skill |
| ReplayObservations not used as input | Enforced by skill |
| Causal order respected | Verify projection_time mode |

## Error Handling

| Error | Response |
|---|---|
| EventLog unavailable | Return empty view, log warning |
| Node not found | Return NodeView with error content |
| Replay engine failure | Propagate error, do not emit partial view |
| Query type unknown | Return error view |
| Temporal mode unsupported | Fall back to SNAPSHOT |
