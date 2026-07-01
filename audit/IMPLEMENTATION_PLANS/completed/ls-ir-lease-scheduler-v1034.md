# LS-IR: Lease Scheduler Intermediate Representation

**Project:** nexus/python/ir
**Plan Number:** v0138
**Status:** completed — implemented 2026-06-28. 64 new tests, 179 total IR tests pass. Uses real RoleLease from RL-IR (no stub). WorkSurface emits PromotionReceipts on ingest. DispatchEvent carries PromotionReceipt on every dispatch. LeaseBinding stores entry_id for correct preemption→retry chain. Scheduler.cycle() runs ingest→preempt→process_unassigned→process_deferred. Deprecation notice added to meep/scheduler.py.
**Source:** Event-Driven CLI Agents harvest (`67853dbb-...`) — candidate `520a3a78`

## Goal

Build a deterministic control kernel that maps event-derived intent onto a constrained pool of RoleLeases. Replace MEEP's simple topological executor with an indexed, queryable `WorkSurface` + arbitration engine + lease pool manager. The scheduler is deterministic: same events, same leases, same outcome.

## Architectural Problem

MEEP's `scheduler.py` executes a frozen `ExecutionGraph` in topological order: for each node, emit `NODE_START`, simulate handler, emit `NODE_COMPLETE`. This works for a single DAG but:

- **No lease abstraction** — nodes execute in-process, not dispatched to capability-bounded contexts
- **No arbitration** — every node runs; there's no selection among candidates
- **No preemption or capacity management** — infinite resources assumed
- **FIFO semantics** — topological order is the only ordering; no prioritization
- **No deferred frontier** — nodes that can't run are silently skipped, not tracked for retry

The spec defines LS-IR as: *"A deterministic control kernel mapping local event-derived intent onto a constrained pool of RoleLeases. Replaces NATS/broker systems, worker queue systems, agent routing systems, event subscription logic, task schedulers, and work stealing logic."*

## Target Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Promotion Boundary                           │
│                                                                   │
│  CausalEvent ──[ingest]──► WorkSurface (status=UNASSIGNED)        │
│       │                                       │                   │
│       │  PromotionReceipt:                    │                   │
│       │  "Promoted CausalEvent(evt-001)       │                   │
│       │   into WorkSurface entry              │                   │
│       │   stage=ingest"                       │                   │
│       │                                       │                   │
│  WorkSurface entry ──[dispatch]──► DispatchEvent                  │
│       │                                       │                   │
│       │  PromotionReceipt:                    │                   │
│       │  "Promoted WorkSurface entry          │                   │
│       │   into DispatchEvent                   │                   │
│       │   lease={lease_id}                     │                   │
│       │   stage=dispatch"                      │                   │
│       └───────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    LS-IR Scheduler                        │
│                                                           │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │  WorkSurface  │   │  LeasePool   │   │ Arbitration  │  │
│  │  (indexed)    │   │  (idle/active)│   │   Engine     │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  │
│         │                  │                   │          │
│         └──────────────────┼───────────────────┘          │
│                            │                              │
│                    ┌───────▼────────┐                     │
│                    │  Policy Engine  │                     │
│                    │  (allow/deny)   │                     │
│                    └───────┬────────┘                     │
│                            │                              │
│                    ┌───────▼────────┐                     │
│                    │   Dispatcher    │                     │
│                    │  + PromotionRec │                     │
│                    └────────────────┘                     │
│                                                           │
│  Main loop:                                               │
│    poll events → add to WorkSurface                       │
│    for each unassigned event:                             │
│      select idle leases → score → policy check → dispatch │
│    monitor capacity, enforce preemption, emit telemetry   │
└──────────────────────────────────────────────────────────┘
```

### Promotion Model (not extension)

LS-IR sits at the terminal end of the promotion chain.  Its promotions are:

1. **CausalEvent → WorkSurface entry**: When an event enters the scheduler,
   it's promoted from a raw causal event into an indexed, queryable intent
   surface entry with status `UNASSIGNED`.  A `PromotionReceipt` records
   the ingestion.

2. **WorkSurface entry → DispatchEvent**: When arbitration selects a lease
   and the dispatcher binds the event to it, the entry is promoted into a
   `DispatchEvent`.  The `PromotionReceipt` records which lease was
   selected, the arbitration score, and sets `lease_time` on the event's
   `TimeModel`.

Together, these complete the end-to-end promotion chain:

```
NBK Edge → CausalEdge → CausalEvent → WorkSurface → DispatchEvent
  (TEM-IR)              (TEM-IR)         (LS-IR)         (LS-IR)
