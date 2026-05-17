---
name: event-replay
phase: post-execution
status: specified
---

# Event Replay Skill

## Purpose
Deterministic reconstruction of ExecutionGraph state from the CER event log. The replay engine is a pure fold over rehydrated events. It does not execute work — it reconstructs what happened.

This is a post-execution utility skill. It is not a pipeline stage.

## References
- [Spec: Event Replay Engine v2](../docs/REPLAY_ENGINE.md)
- [Schema: Execution Graph Schema v2 §8.13](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Event Grammar v3](../docs/EVENT_GRAMMAR.md)
- [CER Specification v1](../docs/CER_SPEC.md)
- [CER CCNF v1](../docs/CER_CCNF.md)
- [CER Pipeline Skill](../skills/cer-pipeline/SKILL.md)

## Input
- `cer_events: CER[]` — CER events from the canonical store
- `snapshot?: Snapshot` — optional starting state (from snapshot engine)
- `mode: "full" | "incremental" | "time_travel" | "branch"`
- `cursor?: ReplayCursor` — target position (for time-travel) or hypothetical events (for branch)
- `ccnf_version: int` — CCNF identity epoch (default 1)
- `collapse_engine_version: int` — semantic collapse version (default 1)
- `rehydration_version: int` — rehydration semantics version (default 1)

## Output
- `state: RuntimeSnapshot` — reconstructed execution graph + scheduler + distributed state
- `observations: ObservationEvent[]` — ephemeral derived views (in-memory only, not persisted)
- `snapshots: Snapshot[]` — written to `.pipeline/snapshots/{domain}/{causal_chain_id}/` (derived artifacts)

## Constraints
- MUST NOT execute nodes
- MUST NOT call executors
- MUST NOT mutate external systems
- MUST NOT persist observation events to the Event Log
- MUST be deterministic — same events + same versions → same output
- MUST rehydrate CER events before fold loop
- MUST load from snapshots (not checkpoints — checkpoint model is deprecated)

## Execution

### Step 0: Rehydrate CER events

```python
def rehydrate_cer_events(cer_events, ccnf_version, collapse_engine_version,
                         rehydration_version, prior_event_store):
    return rehydrate(cer_events, collapse_engine_version, prior_event_store)
    # Full rehydration pipeline defined in cer-pipeline/SKILL.md (Read Path)
    # Steps: decompress DELTA → resolve ALIAS → expand SYNTHETIC → semantic collapse
```

### Step 1: Load initial state

Determine the starting state based on mode:

```
match mode:
    case "full":
        state = empty_execution_state()
        start_index = 0

    case "incremental":
        snapshot = load_nearest_snapshot(snapshot_dir, target_index)
        verify_triple_version_lock(snapshot, ccnf_version, collapse_engine_version, rehydration_version)
        state = snapshot.entity_state_index
        start_index = snapshot.event_range.end + 1

    case "time_travel":
        state = empty_execution_state()
        start_index = 0
        // We'll stop at cursor.eventIndex

    case "branch":
        state = empty_execution_state()
        start_index = 0
        // After replaying real events, apply hypothetical_events
```

### Step 2: Fold loop over rehydrated events

```
cursor = { eventIndex: start_index, time: null }

rehydrated = rehydrate_cer_events(cer_events, ccnf_version,
                                   collapse_engine_version, rehydration_version)

for i from start_index to len(rehydrated) - 1:
    event = rehydrated[i]
    state = apply_event(state, event)
    cursor.eventIndex = i
    cursor.time = event.timestamp

    if mode == "time_travel" and i == cursor.eventIndex:
        emit_observations(state, cursor)
        return state  // stop here for time-travel

    if emit_observations_every_step:
        emit_observations(state, cursor)
```

```

### Step 3: Apply event reducers

Each event type has a pure reducer that mutates state deterministically:

```
function applyNodeReadied(state, event):
    state.nodes[event.node_id].lifecycle_state = READY
    state.scheduler.ready_queue.add(event.node_id)
    return state

function applyNodeClaimed(state, event):
    state.nodes[event.node_id].lifecycle_state = CLAIMED
    state.nodes[event.node_id].claim = {
        host_id: event.host_id,
        lease_id: event.lease_id,
        lease_expiration: event.lease_expiration
    }
    state.scheduler.ready_queue.remove(event.node_id)
    state.scheduler.claimed_nodes[event.node_id] = event.host_id
    state.distributed.leases[event.node_id] = { host_id: event.host_id, ... }
    return state

function applyExecutionBound(state, event):
    state.nodes[event.node_id].lifecycle_state = BOUND
    state.nodes[event.node_id].executor_instance = event.executor_id
    state.scheduler.claimed_nodes.remove(event.node_id)
    return state

function applyNodeExecutionStarted(state, event):
    state.nodes[event.node_id].lifecycle_state = RUNNING
    state.scheduler.running_nodes[event.node_id] = event.executor_id
    return state

function applyExecutionSucceeded(state, event):
    state.nodes[event.node_id].lifecycle_state = SUCCEEDED
    state.nodes[event.node_id].outputs = event.outputs_ref
    state.scheduler.running_nodes.remove(event.node_id)
    if event.node_id in state.distributed.leases:
        state.distributed.leases.remove(event.node_id)
    return state

