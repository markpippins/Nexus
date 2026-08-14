# Cross-Subsystem Event Bus Architecture in Nexus

## Purpose

Analysis of the event bus architecture in Nexus to identify cross-subsystem dependencies for the "Events, what are we putting on the bus?" discussion topic.

## Overview

The Nexus event system is built around the **Work Request Pipeline (WRP)** — a kernel-level event bus that processes event deltas representing state transitions in work pipelines. The system follows a publish/consume model where events are emitted, reduced, and distributed to subscribers.

## Event Types

### Core Event Categories

| Category | Description |
|----------|-------------|
| Pipeline Lifecycle | WorkRequest events (VALIDATED, CLAIMED, ACKED, SETTLED, REJECTED) representing pipeline state changes |
| Role Leases | LEAVE_ACQUIRE, LEAVE_RELEASE, LEAVE_CONSUMED events governing role-based access |
| System Events | Generic system notifications for inter-service communication |

### WRP Kernel Events

The WRP kernel defines canonical event types in `nexus/python/nexus_core/wrp/`:

- `WR_CLAIMED` - Work request claimed by a worker
- `WR_ACKED` - Worker acknowledged processing
- `WR_SETTLED` - Work request settled (completion/failure)
- `WR_FAILED` - Work request failed
- `WR_REJECTED` - Work request rejected
- `WR_NOOP` - Work request processed but no action taken

### Addressing Events

Events are routed through an addressing system that uses canonical address strings to direct events to specific subsystem subscribers. The addressing layer maps event types and routing keys to subscriber callbacks.

### Identity/Emit Events

The identity module emits events at key pipeline points using `emit_identity()`, which creates structured events with:
- Canonical entity keys
- Routing metadata
- Timestamps and context

## Event Bus Components

### 1. Kernel

```
nexus/python/nexus_core/wrp/kernel.py
```

**Primary responsibilities:**
- Event loop and dispatch mechanism
- State transition management
- Event validation
- Subscription registration

**Key API:**
```python
# Subscribe to events
kernel.subscribe("wr.*", callback, role="builder")

# Emit events
kernel.emit(KernelDelta(
    event_type="WR_CLAIMED",
    payload={"wr_id": "...", "worker_id": "..."}
))
```

The kernel acts as the central bus - all subsystems emit events through it and subscribe to events they need to react to.

### 2. Addressing

```
nexus/python/nexus_core/wrp/addressing.py
```

**Primary responsibilities:**
- Canonical addressing scheme
- Route resolution (entity_key + event_type → subscriber)
- Cross-subsystem routing

**Key functions:**
- `make_address(entity_type, entity_id)` - creates canonical address strings
- `parse_address(address)` - parses address strings into components

### 3. Identity

```
nexus/python/nexus_core/wrp/identity.py
```

**Primary responsibilities:**
- CCNF entity key generation
- Identity emission events
- Canonical entity identification

**Key API:**
```python
emit_identity(entity_id, role="builder")
```

Emits events when identities are created or updated, which the kernel routes to subscribers.

### 4. Reducer

```
nexus/python/nexus_core/wrp/conduit_wrp_reducer.py
```

**Primary responsibilities:**
- Event state transition logic
- Business rule application
- Downstream event generation

The reducer consumes events from the kernel and produces state changes, which in turn may emit new events.

### 5. State

```
nexus/python/nexus_core/wrp/states.py
```

**Primary responsibilities:**
- State transition validation
- Adjacency matrix for valid state transitions
- State mapping logic

## Core Event Bus Flow

```
1. Event emission: Identity or subsystem → Kernel.emit()
2. Event routing: Kernel → Addressing (route resolution)
3. Event processing: Kernel → Reducer (consume/process)
4. State transition: Reducer → States (validate transition)
5. Subscription delivery: Kernel → Subscribers
```

Events flow through the kernel which routes them to registered subscribers. The reducer consumes events, validates state transitions via the states module, and produces new events/state changes.

## Cross-Subsystem Dependencies

These represent the primary integration points between subsystems via the event bus:

