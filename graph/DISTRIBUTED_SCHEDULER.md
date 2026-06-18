>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Distributed Scheduler v1 — Multi-Host AST Interpreter

## 1. Conceptual Upgrade

Single-host scheduler:

```
ExecutionGraph
      ↓
Scheduler Loop
      ↓
Executor
```

Distributed scheduler:

```
                Shared Event Log
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   Scheduler A    Scheduler B    Scheduler C
      (Host 1)      (Host 2)      (Host N)
        │              │              │
   Executors      Executors      Executors
```

**Key principle**: The distributed scheduler is NOT a coordinator. It is multiple identical interpreters reading the same program state. This is distributed AST interpretation.

## 2. Formal Model

### 2.1 System Components

**Execution Program:**
```
EG = (N, E, M)
```
Where N = ExecutionNodes, E = dependency edges, M = metadata.

**Host:**
```
Host = {
  host_id: HostID,
  capabilities: Set<Capability>,
  executors: Set<Executor>
}
```

A host is simply a runtime capable of interpreting nodes.

**Distributed Runtime:**
```
DistributedRuntime = {
  execution_graph_store,
  event_log,
  scheduler_instances
}
```

### 2.2 Core Distributed Invariant

```
∀ node: executed_at_most_once
```

WITHOUT centralized locking. Achieved through event sourcing, optimistic claiming, and idempotent execution.

## 3. Distributed Scheduler Role

Each scheduler instance independently runs:

```
while true:
    derive_state(event_log)
    if executable_node_found():
        claim(node)
        acquire_executor(node)
        execute(node)
        emit_events(node)
```

There is no master scheduler. All instances are identical.

## 4. Extended Node Lifecycle

```
pending
  ↓
ready
  ↓
claimed(host_id)
  ↓
bound
  ↓
running
  ↓
completed | failed
```

`claimed(host_id)` is a new transient state between ready and bound. A node in `claimed` state is reserved by a specific host for a bounded duration (lease).

## 5. Shared State Model

All schedulers observe derived state from events.

### 5.1 Source of Truth

The event log is authoritative. Execution state is computed:

```
NodeState = fold(events)
```

No mutable shared memory exists between scheduler instances.

### 5.2 State Derivation via CER

Each scheduler independently rehydrates and replays the CER event log to compute the current ExecutionGraph state:

```python
function derive_state(cer_event_log, ccnf_version, collapse_engine_version, rehydration_version):
    rehydrated = rehydrate(
        cer_event_log,
        collapse_engine_version,
        rehydration_version
    )
    state = empty_graph()
    for event in rehydrated:
        state = apply(state, event)
    return state

# All hosts use the same version parameters → identical state
assert derive_state(log, HOST_A) == derive_state(log, HOST_B)
```

Since CER events are append-only, immutable, and CCNF-normalized, all schedulers derive identical state from identical event logs regardless of host environment. The `entity_key` in each event provides a globally stable identity that survives host failures and reconnections.

## 6. Claim Protocol

The claim protocol replaces distributed locking. It is an optimistic concurrency protocol using event log ordering.

### 6.1 Protocol

**Step 1 — Discover Ready Nodes**

Each scheduler independently computes:

```
READY(node) ⇔
    state(node) == ready
    AND node.executor_selection ∈ host.capabilities
    AND host has capacity
```

**Step 2 — Attempt Claim (CER Format)**

Scheduler emits a CER event to the event log:

```json
{
  "event_id": "uuid",
  "domain": "execution",
  "intent": { "action": "execute", "target_type": "node", "target_id": "node:EX-003" },
  "identity": {
    "entity_key": "SHA256(canonical_entity_signature)",
    "type": "event",
    "scope": "executiongraph.v2",
    "collapse_key": null,
    "alias_keys": []
  },
  "causality": { "parent_event_ids": ["...", "..."], "causal_chain_id": "uuid", "trace_depth": 5 },
  "payload": {
    "type": "structured",
    "data": {
      "node_id": "EX-003",
      "host_id": "host-1",
      "lease_id": "uuid",
      "lease_expiration": 1730000100
    }
  },
  "compression": { "strategy": "full", "lossless": true, "compression_version": 1 },
  "signature": { "hash": "SHA256 hex", "signed_by": "host-1" }
}
```

**Step 3 — Conflict Resolution**

If multiple hosts claim the same node, the winner is determined by event log ordering:

```
winner = earliest NodeClaimed event for node_id
```

All other hosts must abandon their claim upon observing a conflicting `NodeClaimed` with an earlier timestamp.

**Determinism rule:**
```
Claim ordering = event_log ordering
```

Since all hosts read the same event log, all hosts independently compute the same winner.

**Step 4 — Lease Ownership**

A claim is valid only while:

```
now < lease_expiration
```

If the lease expires before the node completes:

```
LeaseExpired → node returns to READY
```

### 6.2 Conflict Resolution Algorithm

```
on observe NodeClaimed(node_id, host_id, lease_id):
    current = get_current_claim(node_id)
    if current is None:
        accept_claim(node_id, host_id)
    else if event_id < current.event_id:
        // incoming claim is earlier in event log
        release_current()
        accept_claim(node_id, host_id)
    else:
        // incoming claim is later — our claim (if any) stands
        ignore
```