function applyExecutionFailed(state, event):
    state.nodes[event.node_id].lifecycle_state = FAILED
    state.scheduler.running_nodes.remove(event.node_id)
    return state

function applyRetryEvent(state, event):
    state.nodes[event.node_id].lifecycle_state = READY
    state.nodes[event.node_id].retries += 1
    state.scheduler.retry_counters[event.node_id] += 1
    state.scheduler.ready_queue.add(event.node_id)
    return state

function applyLeaseExpired(state, event):
    state.distributed.leases.remove(event.node_id)
    if state.nodes[event.node_id].lifecycle_state == CLAIMED:
        state.nodes[event.node_id].lifecycle_state = READY
        state.scheduler.ready_queue.add(event.node_id)
    return state

function applyHostHeartbeat(state, event):
    state.distributed.host_registry[event.host_id] = {
        last_heartbeat: event.timestamp,
        capabilities: event.capabilities
    }
    return state

// ... remaining event types follow the same pattern
```

### Step 4: Emit observations

After each step (or on request):

```
function emit_observations(state, cursor):
    stream_ephemeral(StateSnapshot {
        cursor, node_count: len(state.nodes), ...
    })

    for each node in recently_changed_nodes(state):
        stream_ephemeral(NodeStateTransitionView {
            node_id,
            lifecycle_state,
            timestamp: cursor.time
        })

    stream_ephemeral(SchedulerQueueView {
        ready_queue: state.scheduler.ready_queue,
        running_nodes: state.scheduler.running_nodes,
        blocked_nodes: state.scheduler.blocked_nodes
    })

    stream_ephemeral(LeaseGraphView {
        leases: state.distributed.leases
    })
```

Observations are in-memory only. They are NOT appended to the EventLog.

### Step 5: Snapshot creation (async, delegated)

Snapshots are created by the independent Snapshot Engine, not by the replay engine. The replay engine only reads snapshots.

See [`CER_SNAPSHOT_ENGINE.md`](../docs/CER_SNAPSHOT_ENGINE.md) for the full specification.

```python
function load_snapshot(causal_chain_id, snapshot_n, ccnf_version,
                       collapse_engine_version, rehydration_version):
    snapshot = read_from(snapshot_path(causal_chain_id, snapshot_n))

    # Triple-version lock verification
    assert snapshot.ccnf_version == ccnf_version
    assert snapshot.collapse_engine_version == collapse_engine_version
    assert snapshot.rehydration_version == rehydration_version

    # Hash chain anchor verification
    global_hash = SHA256(snapshot.entity_state_index + snapshot.event_range)
    assert global_hash == snapshot.global_hash

    return snapshot
```

### Step 6: Debugger API

```python
function inspect(node_id, cursor, cer_events, ccnf_version, collapse_engine_version):
    state = replay(cer_events, empty_state(), ccnf_version, collapse_engine_version)
    return state.nodes[node_id]

function trace(node_id, cer_events):
    return [e for e in cer_events if e.artifact_refs.contains(f"node:{node_id}")]

function dependency_chain(node_id, state):
    chain = []
    node = state.nodes[node_id]
    for dep_id in node.dependencies:
        chain.append(state.nodes[dep_id])
        chain.extend(dependency_chain(dep_id, state))
    return chain
```

## Replay Mode Entry Points

### full_replay()
```
replay(cer_events, empty_state(), ccnf_version, collapse_engine_version, rehydration_version)
```
Returns final state + all observations.

### incremental_replay(target_causal_chain_id)
```
snapshot = load_nearest_snapshot(target_causal_chain_id)
state = snapshot.entity_state_index
rehydrated = rehydrate(cer_events[start:target], collapse_engine_version, rehydration_version)
fold(rehydrated, state)
```
Returns state at target position.

### time_travel_replay(target_cursor)
```
rehydrated = rehydrate(cer_events[0:target], collapse_engine_version, rehydration_version)
fold(rehydrated[0:cursor.eventIndex], empty_state())
```
Returns state at cursor position.

### branch_replay(hypothetical_events)
```
state = replay(cer_events, empty_state(), ...)
state = replay(hypothetical_events, state, ...)
```
Returns hypothetical state.

## Snapshot Directory Structure

```
.pipeline/snapshots/
    {domain}/
        {causal_chain_id}/
            snapshot_0001.cer.json
            snapshot_0002.cer.json
            ...
```

## Validation

| Check | Failure |
|---|---|
| CER schema compliance | Reject replay |
| Triple-version lock on snapshot | Fall back to full replay, log warning |
| DELTA ancestor_event_id resolves | Abort rehydration |
| ALIAS cycle detected | Abort rehydration |
| Replay completed without error | Return state |
| Observation events not stored | Invariant enforced by skill |

## Error Handling

| Error | Response |
|---|---|
| Corrupted snapshot (hash mismatch) | Fall back to full replay, log warning |
| CER event log truncated | Replay up to available events, report gap |
| Orphan DELTA (missing ancestor) | Abort rehydration, report corrupted log |
| Unknown event type | Skip event, log warning, continue |
| Observation stream disconnected | Discard observations, continue replay |
| Snapshot read failure | Log warning, continue without snapshot |
| CCNF version mismatch | Fall back to LegacyCERAdapter if migration exists, otherwise abort |
