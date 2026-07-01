# Event-to-Lease Execution Model (RL-IR)

**Project:** nexus/python/ir
**Plan Number:** v0139
**Status:** completed — implemented 2026-06-28. 115 tests pass (5 pipeline stages, ProvenanceGraph, CapabilitySet, LeaseLifecycle state machine, immutable frozen dataclasses with tuple/frozenset fields).
**Source:** Event-Driven CLI Agents harvest (`67853dbb-...`) — candidate `d2a224d4`

## Goal

Define the `RoleLease` primitive and the 4-layer compilation pipeline: Event → Projection → Prompt → Lease Execution. A `RoleLease` is an ephemeral, role-bound, capability-scoped execution context — the fundamental unit of work in the IR system. It replaces the idea of dispatching events to agents with compiling event slices into lease contexts.

## Architectural Problem

Currently, Cascade publishes events to NATS and the inference subscriber consumes them. MEEP executes frozen DAGs in-process. There's no unifying execution primitive — no concept of a bounded, capability-scoped, auditable execution context. Each system invents its own "run something" mechanism.

The spec defines RL-IR as: *"Inverts agent orchestration by compiling event slices into ephemeral, role-bound execution contexts. Events are state artifacts; system state is rehydratable from event logs. Architecture shifts from distributed message bus to role compiler over an event lattice."*

## Target Architecture

```
                     Raw Events (Cascade / CERLog)
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│           4-Layer Compilation Pipeline                        │
│                                                               │
│  Stage 1: Events ──[promoted_to]──► EventProjection          │
│    ┌─ PromotionReceipt: "Promoted {N} events into            │
│    │   EventProjection for role=builder, window=[t0,t1]"     │
│    ▼                                                         │
│  Stage 2: EventProjection ──[promoted_to]──► IntentGraph     │
│    ┌─ PromotionReceipt: "Compiled projection with {K}        │
│    │   events into IntentGraph ({M} intent nodes)"           │
│    ▼                                                         │
│  Stage 3: IntentGraph ──[promoted_to]──► PromptIR            │
│    ┌─ PromotionReceipt: "Compiled intent graph into          │
│    │   PromptIR for role={role}, tools=[...]"                │
│    ▼                                                         │
│  Stage 4: PromptIR ──[promoted_to]──► RoleLease              │
│    ┌─ PromotionReceipt: "Instantiated RoleLease              │
│    │   {lease_id} with capabilities {caps}"                  │
│    ▼                                                         │
│  Stage 5: RoleLease ──[promoted_to]──► Dispatch              │
│       PromotionReceipt: "Dispatched lease {lease_id}         │
│       to executor {executor_id} at {timestamp}"              │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                     RoleLease                                 │
│                                                               │
│  lease_id: UUID                                               │
│  status: PENDING | ACTIVE | COMPLETED | FAILED | PREEMPTED    │
│  projection: EventProjection     (which events)               │
│  prompt_ir: PromptIR             (what to do)                 │
│  role: RoleDefinition            (who can execute)            │
│  capabilities: CapabilitySet     (what it can access)         │
│  execution: ExecutionContext     (runtime harness)            │
│  constraints: ConstraintSet      (limits)                     │
│  lifecycle: LifecycleModel       (timeout, retry, TTL)        │
│  termination: TerminationSpec    (cleanup behavior)           │
│  observability: ObservabilitySpec (logging, metrics)          │
│  provenance: ProvenanceGraph     (chain of PromotionReceipts) │
└──────────────────────────────────────────────────────────────┘
```

### Promotion Model (not inheritance)

Each transition is a **promotion** — a compilation artifact, not a subtype
relationship. The original representation still exists and can be
re-promoted differently. A `RoleLease` is not a "bigger Lease" — it's the
result of a deterministic compilation pipeline applied to a raw `Lease`.

```
NBK Lease (simple binding)          ← reference interpreter
       │
       ▼  LeasePromotion              ← compilation step
       │
  RoleLease (rich execution context) ← production type
```