## 7. Lease Model

### 7.1 Formal Definition

```
Lease = {
    lease_id: UUID,
    host_id: HostID,
    node_id: ExecutionNodeId,
    expires_at: Timestamp
}
```

### 7.2 Properties

| Property | Guarantee |
|---|---|
| **Deadlock prevention** | Leases expire — no infinite hold |
| **Crash recovery** | Host crash → no heartbeats → lease expires → node rescheduled |
| **Preemption** | System MAY revoke lease via `LeaseExpired` event |

### 7.3 Default Lease Duration

```
LEASE_DURATION_MS = 30000  (configurable via EG.meta.distributed.lease_duration_ms)
```

### 7.4 Lease Renewal

A host MAY renew a lease by emitting a new `NodeClaimed` with a later expiration. Renewal restarts the conflict resolution — another host with an earlier claim wins.

## 8. Host Capability Model

### 8.1 Host-Can-Execute Predicate

```
host_can_execute(node) ⇔
    executor_selection ∈ host.capabilities
```

A host ignores nodes whose selected executor is not in its capability set. No routing layer is required.

### 8.2 Implications

- Heterogeneous hosts are supported natively (e.g., GPU host executes GPU nodes, CPU host executes CPU nodes)
- Hosts self-select work based on their capabilities
- No central dispatcher or work queue

## 9. Distributed Scheduler Interpreter

### 9.1 Interpreter Function

```
interpret_distributed(EG, Host) → EventStream
```

### 9.2 Main Loop

```
loop:
    S ← derive_state(event_log)

    R ← ready_nodes(S, Host)

    for node ∈ R:
        claim(node, Host.host_id)

        if claim_confirmed(node, event_log):
            acquire_executor(node)

            if executor_acquired:
                execute(node)

                emit_completion(node)
            else:
                release_claim(node)
        else:
            // claim lost — skip this tick
            continue
```

### 9.3 Tick Model (Distributed)

Each scheduler tick:

```
Tick:
    1. Derive state from event log
    2. Compute ready nodes (eligible + host_can_execute)
    3. Attempt claim for each ready node
    4. Process claim confirmations
    5. Execute confirmed claims (acquire → dispatch)
    6. Process runtime events from executors
    7. Commit transitions to event log
    8. Detect and handle expired leases
```

### 9.4 Tick Properties (Extended)

| Property | Single-Host | Distributed |
|---|---|---|
| Atomic | Yes | No — eventual consistency |
| Idempotent | Yes | Yes — claims are idempotent |
| Replayable | Yes | Yes — event log total order |

## 10. Fault Model (Distributed)

### 10.1 Host Crash

| Detection | Via missing `HostHeartbeat` events |
|---|---|
| System action | Emit `LeaseExpired` for all claims held by crashed host |
| Result | `claimed → ready` — node automatically rescheduled |
| Recovery | Host restarts, replays event log, rejoins |

```
on missing HostHeartbeat(host_id) for > LEASE_DURATION_MS:
    for each node claimed by host_id:
        emit: LeaseExpired { node_id, host_id }
        transition: claimed → ready
```

### 10.2 Executor Failure

Unchanged from single-host model:

```
ExecutionFailed → scheduler applies retry policy
```

### 10.3 Network Partition

Because execution is event-sourced:

- Partitioned hosts continue executing locally
- Reconciliation occurs via event log ordering
- At the point of partition healing, the event log determines the canonical order

**Guarantee**: Eventual convergence. All hosts reach identical state after the partition heals, because the event log is the single source of truth.

### 10.4 Duplicate Execution Prevention

Even under network partition, at-most-once execution is guaranteed because:

1. A node must be `claimed` before it can execute
2. Only one claim survives conflict resolution (earliest in event log)
3. The `executed_at_most_once` invariant is maintained by the claim protocol

## 11. Data Movement Model

```
Execution nodes reference artifacts: artifact://workspace/file
```

Schedulers do NOT move data. Executors resolve artifacts at execution time. This prevents scheduler bottlenecks.

## 12. Scalability

### 12.1 Horizontal Scaling

```
throughput ∝ number_of_hosts
```

without architecture change. This is horizontal AST interpretation.

### 12.2 Scaling Constraints

| Constraint | Bound |
|---|---|
| Event log write throughput | Writes to single log (append-only, partitionable) |
| Claim conflict rate | Inversely proportional to node count / host count |
| Executor availability | Per-host, independent |

## 13. Determinism Requirement (Distributed)

Distributed scheduling remains deterministic if:

1. Event log ordering is total
2. Node execution is idempotent
3. Claims use leases
4. State derived only from events

If all hold:

```
same event log ⇒ same execution result
```

## 14. Formal AST Extensions

### 14.1 ExecutionGraph Metadata Extension

```json
{
  "meta": {
    "distributed": {
      "lease_duration_ms": 30000,
      "heartbeat_interval_ms": 5000,
      "scheduling_strategy": "random | locality_first | capability_only"
    }
  }
}
```

### 14.2 ExecutionNode Runtime Extension