```

The full IR receipt chain is:

```
Trace → StateVersion → CausalEdge → CausalEvent → EventProjection →
IntentGraph → PromptIR → RoleLease → WorkSurface → DispatchEvent
```

## Files Affected

### CREATE

| File | Purpose |
|---|---|
| `nexus/python/ir/work_surface.py` | `WorkSurface` — indexed, queryable intent surface (not FIFO queue) |
| `nexus/python/ir/lease_pool.py` | `LeasePool` — tracks idle/active leases, capacity, preemption |
| `nexus/python/ir/arbitration_engine.py` | `ArbitrationEngine` — weighted scoring: capability fit × load × priority |
| `nexus/python/ir/dispatcher.py` | `Dispatcher` — binds event to lease, sets lease_time, emits dispatch events |
| `nexus/python/ir/scheduler.py` | `Scheduler` — main loop: poll → work surface → arbitration → dispatch → monitor |
| `nexus/python/ir/tests/test_work_surface.py` | Unit tests: add, query, unassigned, deferred frontier |
| `nexus/python/ir/tests/test_lease_pool.py` | Unit tests: acquire, release, idle/active tracking, capacity limits |
| `nexus/python/ir/tests/test_arbitration.py` | Unit tests: scoring, argmax, deterministic ties |
| `nexus/python/ir/tests/test_dispatcher.py` | Unit tests: bind, dispatch event, lease_time assignment |
| `nexus/python/ir/tests/test_scheduler.py` | Integration tests: full loop with events, leases, dispatch |

### MODIFY

| File | Purpose |
|---|---|
| `nexus/python/ir/__init__.py` | Added LS-IR exports (WorkSurface, LeasePool, ArbitrationEngine, Dispatcher, Scheduler) |
| `nexus/python/meep/scheduler.py` | Add deprecation notice pointing to `ir.scheduler`; keep for backward compat |

### NO REMOVAL

## Acceptance Criteria

- [x] `WorkSurface.add(event)` adds an event to the intent surface with status `UNASSIGNED` and emits a `PromotionReceipt`
- [x] `WorkSurface.unassigned()` returns all events with status `UNASSIGNED`, ordered by priority (desc) then causal_epoch
- [x] `WorkSurface.defer(entry_id, reason, retry_after_seconds)` moves an entry to `DEFERRED` with a retry timestamp
- [x] `WorkSurface.deferred_due()` returns deferred entries whose retry time has passed
- [x] `WorkSurface.query(filters)` supports filtering by: event_type, priority_range, causal_epoch, tags, status
- [x] `LeasePool` tracks idle/active leases via `LeaseSlot`, with `idle_leases()`, `active_leases()`, `idle_slots()`
- [x] `LeasePool.acquire(lease_id, event)` marks lease as active, returns `LeaseBinding` (frozen, with `entry_id` for retry)
- [x] `LeasePool.release(lease_id)` returns lease to idle, updates telemetry
- [x] `ArbitrationEngine.score(lease, event, load)` returns weighted float: `alpha*capability_fit + beta*(1-load) + gamma*priority`
- [x] `ArbitrationEngine.select(leases, event)` returns the highest-scoring lease, or None if all denied
- [x] Arbitration uses `argmax`, not sort-and-pick (deterministic: first-valid wins ties)
- [x] `ArbitrationEngine.select_with_load(slots, event)` scores using slots with per-slot load info
- [x] `Dispatcher.dispatch(event, lease, score)` creates `DispatchEvent`, sets `lease_time` on event's `TimeModel`, emits `PromotionReceipt`
- [x] `DispatchEvent.from_arbitration(event, lease, score)` creates a `DispatchEvent` with a full `PromotionReceipt` (stage="dispatch")
- [x] `DispatchEvent` carries `promotion_receipt: PromotionReceipt` with lease_id, role, score, capabilities
- [x] `Scheduler.ingest(events)` adds events to WorkSurface, returns entries
- [x] `Scheduler.cycle(events)` runs one main loop: ingest → preempt → process_unassigned → process_deferred
- [x] `Scheduler.run(event_source)` runs the main loop polling an event source
- [x] Scheduler is deterministic: same input (events + leases) → same dispatch order (argmax, priority+epoch sort)
- [x] Preemption: high-priority events can preempt low-priority active leases (`LeasePool.preemption_enabled`, configurable, disabled by default)
- [x] All unit + integration tests pass: 179 total (SM-IR 34 + TEM-IR 37 + RL-IR 44 + LS-IR 64)

## Dependencies

*All dependencies are fulfilled — all three upstream IR layers are built.*

- `nexus/python/ir/promotion_receipt.py` (shared) — `PromotionReceipt` for ingest and dispatch receipts
- `nexus/python/ir/causal_event.py` (TEM-IR, built) — `CausalEvent` with `time_model` (lease_time set at dispatch)
- `nexus/python/ir/role_lease.py` (RL-IR, built) — real `RoleLease` with `CapabilitySet`, `RoleDefinition`, `ExecutionContext`
- `nexus/python/ir/state_view.py` (SM-IR) — `StateView` for lease capability scoping (v2, not blocking)
- `nexus/python/ir/state_dag.py` (SM-IR) — optional; WorkSurface can also index on StateVersion
- Python 3.11+ stdlib + `dataclasses`

## Implementation Notes

### 1. WorkSurface is NOT a Queue

The key insight from the spec: *"WorkSurface is an indexed, queryable intent surface, not a FIFO queue."* This means:

- Events are indexed by type, priority, causal epoch, and tags
- Query, don't pop — events persist on the surface until dispatched or explicitly deferred/resolved
- `unassigned()` returns all pending events; the scheduler decides which to process next
- Support for deferred nodes (can't bind now, retry later)

### 2. Arbitration Formula

```
score = α × capability_fit(lease, event) + β × (1 - lease.load) + γ × event.priority
```

Where:
- `capability_fit`: lease's capabilities ∩ event's required capabilities
- `lease.load`: 0.0 (idle) to 1.0 (fully loaded)
- `event.priority`: extracted from `CausalEvent.priority` or default

Weights (`α`, `β`, `γ`) are configurable, defaulting to `0.5, 0.3, 0.2`.

### 3. Real RoleLease (RL-IR integration)

LS-IR consumes the real `RoleLease` type from RL-IR (v0139, already built).
No stub needed. The `LeasePool` reads `lease_id`, `role`, `capabilities`,
and `execution` from the `RoleLease` via duck-typed attribute access —
works identically whether the lease was compiled by `LeaseCompiler` or
constructed directly. `Dispatcher.dispatch()` reads `lease.execution`
to configure the runtime harness, and `ArbitrationEngine` reads
`lease.capabilities` (a `CapabilitySet`) for capability-fit scoring.

### 4. Deterministic Dispatch

The scheduler is deterministic: given the same `WorkSurface` state, same `LeasePool` state, and same `CausalGraph`, it always produces the same dispatch order. This is achieved by:

- `argmax` (first valid wins ties), not sort-and-pick
- No random tie-breaking
- No wall-clock-dependent decisions
- Causal epoch as secondary sort when scores tie

### 5. Deferred Frontier

Events that can't bind to any lease (wrong capabilities, lease pool exhausted, policy denies) move to the `DEFERRED` frontier with a retry timestamp. The scheduler re-evaluates deferred events each cycle.

### 6. Preemption (Configurable)

If enabled, high-priority events can preempt lower-priority active leases. The preempted lease's event goes back to `UNASSIGNED` (not `DEFERRED` — it was never the event's fault). Disabled by default in v1.

### 7. Main Loop (Scheduler)

Actual implementation uses `cycle()` as the core loop unit:

```python
def cycle(self, events=None):
    if events:
        self.ingest(events)          # emits PromotionReceipt(stage="ingest")

    # Preemption: check if high-priority events should preempt active leases
    for entry in self.work_surface.unassigned():
        reqd = self.process_preemption(entry)  # returns preempted entry_id or None
        if reqd:
            self.work_surface.retry(reqd)

    # Process unassigned entries
    de = self.process_unassigned()    # defers or dispatches; emits PromotionReceipt(stage="dispatch")

    # Retry deferred entries whose time has come
    self.process_deferred()           # moves due entries back to UNASSIGNED

    return telemetry dict
```

`process_unassigned()` defers entries when no idle leases exist or policy
denies all candidates, and dispatches via `Dispatcher.dispatch(event, lease, score)`
which acquires the lease, creates a `DispatchEvent` with `PromotionReceipt`,
and marks the WorkSurface entry as `DISPATCHED`.

`process_deferred()` retries entries whose `defer_until` timestamp has passed
by moving them back to `UNASSIGNED` — they're processed on the next cycle's
`process_unassigned()` call.

`process_preemption()` calls `LeasePool.find_preemption_target(priority)` to
find the lowest-priority active binding, then `LeasePool.preempt(slot)` to
release it and return the `entry_id` for `work_surface.retry()`.

### 8. Test Strategy

- **test_work_surface.py**: Add events, query by type/priority, defer and retry, verify ordering
- **test_lease_pool.py**: Acquire/release, idle/active tracking, capacity exhaustion
- **test_arbitration.py**: Score calculation, select best, policy denies, deterministic ties
- **test_dispatcher.py**: Bind event to lease, set lease_time, create dispatch event
- **test_scheduler.py**: Full loop with mock event source, mock lease pool, verify dispatch order
