---
name: event-replay
phase: post-execution
status: implemented
---

# Event Replay Skill

## Purpose
Deterministic reconstruction of ExecutionGraph state from the event log. The replay engine is a pure fold over events. It does not execute work — it reconstructs what happened.

This is a post-execution utility skill. It is not a pipeline stage.

## References
- [Spec: Event Replay Engine v1](../docs/REPLAY_ENGINE.md)
- [Schema: Execution Graph Schema v2 §8.13](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Event Grammar v2](../docs/EVENT_GRAMMAR.md)

## Input
- `events: EventLog` — totally ordered, append-only event stream
- `checkpoint?: Checkpoint` — optional starting state for incremental replay
- `mode: "full" | "incremental" | "time_travel" | "branch"`
- `cursor?: ReplayCursor` — target position (for time-travel) or hypothetical events (for branch)
- `CHECKPOINT_INTERVAL: int` — how often to write checkpoints (default 100)

## Output
- `state: RuntimeSnapshot` — reconstructed execution graph + scheduler + distributed state
- `observations: ObservationEvent[]` — ephemeral derived views (in-memory only, not persisted)
- `checkpoints: Checkpoint[]` — written to `.pipeline/EXECUTIONS/` (cache artifacts)

## Constraints
- MUST NOT execute nodes
- MUST NOT call executors
- MUST NOT mutate external systems
- MUST NOT persist observation events to the Event Log
- MUST be deterministic — same events + same initial state → same output

## Execution

### Step 1: Load initial state

Determine the starting state based on mode:

```
match mode:
    case "full":
        state = empty_execution_state()
        start_index = 0

    case "incremental":
        checkpoint = load_nearest_checkpoint(checkpoint_dir, target_index)
        state = checkpoint.execution_graph_state
        start_index = checkpoint.event_index + 1
        verify_checkpoint(checkpoint, events)

    case "time_travel":
        state = empty_execution_state()
        start_index = 0
        // We'll stop at cursor.eventIndex

    case "branch":
        state = empty_execution_state()
        start_index = 0
        // After replaying real events, apply hypothetical_events
```

### Step 2: Fold loop

```
cursor = { eventIndex: start_index, time: null }

for i from start_index to len(events) - 1:
    event = events[i]
    state = apply_event(state, event)
    cursor.eventIndex = i
    cursor.time = event.timestamp

    if mode == "time_travel" and i == cursor.eventIndex:
        emit_observations(state, cursor)
        return state  // stop here for time-travel

    if should_checkpoint(i):
        write_checkpoint(i, state)

    if emit_observations_every_step:
        emit_observations(state, cursor)
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

### Step 5: Manage checkpoints

```
function should_checkpoint(event_index):
    return (event_index % CHECKPOINT_INTERVAL == 0)
        OR is_hot_state_change(state)

function write_checkpoint(event_index, state):
    checkpoint = {
        checkpoint_id: fmt("ckpt-{:04d}", event_index),
        event_index,
        event_hash: sha256(event_log[event_index]),
        execution_graph_state: state.nodes,
        scheduler_state: state.scheduler,
        distributed_state: state.distributed,
        timestamp: now()
    }
    write_to(checkpoint_path(event_index), checkpoint)

function load_checkpoint(event_index):
    checkpoint = read_from(checkpoint_path(event_index))
    actual_hash = sha256(event_log[checkpoint.event_index])
    assert checkpoint.event_hash == actual_hash
        // checkpoint invalid or corrupted — fall back to full replay
    return checkpoint
```

### Step 6: Debugger API

```
function inspect(node_id, cursor):
    state = replay(events[0..cursor.eventIndex])
    return state.nodes[node_id]

function trace(node_id, events):
    return [e for e in events if e.node_id == node_id]

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
replay(event_log, empty_state())
```
Returns final state + all observations.

### incremental_replay(target_index)
```
checkpoint = load_nearest_checkpoint(target_index)
state = checkpoint.state
replay(event_log[checkpoint.event_index + 1 : target_index], state)
```
Returns state at target_index.

### time_travel_replay(target_cursor)
```
replay(event_log[0 : target_cursor.eventIndex], empty_state())
```
Returns state at cursor position.

### branch_replay(hypothetical_events)
```
state = replay(event_log, empty_state())
state = replay(hypothetical_events, state)
```
Returns hypothetical state.

## Checkpoint Directory Structure

```
.pipeline/EXECUTIONS/
    checkpoint-0000.json    # initial state
    checkpoint-0100.json    # every N events (configurable)
    checkpoint-0200.json
    ...
```

## Validation

| Check | Failure |
|---|---|
| Event log is append-only | Reject replay |
| Event timestamps are monotonic | Warn, continue (logical order preserved) |
| Checkpoint hash matches event | Fall back to full replay |
| Replay completed without error | Return state |
| Observation events not stored | Invariant enforced by skill |

## Error Handling

| Error | Response |
|---|---|
| Corrupted checkpoint | Fall back to full replay, log warning |
| Event log truncated | Replay up to available events, report gap |
| Unknown event type | Skip event, log warning, continue |
| Observation stream disconnected | Discard observations, continue replay |
| Checkpoint write failure | Log warning, continue without checkpoint |
