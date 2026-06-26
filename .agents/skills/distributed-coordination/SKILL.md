> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
---
name: distributed-coordination
phase: execution
status: implemented
---

# Distributed Coordination Skill

## Purpose
Provides the claim protocol, lease management, and host liveness detection required for the distributed scheduler. This is a sub-skill called by the execution-scheduler during each tick when operating in distributed mode.

In single-host mode, this skill is not invoked — the scheduler transitions directly from `ready` to `bound`.

## References
- [Spec: Distributed Scheduler v1 §6–7](../docs/DISTRIBUTED_SCHEDULER.md)
- [Schema: Execution Graph Schema v2 §6, §8.14](../docs/EXECUTION_GRAPH_SCHEMA.md)
- [Event Grammar v2 §3.2](../docs/EVENT_GRAMMAR.md)

## Input
- `node: ExecutionNode` — must be in `ready` state
- `host_id: HostID` — identity of the local scheduler instance
- `event_log: EventLog` — shared append-only event log (read + append)
- `lease_duration_ms: int` — from `EG.meta.distributed.lease_duration_ms`
- `host_capabilities: Set<Capability>` — executors available on this host

## Output
- Claim result: `ClaimWon | ClaimLost | ClaimExpired`
- State transitions: `ready → claimed` (on successful claim)
- Events emitted to the shared event log

## Execution

### Step 1: Check host capability
Before attempting a claim, verify the host can execute this node:

```
if node.executor_selection.executorId ∉ host_capabilities:
    skip node — not executable on this host
```

### Step 2: Attempt claim
Emit a `NodeClaimed` event to the shared event log:

```
lease_id = generateUUID()
lease_expiration = now() + lease_duration_ms

emit: NodeClaimed {
    node_id: node.id,
    host_id: host_id,
    lease_id: lease_id,
    lease_expiration: lease_expiration,
    timestamp: now()
}
```

### Step 3: Observe event log
After emitting, observe the event log to check if this claim won:

```
function resolve_claim(node_id, host_id, lease_id, event_log):
    all_claims = [e for e in event_log if e.type == "NodeClaimed" and e.node_id == node_id]

    if len(all_claims) == 0:
        return ClaimLost // race condition — our event not yet visible

    earliest = min(all_claims, key=lambda e: e.timestamp)

    if earliest.host_id == host_id and earliest.lease_id == lease_id:
        return ClaimWon
    else:
        return ClaimLost
```

### Step 4: Handle result

| Result | Action |
|---|---|
| `ClaimWon` | Transition `ready → claimed`. Store `claim { lease_id, host_id, lease_expiration }` on node. |
| `ClaimLost` | Do nothing — node stays `ready`. Another host will execute it. Scheduler moves to next node. |

### Step 5: Maintain lease
While a claim is held:

- Periodically emit `HostHeartbeat` events to signal liveness
- If the node has not transitioned to `bound` before `lease_expiration`, re-emit `NodeClaimed` with renewed lease
- If execution completes before expiry, emit `NodeReleased` to voluntarily release

```
if now() > lease_expiration AND node.lifecycle_state == claimed:
    // Lease expired without transition to bound
    emit: LeaseExpired { node_id, host_id, lease_id }
    transition: claimed → ready
```

## Liveness Detection

### HostHeartbeat

Each host emits a heartbeat on a periodic interval:

```
emit: HostHeartbeat {
    host_id: host_id,
    timestamp: now(),
    load: { claimed_count, running_count, queued_count },
    capabilities: host_capabilities
}
```

**Interval**: `EG.meta.distributed.heartbeat_interval_ms` (default 5000ms).

### Crash Detection

The system detects a crashed host when:

```
now - last HostHeartbeat(host_id) > LEASE_DURATION_MS * 2
```

On detection, the system emits:

```
for each node claimed by host_id:
    emit: LeaseExpired { node_id, host_id, lease_id }
    transition: claimed → ready (local state)
```

**Note**: Since all hosts observe the same event log, any host may detect the crash and emit `LeaseExpired`. The first `LeaseExpired` event in the log wins — duplicates are idempotent.

## Voluntary Release

When a node completes execution (SUCCEEDED or FAILED), the host releases its claim:

```
emit: NodeReleased {
    node_id: node.id,
    host_id: host_id,
    lease_id: lease_id,
    reason: "completed | failed | aborted"
}
```

This is informational — the lease would expire naturally, but explicit release speeds up rescheduling.

## Error Handling

| Error | Response |
|---|---|
| Event log write failure | Retry with backoff, emit SystemError if exhausted |
| Claim conflict lost | Skip node, move to next ready node |
| Lease expired before bound | Re-attempt claim (with backoff to avoid thundering herd) |
| Host heartbeat write failure | Log warning, continue (lease will expire if persistent) |

## Constraints
- MUST NOT execute work
- MUST NOT transition lifecycle states other than `ready → claimed` and `claimed → ready`
- Claim resolution MUST be deterministic given the same event log
- All emitted events MUST be idempotent (replaying claims is safe)
- `host_can_execute` MUST be checked before every claim attempt
