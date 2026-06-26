# Collapse Roadmap — Implementation Specification

**Governed by:** Plan #020 (collapse-plan-roadmap)
**Status:** Active — Phase 1 in progress
**Last updated:** 2026-06-20

---

## 0. Why This Spec Exists

The system is **over-modeled and under-steered.** There are 27 approved architectural
plans, a 7-layer compiler contract, multiple overlapping representations (replay kernel
world, graph mutation world, semantic IR world), and no end-to-end working path that
takes a trivial prompt and produces a replayable event log.

This spec defines the **collapse** — a strict build order that freezes conceptual growth
and builds a spine through the existing architecture.

---

## 1. Dependency Direction (Non-Negotiable)

All implementation MUST respect this dependency chain:

```
IRL → IR → Compiler → Execution → CER → Replay → Observation → Distribution
```

**Rule:** No component may depend on anything to its right. Observation NEVER depends on
Distribution. Replay NEVER depends on Observation. CER NEVER depends on Replay.

**Enforcement:** Any plan or spec that violates this direction is superseded by this
roadmap. If an existing component violates this direction, it must be refactored or
quarantined.

---

## 2. Phase Definitions

### Phase 0 — Freeze Conceptual Growth

**Goal:** No new specs, ontologies, types, or architectural abstractions unless they map
directly to executable surface (code that runs).

**What's frozen:**
- All 27 approved plans — accepted as-is, no further elaboration
- All candidate plans in `audit/ROVER/processed/harvests/` — filed for reference only
- All ontology extensions — no new node types, edge types, or archetypes
- All new pipeline phases or layers
- The Nebula, VQL, Memory Consolidation, and Time-Travel Visualizer candidates

**What's in-bounds:**
- Implementation specs that decompose approved plans into buildable work items
- Bug fixes, test hardening, CI/CD improvements
- Data type refinements that enable the vertical slice (not ontology expansion)
- Refactoring that respects the dependency direction

**Boundary marker:** Any proposal that adds a new concept, type, or architectural layer
without also producing executable code that runs end-to-end is rejected.

---

### Phase 1 — Vertical Slice (Active)

**Goal:** A single end-to-end path from a trivial text prompt to a replayable event log.

```
Prompt → IRL classifier → IR resolver → Spec compiler → Lowering pass → Scheduler → CER event log → Replay engine
```

Each station is a pure function or deterministic state machine. The output of each
station is the input of the next. No branching, no distribution, no observation layer.

**Acceptance criteria:**
- [ ] `echo "hello" | python meep/cli.py` produces a complete, valid CER event log
- [ ] The CER log can be replayed deterministically to reconstruct execution state
- [ ] Replay of the same log always produces the same state (determinism proven)
- [ ] The freeze boundary is enforced: ExecutionGraph is immutable after lowering
- [ ] All events are append-only: never modified, never deleted, never reordered

**What's in scope:**
- A single Python project under `nexus/python/meep/` with zero external dependencies
  (stdlib only except dataclasses-json)
- 6 stations (defined below), each independently testable
- End-to-end smoke test

**What's out of scope:**
- Observation/dashboard UI
- Distributed execution
- Real LLM integration (heuristic IRL is fine for v1)
- Production hardening, error recovery, persistence beyond the CER log

---

### Phase 2 — Compiler Hardening

**Goal:** Replace heuristics with structured models. IRL becomes a typed vector space;
IR becomes a deterministic projection engine.

**Triggers:** Phase 1 is stable and passing on 10+ diverse prompts.

**Key deliverables:**
- IRL: structured feature vector (not keyword heuristics)
- IR: deterministic projection with formal type constraints
- Compiler: schema-validated WorkRequestGraph generation
- Freeze boundary: schema-validated ExecutionGraph with typed edges

---

### Phase 3 — Execution as Kernel

**Goal:** The scheduler becomes an interpreter loop over immutable ExecutionGraph bytecode.

**Triggers:** Phase 2 compiler hardening complete.

**Key deliverables:**
- ExecutionGraph as an immutable, serializable bytecode format
- Scheduler as a pure interpreter (no side effects during execution)
- All state transitions are CER events; no hidden state
- Determinism proven by construction (not just by test)

---

### Phase 4 — Observation Layer

**Goal:** Read-only observation over the immutable event log. NEVER affects execution.

**Triggers:** Phase 3 execution kernel is proven correct.

**Key deliverables:**
- Projection layer that derives views from CER events
- Replay engine that reconstructs state at any point in time
- Observation queries that never block or influence execution
- Proven: any observer sees the same state for the same event log

---

### Phase 5 — Distribution

**Goal:** Replay engine replicated across machines. Optional, last.