The `LeasePromotion` is the receipt that says: "I promoted representation
X (a Lease) into representation Y (a RoleLease)." Every stage in the
pipeline emits an immutable `PromotionReceipt`. The `ProvenanceGraph` is
simply the chain of these receipts.

## Files Affected

### CREATE

| File | Purpose |
|---|---|
| `nexus/python/ir/promotion_receipt.py` | `PromotionReceipt` — immutable receipt at each pipeline stage: "Promoted X into Y" |
| `nexus/python/ir/role_lease.py` | `RoleLease`, `RoleDefinition`, `CapabilitySet`, `ExecutionHarness`, `LeaseStatus` |
| `nexus/python/ir/event_projection.py` | `EventProjection` — selects relevant events from lattice for a role |
| `nexus/python/ir/intent_graph.py` | `IntentGraph` — structured intent derived from event projection |
| `nexus/python/ir/prompt_ir.py` | `PromptIR` — executable prompt marshaled for a lease harness |
| `nexus/python/ir/lease_compiler.py` | `LeaseCompiler` — 5-stage pipeline with `PromotionReceipt` at each stage: Project → Compile(Intent) → Compile(Prompt) → Instantiate → Execute → Emit → Terminate |
| `nexus/python/ir/lease_lifecycle.py` | `LeaseLifecycle` — state machine: PENDING→ACTIVE→COMPLETED/FAILED, timeout, retry, TTL |
| `nexus/python/ir/constraints.py` | `ConstraintSet`, `Constraint` — time, resource, capability, policy constraints |
| `nexus/python/ir/tests/test_promotion_receipt.py` | Unit tests: receipt creation, immutability, chain integrity |
| `nexus/python/ir/tests/test_role_lease.py` | Unit tests: creation, status transitions, serialization |
| `nexus/python/ir/tests/test_event_projection.py` | Unit tests: select events by role, time range, causal boundary |
| `nexus/python/ir/tests/test_lease_compiler.py` | Unit tests: full pipeline with receipt verification at each stage |
| `nexus/python/ir/tests/test_lease_lifecycle.py` | Unit tests: state machine, timeout, retry, TTL expiry |

### MODIFY

| File | Purpose |
|---|---|
| `nexus/python/ir/lease_pool.py` (LS-IR) | Replace `StubRoleLease` with real `RoleLease` from this module |
| `nexus/python/ir/dispatcher.py` (LS-IR) | Update dispatch to use real `RoleLease.execution` context |

### NO REMOVAL

## Acceptance Criteria

- [ ] `RoleLease` dataclass with all 13 fields from the spec, `frozen=True` post-instantiation
- [ ] `RoleDefinition` includes: `role_name`, `allowed_actions`, `default_capabilities`
- [ ] `CapabilitySet` is a set of capability strings with intersection/union/difference operations
- [ ] `LeaseStatus` enum: `PENDING`, `ACTIVE`, `COMPLETED`, `FAILED`, `PREEMPTED`, `EXPIRED`
- [ ] `LeaseCompiler.compile(event_slice, role)` runs the full 4-layer pipeline
- [ ] `EventProjection.select(events, role, time_range, causal_boundary)` returns filtered events
- [ ] `IntentGraph.from_events(projection)` produces a structured intent graph
- [ ] `PromptIR.from_intent(intent_graph, role)` produces executable prompt IR
- [ ] `LeaseCompiler.instantiate(prompt_ir, role)` creates a `RoleLease` with runtime context
- [ ] `LeaseLifecycle` state machine: valid transitions are `PENDING→ACTIVE→COMPLETED`, `PENDING→EXPIRED`, `ACTIVE→FAILED`, `ACTIVE→PREEMPTED`
- [ ] `LeaseLifecycle.apply_timeout(lease)` transitions `ACTIVE` leases past their TTL to `EXPIRED`
- [ ] `ConstraintSet.check(lease, action)` returns `True` if the action is allowed under all constraints
- [ ] `RoleLease` serializes to/from JSON (for persistence and dispatch across processes)
- [ ] `ProvenanceGraph` is built from a chain of `PromotionReceipt` objects, not raw references
- [ ] Each pipeline stage emits a `PromotionReceipt(from_type, from_id, to_type, to_id, metadata)`
- [ ] `PromotionReceipt` is `frozen=True` — immutable after creation
- [ ] `PromotionReceipt` chain can be traversed backwards: RoleLease → PromptIR → IntentGraph → EventProjection → Events
- [ ] `PromotionReceipt.serialize()` produces a deterministic JSON representation
- [ ] Replay: given the same events and role, the same `PromotionReceipt` chain is produced (deterministic compilation)
- [ ] All unit tests pass: `pytest nexus/python/ir/tests/ -v -k "promotion or lease or projection or compiler or lifecycle"`