```json
{
  "runtime": {
    "executor_selection": { "executorId": "...", ... },
    "allowed_hosts": ["host-1", "host-2"],
    "locality_hint": {
      "data_affinity": "artifact://path/to/data",
      "preferred_host": "host-with-data"
    }
  }
}
```

## 15. Scheduler Soundness Guarantees

| Property | Guarantee | Mechanism |
|---|---|---|
| **Safety** | No node executes concurrently twice | Claim protocol + event log ordering |
| **Liveness** | Every ready node eventually executes | Lease expiration + re-claim |
| **Recovery** | Crashes do not lose progress | Event-sourced state, replayable |

## 16. New Events

| Event | Trigger | Payload |
|---|---|---|
| `NodeClaimed` | Host claims a node | `{ node_id, host_id, lease_id, lease_expiration }` |
| `NodeReleased` | Host voluntarily releases claim | `{ node_id, host_id, lease_id }` |
| `HostHeartbeat` | Periodic host liveness signal | `{ host_id, timestamp, load, claimed_node_count }` |
| `LeaseExpired` | Lease duration exceeded | `{ node_id, host_id, lease_id }` |

### 16.1 Validation Events

The distributed scheduler may also emit `ValidationFailure` events (see [`VALIDATOR_SPEC.md`](./VALIDATOR_SPEC.md)) when runtime validation rules (R2, R3, R8) detect distributed safety violations — claim ownership mismatches, lease expiry before binding, or double-claim attempts.

## 17. Event Log Requirements

The distributed scheduler requires:

| Requirement | Reason |
|---|---|
| **Total order** | Deterministic conflict resolution |
| **Append-only** | Immutable history, replayable |
| **Globally visible** | All hosts read all events |
| **Partition-tolerant** | Hosts must continue during network issues |

A CRDT-based append-only log or Kafka-style partitioned log satisfies these requirements.

### 17.2 Observation Layer Integration

The Phase 3 Observation Engine ([`OBSERVATION_MODEL.md`](./OBSERVATION_MODEL.md)) provides distributed system observability atop the event log:

- **Host activity maps**: which hosts executed which nodes, derived from HostHeartbeat + NodeClaimed events
- **Lease distribution**: how leases were balanced across hosts over time
- **Claim conflicts**: detection of two hosts attempting to claim the same node (log ordering determines winner)
- **Scheduler load balance**: node distribution across hosts, computed from replay state

These are semantic views produced by the Observation Engine, not raw events.

### 17.1 Replay Engine Integration

The event log produced by the distributed scheduler is consumed by the Replay Engine ([`REPLAY_ENGINE.md`](./REPLAY_ENGINE.md)) for temporal reconstruction. Key properties for distributed replay:

- Replay is agnostic to the number of schedulers — only event order matters
- Time-travel replay works identically across single-host and distributed execution
- Snapshots (CER-triggered) provide fast incremental replay instead of checkpoints
- The round-trip invariant `Replay(Rehydrate(trace(x))) = x` holds for distributed execution as well

## 18. Mental Model

```
Prompt Compiler
        ↓
WorkRequest IR
        ↓
Lowering Compiler
        ↓
ExecutionGraph (Program)
        ↓
Distributed Scheduler (Interpreter)
        ↓
Executors (Effect Handlers)
        ↓
Event Log (History)
```

This is a distributed programming language runtime — not a workflow engine.

---

## X. CER Identity in Distributed Mode

### X.1 entity_key as Global Node Identity

In distributed mode, `entity_key` provides a globally stable identity for every entity (nodes, graphs, leases, hosts). Unlike `node_id` (which may be host-local or session-scoped), `entity_key` is:

- Derived from CCNF canonical entity signature (no host-specific, time-specific, or environment-specific inputs)
- Identical across all hosts for the same entity
- Survives host failures and reconnections

```
∀ host A, host B:
    CCNF(entity, HOST_A).identity.entity_key == CCNF(entity, HOST_B).identity.entity_key
```

All distributed claims, leases, and conflict resolutions use `entity_key` alongside `node_id` for identity resolution.

### X.2 CER Signature for Cross-Host Verification

Every CER event carries a `signature.hash` — the SHA256 of the canonical serialization (CCNF Step 8). Receiving hosts verify:

```
on receive CER event from remote host:
    recomputed = SHA256(canonical_serialize(event))
    assert recomputed == event.signature.hash
    if mismatch → reject event, emit ValidationFailure { rule_id: "CER_SIGNATURE_MISMATCH", severity: FATAL }
```

This ensures:
- No tampering (accidental or intentional) between emission and observation
- No serialization drift across different host environments
- Every host can independently verify event integrity without trusting the emitter

### X.3 causal_chain_id as Distributed Agreement Scope

All hosts within a causal chain share the same identity namespace. The `causal_chain_id` defines the scope within which distributed agreement is required:

- Claims within the same `causal_chain_id` are resolved by event log ordering (as before)
- Claims across different `causal_chain_id` values are independent — no cross-chain conflict resolution needed
- Anti-collapse guard (Rule 4) cross-references `causal_chain_id` to prevent invalid identity merges in distributed mode