**Triggers:** All prior phases stable and production-hardened.

**Key deliverables:**
- Consensus-free replay (determinism makes it partitionable)
- Event log replication with causal consistency
- No distributed scheduler — each node replays independently

---

## 3. Phase 1 — Station Definitions

### Station 1: IRL Classifier

**Input:** Raw text prompt (`str`)
**Output:** `IRLResult` — dict of archetype → probability

```
class IRLResult:
    probabilities: dict[str, float]  # archetype → confidence [0.0, 1.0]
    raw_input: str
    classifier_version: str
```

**Behavior:**
- Keyword-based heuristic: scan prompt for trigger words matching known archetypes
- Returns a probability distribution over archetypes (never a single answer)
- Must always sum to 1.0 (or very close)
- If no keywords match, return high-probability for DEFAULT archetype

**Archetypes (frozen set — Phase 0):**
```
CONSTRUCTION, EXECUTION, REFLECTION, RECONCILIATION, REVISION, COUNTERFACTUAL, AUDIT, COMPRESSION, CONSTRAINT_INJECTION
```

**Tests:**
- [ ] `"hello world"` → DEFAULT at 0.9+
- [ ] `"fix the bug in ServiceBroker"` → REVISION at 0.5+
- [ ] `"why did this happen"` → REFLECTION at 0.5+
- [ ] Output always sums to ~1.0

---

### Station 2: IR Resolver

**Input:** `IRLResult`
**Output:** `IRSelection` — single deterministic archetype + confidence threshold

```
class IRSelection:
    archetype: str
    confidence: float
    alternatives: list[str]  # other viable archetypes above threshold
```

**Behavior:**
- Argmax over IRL probabilities
- If max probability < min_confidence_threshold (0.4), return REJECT
- Preserves alternatives for diagnostics

**Tests:**
- [ ] Argmax selects highest-probability archetype
- [ ] Below-threshold input → REJECT
- [ ] Always deterministic (same IRLResult → same IRSelection)

---

### Station 3: Spec Compiler

**Input:** `IRSelection` + original `prompt`
**Output:** `WorkRequestGraph`

```
class WorkRequestGraph:
    nodes: list[WorkNode]
    edges: list[WorkEdge]
    metadata: dict

class WorkNode:
    id: str
    label: str
    archetype: str
    inputs: list[str]
    outputs: list[str]

class WorkEdge:
    source_id: str
    target_id: str
    relation: str  # "depends_on" | "triggers" | "produces"
```

**Behavior:**
- Rule-based decomposition of IR archetype into a small DAG (1–5 nodes for v1)
- Each node represents a unit of work with explicit inputs/outputs
- Edges represent dependency/trigger relationships

**Tests:**
- [ ] A REVISION selection produces at least one WorkNode
- [ ] All edges connect existing nodes
- [ ] Graph is acyclic
- [ ] Graph is connected (single entry and exit)

---

### Station 4: Lowering Pass (Freeze Boundary)

**Input:** `WorkRequestGraph`
**Output:** `ExecutionGraph`

```
class ExecutionGraph:
    nodes: list[ExecNode]
    edges: list[tuple[str, str]]  # (source_id, target_id) — frozen
    topological_order: list[str]  # computed once, frozen
    schema_version: str
    frozen_at: str  # UTC timestamp

class ExecNode:
    id: str
    label: str
    handler: str  # references a registered handler function
    config: dict  # frozen configuration for this node
```

**Behavior:**
- This is the IMMUTABLE TRANSITION boundary
- WorkRequestGraph → ExecutionGraph: enrich with handler references, freeze topology
- After lowering, the graph cannot change — no new nodes, no edge rewiring
- Topological sort is computed and frozen at this boundary

**Critical invariant:**
> Once lowered, an ExecutionGraph is immutable. The scheduler MUST reject any
> ExecutionGraph that has been modified after lowering.

**Tests:**
- [ ] Lowering produces a valid ExecutionGraph with all handlers resolved
- [ ] After lowering, the ExecutionGraph is serializable and hashable
- [ ] Any modification to a frozen ExecutionGraph is detected and rejected
- [ ] Topological order is valid (all edges respect the order)

---

### Station 5: Scheduler + CER Writer

**Input:** `ExecutionGraph` (frozen)
**Output:** Append-only `CER log` (list of `CEREvents`)

```
class CEREvent:
    event_id: str
    timestamp: str  # ISO 8601 UTC
    execution_id: str
    node_id: str
    event_type: Literal["NODE_START", "NODE_COMPLETE", "NODE_FAIL", "NODE_SKIP"]
    payload: dict
    prev_event_hash: str  # hash chain link

class CERLog:
    events: list[CEREvent]
    append(event: CEREvent) -> None  # ONLY mutation allowed
```