| From Subsystem | To Subsystem | Integration Point | Event Type | Purpose |
|----------------|--------------|-------------------|------------|---------|
| Identity | Kernel | emit_identity() → kernel.emit() | wr_identity_created | Notifies subscribers of new entity identities |
| Kernel | Addressing | route event by address string | WR_* | Routes events to correct subsystem subscribers |
| Kernel | Reducer | kernel → reducer.consume() | WR_CLAIMED, WR_ACKED, etc. | Feeds events into pipeline processing |
| Reducer | States | state transition validation | pipeline events | Ensures state transitions are valid |
| Kernel | Subscribers | callback delivery | wr.role, pipeline.* | Distributes events to role-based listeners |
| TTS | Kernel | kernel.subscribe() | WR_* | Listens for work request state changes |
| Address Services | Kernel | kernel.subscribe() | role.lease.* | Listens for role lease lifecycle events |
| Conduit | Kernel | kernel.emit() | WR_* | Emits work request pipeline events |
| Timeclock | Kernel | kernel.subscribe() | role.lease.* | Listens for lease acquisition/release |
| Audit/History | Kernel | kernel.subscribe() | * | Records immutable event history |
| UI Components | Kernel | kernel.subscribe() | wr.*, role.lease.* | Reacts to pipeline updates |

## Critical Dependencies (Top 10)

1. **Kernel → Addressing** — Event routing depends entirely on correct address parsing and route resolution.

2. **Identity → Kernel** — All entity identification events flow through emit_identity(), critical for downstream identity resolution.

3. **Kernel → Reducer** — The reducer is the central event processor; if it fails, pipeline state cannot advance.

4. **Reducer → States** — State validation prevents invalid transitions; the adjacency matrix is the authoritative source.

5. **Kernel → TTS** — The TTS subsystem subscribes to WR_* events to announce pipeline milestones; depends on kernel delivery reliability.

6. **Conduit → Kernel** — The conduit orchestrator emits WR_* events; any issues here break pipeline event flow.

7. **Kernel → Role Services (Timeclock, Lease)** — Role-related events (lease acquire/release) drive the role lease system.

8. **Kernel → Subscribers** — Callback delivery to all subscribers depends on kernel's publish mechanism functioning correctly.

9. **Address Services → Kernel** — Address-based services subscribe directly to kernel events for identity resolution.

10. **NATS → Kernel Events** — The TTS subscriber consumes kernel events via NATS (`nexus.kernel.v1.transition.*`), making NATS connectivity a critical dependency for TTS functionality.

## Architecture Constraints

The system follows these architectural principles:

1. **Database-First**: The kernel state and event history are persisted in PostgreSQL (`nexus.work_request_events` table). The database is the canonical store; event handlers are secondary.

2. **Immutability**: Event history is append-only. Once written to `work_request_events`, events cannot be modified.

3. **Kernel Authority**: All subsystems must emit events through the kernel and subscribe to events they need — no direct cross-subsystem calls.

4. **Addressing Scheme**: All events use canonical addresses (`make_address`) for routing — no ad-hoc routing keys.

5. **State Authority**: The `states.py` adjacency matrix is the authoritative source for valid state transitions.

## Scalability Considerations

1. **Horizontal Scaling**: The NATS-based event distribution allows for horizontal scaling — additional subscribers can be added without coordination.

2. **Event Partitioning**: Events are partitioned by address (entity key), enabling workload distribution.

3. **Async Processing**: Subscribers process events asynchronously, preventing slow consumers from blocking the event flow.

4. **Backpressure Handling**: The kernel implements backpressure mechanisms to prevent overload during event bursts.

## Implementation Recommendations

1. **Start with Kernel-Addressing** — Verify all emit points properly use canonical addressing.

2. **Validate Reduction Logic** — Ensure the reducer handles all event types specified in stage3-canonical-event-types.md.

3. **Subscriber Robustness** — Implement retry/failure handling patterns for subscribers that process events.

4. **Event Schema Governance** — Establish and enforce event payload schemas to prevent consumer breakage.

5. **Monitoring & Observability** — Add event tracing and metrics (emit rate, consumption lag, failure rates).

## Related Documentation

- `docs/events/stage3-canonical-event-types.md` — Canonical event type specifications
- `docs/events/events-inventory-v2-raw-observations.md` — Raw event observations
- `docs/events/README.md` — Events subpackage documentation
- `nexus/python/nexus_core/wrp/kernel.py` — WRP Kernel implementation
- `nexus/python/nexus_core/wrp/addressing.py` — Address routing implementation
- `nexus/python/nexus_core/wrp/identity.py` — Identity emission implementation
- `nexus/python/nexus_core/wrp/states.py` — State transition logic