## Dependencies

- `nexus/python/ir/causal_event.py` (TEM-IR) — `CausalEvent` feeds into `EventProjection`
- `nexus/python/ir/state_view.py` (SM-IR) — State read-capability for lease execution
- `nexus/python/ir/lease_pool.py` (LS-IR) — `LeasePool` consumes `RoleLease` objects
- `nexus/python/ir/dispatcher.py` (LS-IR) — `Dispatcher` reads `RoleLease.execution` to invoke harness
- Python 3.11+ stdlib + `uuid`

## Implementation Notes

### 1. PromotionReceipt

The foundational type for the compilation pipeline:

```python
@dataclass(frozen=True)
class PromotionReceipt:
    receipt_id: str                    # UUID
    from_type: str                     # e.g., "CausalEvent", "EventProjection"
    from_id: str                       # ID of the source representation
    to_type: str                       # e.g., "EventProjection", "IntentGraph"
    to_id: str                         # ID of the promoted representation
    stage: str                         # "project", "compile_intent", "compile_prompt", "instantiate", "dispatch"
    metadata: dict                     # stage-specific: event_count, intent_node_count, role, etc.
    timestamp: datetime
    compiler_version: str              # deterministic: ensures replay produces same receipts

    def description(self) -> str:
        """Human-readable: 'Promoted 3 CausalEvents into EventProjection for role=builder'"""
        ...
```

### 2. 5-Stage Pipeline with Promotion Receipts

```python
class LeaseCompiler:
    def compile(self, event_slice: list[CausalEvent], role: RoleDefinition) -> tuple[RoleLease, ProvenanceGraph]:
        receipts: list[PromotionReceipt] = []

        # Stage 1: Events → EventProjection
        projection = EventProjection.select(event_slice, role)
        receipts.append(PromotionReceipt(
            from_type="CausalEvent",
            from_id=",".join(e.event_id for e in event_slice),
            to_type="EventProjection",
            to_id=projection.projection_id,
            stage="project",
            metadata={"event_count": len(event_slice), "role": role.role_name, "relevance_scores": projection.relevance_scores},
        ))

        # Stage 2: EventProjection → IntentGraph
        intent_graph = IntentGraph.from_events(projection)
        receipts.append(PromotionReceipt(
            from_type="EventProjection",
            from_id=projection.projection_id,
            to_type="IntentGraph",
            to_id=intent_graph.graph_id,
            stage="compile_intent",
            metadata={"intent_node_count": len(intent_graph.nodes), "role": role.role_name},
        ))

        # Stage 3: IntentGraph → PromptIR
        prompt_ir = PromptIR.from_intent(intent_graph, role)
        receipts.append(PromotionReceipt(
            from_type="IntentGraph",
            from_id=intent_graph.graph_id,
            to_type="PromptIR",
            to_id=prompt_ir.prompt_id,
            stage="compile_prompt",
            metadata={"role": role.role_name, "tools": prompt_ir.tools},
        ))

        # Stage 4: PromptIR → RoleLease
        lease = self.instantiate(prompt_ir, role)
        receipts.append(PromotionReceipt(
            from_type="PromptIR",
            from_id=prompt_ir.prompt_id,
            to_type="RoleLease",
            to_id=lease.lease_id,
            stage="instantiate",
            metadata={"capabilities": list(lease.capabilities), "role": role.role_name},
        ))

        # Build provenance graph from receipt chain
        provenance = ProvenanceGraph.from_receipts(receipts)
        lease = replace(lease, provenance=provenance)

        return lease, provenance
```