**Behavior:**
- Deterministic scheduler loop over frozen ExecutionGraph:
  1. Find nodes whose dependencies are all satisfied (initially: root nodes)
  2. Schedule them in topological order
  3. Execute handler (simulated for v1 — just mark complete)
  4. Emit CEREvent for each state transition (NODE_START, NODE_COMPLETE)
  5. Advance frontier, repeat until all nodes complete
- CER log is append-only: `events.append(event)` — never modify, delete, or reorder
- Each event includes `prev_event_hash` forming a hash chain (tamper evidence)

**Critical invariants:**
- Events are never modified after append
- Events are never reordered
- The event log is append-only forever
- Hash chain is continuous (no gaps)

**Tests:**
- [ ] Empty ExecutionGraph → empty event log (zero events)
- [ ] Single-node graph → NODE_START + NODE_COMPLETE (2 events)
- [ ] Three-node linear chain → 6 events (START/COMPLETE × 3), in topological order
- [ ] Hash chain is continuous (each event links to previous)
- [ ] Appending never modifies or removes prior events
- [ ] Deterministic: same frozen graph → same event sequence

---

### Station 6: Replay Engine

**Input:** `CER log` (list of `CEREvents`)
**Output:** `ExecutionState`

```
class ExecutionState:
    node_states: dict[str, Literal["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"]]
    completed_nodes: list[str]
    failed_nodes: list[str]
    event_count: int
    is_complete: bool
```

**Behavior:**
- Pure-function reducer: `replay(event_log) → ExecutionState`
- Walks events in order, reconstructing state without side effects
- Must produce identical state for identical event log (determinism invariant)
- No mutation — pure function, pure data

**Tests:**
- [ ] Empty event log → all states PENDING
- [ ] Full event log for a completed execution → all nodes COMPLETED
- [ ] Determinism: replay(log) === replay(log) — always
- [ ] Can reconstruct state at any point: `replay_until(log, event_index)`

---

## 4. Core Data Types (Frozen)

These are the **only** types that cross station boundaries. No additional fields may be
added without violating Phase 0.

```
Prompt: str
IRLResult: { probabilities: dict[str, float], raw_input: str, classifier_version: str }
IRSelection: { archetype: str, confidence: float, alternatives: list[str] }
WorkRequestGraph: { nodes: list[WorkNode], edges: list[WorkEdge], metadata: dict }
ExecutionGraph: { nodes: list[ExecNode], edges: list[tuple], topological_order: list[str], schema_version: str, frozen_at: str }
CEREvent: { event_id, timestamp, execution_id, node_id, event_type, payload, prev_event_hash }
CERLog: { events: list[CEREvent], append(event) -> None }
ExecutionState: { node_states: dict, completed_nodes: list, failed_nodes: list, event_count: int, is_complete: bool }
```

---

## 5. Implementation Order (Phase 1 Work Items)

The vertical slice is built in this order. Each work item is independently testable
and builds on the previous:

| # | Work Item | Builds On | Station | Est. Effort |
|---|-----------|-----------|---------|-------------|
| P1-1 | MEEP project skeleton + CLI entrypoint | — | All | Small |
| P1-2 | IRL classifier + IR resolver | P1-1 | 1, 2 | Small |
| P1-3 | Spec compiler + lowering pass | P1-2 | 3, 4 | Medium |
| P1-4 | Deterministic scheduler + CER writer | P1-3 | 5 | Medium |
| P1-5 | Replay engine | P1-4 | 6 | Small |
| P1-6 | End-to-end integration test | P1-5 | All | Small |

---

## 6. Relationship to Existing Code

The existing `nexus/python/absorb/html/` contains components that overlap with this
pipeline. The collapse roadmap does NOT require rewriting or discarding that work.
Instead:

- **Existing components that respect the dependency direction** — may be migrated into
  the MEEP pipeline as handlers or implementations
- **Existing components that violate the dependency direction** — must be refactored or
  quarantined behind the freeze boundary
- **Existing components that depend on external infrastructure** (NATS, databases, etc.)
  — excluded from Phase 1; may be integrated in Phase 2+

**Migration rule:** No existing code is deleted. It may be quarantined (moved to a
`legacy/` or `quarantine/` directory) if it conflicts with the collapse roadmap.

---

## 7. Validation

Each work item is complete only when:
1. All unit tests pass for that station
2. The station's output contract matches the input contract of the next station
3. No new types, archetypes, or concepts were introduced (Phase 0 compliance)
4. The dependency direction is not violated