### 2. EventProjection

The `EventProjection` is not a materialization — it's a *filter* over the event lattice. Given a role, it selects which events are relevant based on:

- **Role capabilities**: does this role have permission to act on this event type?
- **Time range**: only events within the projection window
- **Causal boundary**: only events causally reachable from the role's last known state version

```python
@dataclass(frozen=True)
class EventProjection:
    events: list[CausalEvent]
    role: RoleDefinition
    causal_boundary: set[str]  # event IDs at the boundary
    time_range: tuple[datetime, datetime]
    relevance_scores: dict[str, float]  # event_id → relevance
```

### 3. PromptIR

The `PromptIR` is the marshaled form of the intent graph, ready for the execution harness. It's role-specific — a `builder` lease gets code-generation prompts, an `architect` lease gets design-analysis prompts, etc.

```python
@dataclass(frozen=True)
class PromptIR:
    prompt_id: str
    role: str
    system_prompt: str
    task_description: str
    context: dict  # structured context from intent graph
    expected_output_schema: dict | None
    constraints: list[str]
    tools: list[str]  # MCP tool names available to this lease
```

v1: `PromptIR` is a data structure only. The actual LLM invocation happens in the execution harness (out of scope for this plan).

### 4. ExecutionHarness

The execution harness is what actually runs the lease. v1 defines the interface but defers implementation:

```python
class ExecutionHarness(ABC):
    @abstractmethod
    def execute(self, lease: RoleLease, prompt: PromptIR) -> LeaseResult:
        ...
```

v1 ships a `NoopHarness` that returns a placeholder result. Real harnesses (CLI harness, LLM harness, subprocess harness) come in follow-up plans.

### 6. ProvenanceGraph (built from PromotionReceipts)

Every `RoleLease` carries a `ProvenanceGraph` — a chain of `PromotionReceipt`
objects that records every compilation step:

```
PromotionReceipt #1: CausalEvent → EventProjection
PromotionReceipt #2: EventProjection → IntentGraph
PromotionReceipt #3: IntentGraph → PromptIR
PromotionReceipt #4: PromptIR → RoleLease
PromotionReceipt #5: RoleLease → Dispatch (added at dispatch time)
```

The chain is traversable in both directions:
- **Forward**: "What did this event become?"
- **Backward**: "Where did this RoleLease come from?" (traverse the `from_id` chain)

```python
class ProvenanceGraph:
    receipts: list[PromotionReceipt]  # ordered by stage

    def trace_backward(self, lease_id: str) -> list[PromotionReceipt]:
        """Given a lease, reconstruct: lease → prompt → intent → projection → events."""
        ...

    def trace_forward(self, event_id: str) -> list[PromotionReceipt]:
        """Given an event, trace: event → projection → ... → lease."""
        ...
```

This makes every lease fully auditable — you can trace "what events triggered
this, what intent was derived, what prompt was compiled, what was executed."

### 6. Integration with LS-IR

Once this plan is complete, `ls-ir/lease_pool.py` replaces its `StubRoleLease` with the real `RoleLease` from this module. The `Dispatcher` reads `lease.execution` to invoke the harness. The `ArbitrationEngine` reads `lease.capabilities` for capability-fit scoring.

### 7. ExecutionResult

```python
@dataclass(frozen=True)
class LeaseResult:
    lease_id: str
    status: LeaseStatus
    output: any
    events_emitted: list[CausalEvent]
    state_mutations: list[StateDelta]  # for SM-IR integration
    duration_ms: float
    error: str | None
```

### 8. Test Strategy

- **test_role_lease.py**: Create leases, verify immutability, status transitions, serialization
- **test_event_projection.py**: Filter events by role, time range, causal boundary
- **test_lease_compiler.py**: Full pipeline with mock events, verify each layer's output
- **test_lease_lifecycle.py**: State machine transitions, timeout, retry, TTL
