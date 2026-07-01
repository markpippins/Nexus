# TEM-IR: Temporal Execution Model Intermediate Representation

**Project:** nexus/python/ir
**Plan Number:** v0137
**Status:** completed
**Source:** Event-Driven CLI Agents harvest (`67853dbb-...`) — candidate `adc70bb5`

## Goal

Add causal edge typing and a three-layer time model on top of MEEP's linear hash chain. Distinguish *Event Time* (when the event occurred), *Lease Time* (when execution consumed it), and *Causal Time* (logical ordering: A caused B). Promote NBK's untyped `Edge` into typed `CausalEdge` via a deterministic causality inference step, emitting a `PromotionReceipt` at the boundary.

## Architectural Problem

MEEP's `CEREvent` tracks order via a hash chain (`prev_event_hash` → SHA-256 of previous event). This provides tamper evidence and linear ordering. But it collapses all relationships into "happened-after":

- A hash chain can't express *why* A precedes B (did A cause B? enable B? invalidate B?)
- Speculative execution (TEM-IR future) requires branching causal manifolds, not a single chain
- Lease Time vs Event Time are conflated — an event's wall-clock time is its only timestamp
- Replay reconstructs state linearly; there's no way to replay along a specific causal branch

The spec defines TEM-IR as: *"Defines time, causality, replay, and speculative execution across RoleLeases/LeaseGraphs. Three layers of time: Event Time, Lease Time, and Causal Time."*

## Target Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Promotion Boundary                      │
│                                                           │
│  NBK Edge ──[causality_inference]──► CausalEdge          │
│    │                                      │               │
│    │  PromotionReceipt:                   │               │
│    │  "Promoted Edge(from=A,to=B)         │               │
│    │   into CausalEdge with                │               │
│    │   type=causes, epoch=5"               │               │
│    │                                      │               │
│    └──────────────────────────────────────┘               │
│                                                           │
│  CEREvent ──[from_cer_event]──► CausalEvent               │
│    │                                      │               │
│    │  PromotionReceipt:                   │               │
│    │  "Promoted CEREvent(evt-001)         │               │
│    │   into CausalEvent with              │               │
│    │   3-layer time model"                │               │
│    └──────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                   Time Layers                             │
│                                                           │
│  Event Time: evt.timestamp          (wall clock)          │
│  Lease Time: when lease processed it (scheduler ts)       │
│  Causal Time: logical ordering       (integer epoch)      │
│                                                           │
│  Example:                                                 │
│    evt-A (Event Time: 14:00:01, Causal: epoch=5)         │
│      ├──[causes]──► evt-B (Causal: epoch=6)              │
│      └──[enables]──► evt-C (Causal: epoch=6.5)           │
│    evt-C                                                  │
│      └──[invalidates]──► evt-A (marks obsolete)           │
└──────────────────────────────────────────────────────────┘
```

### Promotion Model (not extension)

A `CausalEdge` is not an "Edge with extra fields" — it's the result of
causality inference applied to an `Edge`. The original `Edge` still exists
in NBK; the `CausalEdge` is a promoted representation that preserves the
`from`/`to` relationship while adding *why* the relationship exists.

```
NBK Edge (from, to)               ← reference interpreter
       │
       ▼  causality_inference       ← compilation step
       │
  CausalEdge (from, to, type)      ← production type
       │
       ▼  from_cer_event            ← second promotion path
       │
  CausalEvent (CEREvent + time)    ← full temporal type
```

Two promotion paths exist:
1. **NBK Edge → CausalEdge**: When we know *why* A relates to B (causes, enables, invalidates, refines)
2. **CEREvent → CausalEvent**: When we upgrade a raw event with the three-layer time model

Both emit `PromotionReceipt` objects that feed into downstream provenance.

## Files Affected

### CREATE

| File | Purpose |
|---|---|
| `nexus/python/ir/causal_edge.py` | `CausalEdge`, `CausalEdgeType`, `CausalGraph` — typed edges between events/leases/state versions |
| `nexus/python/ir/time_model.py` | `TimeModel` — three-layer timestamp container, causal epoch counter |
| `nexus/python/ir/causal_event.py` | `CausalEvent` — extends MEEP's `CEREvent` with typed causal parents and time layers |
| `nexus/python/ir/tests/test_causal_edge.py` | Unit tests: edge types, graph traversal, cycle detection |
| `nexus/python/ir/tests/test_time_model.py` | Unit tests: epoch ordering, layer comparison, serialization |
| `nexus/python/ir/tests/test_causal_event.py` | Unit tests: upgrade CEREvent → CausalEvent, verify parent links |

### NO MODIFY

SM-IR (`state_dag.py`) is **never modified by TEM-IR**.  `CausalEdgeType`
remains defined in SM-IR as the canonical enum.  TEM-IR imports it from
SM-IR — the dependency flows SM-IR → TEM-IR, never the reverse.

### NO REMOVAL
MEEP's `CEREvent` hash chain remains untouched.

## Acceptance Criteria

- [ ] `CausalEdge` has fields: `from_id`, `to_id`, `edge_type: CausalEdgeType`, `timestamp`, `metadata`, `promotion_receipt: PromotionReceipt | None`
- [ ] `CausalEdgeType` enum: `CAUSES`, `ENABLES`, `INVALIDATES`, `REFINES`
- [ ] `CausalGraph` supports: `add_edge()`, `outgoing(node_id)`, `incoming(node_id)`, `ancestors(node_id)`, `is_ancestor(a, b)`
- [ ] `TimeModel` dataclass with three fields: `event_time: datetime`, `lease_time: datetime | None`, `causal_epoch: int`
- [ ] `CausalEvent` adds to `CEREvent`: `causal_parents: list[CausalEdge]`, `time_model: TimeModel`, `promotion_receipt: PromotionReceipt | None`
- [ ] `CausalEvent.from_cer_event(event, parents)` factory upgrades a MEEP `CEREvent` to a `CausalEvent` and emits a `PromotionReceipt`
- [ ] `CausalEdge.from_nbk_edge(edge, edge_type)` factory promotes an NBK `Edge` to a `CausalEdge` with a `PromotionReceipt`
- [ ] `CausalGraph.is_dag()` returns True for acyclic graphs, False if cycles detected
- [ ] `CausalGraph.find_path(from_id, to_id)` returns the causal path between two nodes
- [ ] Causal epoch is monotonically increasing, assigned at event creation
- [ ] `CausalEvent` serializes to/from JSON (for persistence alongside CERLog)
- [ ] All unit tests pass: `pytest nexus/python/ir/tests/ -v -k "causal or time"`

## Dependencies

- `nexus/python/ir/state_dag.py` (SM-IR) — `StateVersion`, `StateVersionId`, `CausalEdgeType` imported read-only.  TEM-IR enriches SM-IR types, never modifies them.
- `nexus/python/ir/promotion_receipt.py` (RL-IR) — `PromotionReceipt` type imported for promotion factories
- NBK's `Edge` (read-only — `from_nbk_edge` reads NBK edges, never modifies them)
- MEEP's `CEREvent` (read-only — `from_cer_event` reads CEREvents, never modifies them)
- Python 3.11+ stdlib

### Dependency direction (strict)

```
SM-IR ──► TEM-IR    (TEM-IR depends on SM-IR, never reverse)
```

TEM-IR imports `CausalEdgeType` from SM-IR.  SM-IR never imports from
TEM-IR.  The `TemporalAnnotator` is a TEM-IR class that consumes SM-IR
objects — it does not add methods to SM-IR classes.

## Implementation Notes

### 1. CausalEdge vs Hash Chain

MEEP's hash chain (`CERLog` with `prev_event_hash`) remains the *integrity* mechanism (tamper evidence). `CausalEdge` is the *semantic* mechanism (why A relates to B). They coexist:

```
CEREvent chain:  evt-001 →[hash]→ evt-002 →[hash]→ evt-003
CausalGraph:     evt-001 ──[causes]──► evt-003
                 evt-002 ──[enables]──► evt-003
```

The causal graph is a *view* over the hash chain, not a replacement.

### 2. Causal Epoch

The `causal_epoch` is a logical clock, not wall time. It's a monotonically increasing integer. When a new event is created, its epoch = `max(parent_epochs) + 1`. If multiple parents, the epoch is fractional (e.g., `5.5`) to preserve partial ordering — but v1 uses integer epochs only (merge semantics deferred to speculative execution).

### 3. Bridge: CEREvent → CausalEvent (with PromotionReceipt)

```python
@classmethod
def from_cer_event(cls, cer: CEREvent, parents: list[CausalEdge]) -> "CausalEvent":
    ce = CausalEvent(
        event_id=cer.event_id,
        timestamp=cer.timestamp,
        event_type=cer.event_type,
        payload=cer.payload,
        prev_event_hash=cer.prev_event_hash,
        causal_parents=parents,
        time_model=TimeModel(
            event_time=cer.timestamp,
            lease_time=None,  # Set by LS-IR when dispatched
            causal_epoch=_next_epoch(parents),
        ),
        promotion_receipt=PromotionReceipt(
            from_type="CEREvent",
            from_id=cer.event_id,
            to_type="CausalEvent",
            to_id=cer.event_id,  # same event, promoted representation
            stage="from_cer_event",
            metadata={
                "parent_count": len(parents),
                "causal_epoch": _next_epoch(parents),
            },
        ),
    )
    return ce
```

### 3a. Bridge: NBK Edge → CausalEdge (with PromotionReceipt)

```python
@classmethod
def from_nbk_edge(cls, edge: Edge, edge_type: CausalEdgeType, metadata: dict | None = None) -> "CausalEdge":
    """Promote a raw NBK Edge into a typed CausalEdge."""
    causal = CausalEdge(
        from_id=edge.from_id,
        to_id=edge.to_id,
        edge_type=edge_type,
        metadata=metadata or {},
        promotion_receipt=PromotionReceipt(
            from_type="Edge",
            from_id=f"{edge.from_id}→{edge.to_id}",
            to_type="CausalEdge",
            to_id=f"{edge.from_id}→{edge.to_id}",  # same nodes, promoted type
            stage="causality_inference",
            metadata={"inferred_type": edge_type.value, **(metadata or {})},
        ),
    )
    return causal
```

### 4. CausalGraph Traversal

```python
class CausalGraph:
    def ancestors(self, node_id: str) -> set[str]:
        """All nodes that (transitively) caused/enabled this node."""
        ...

    def is_ancestor(self, a: str, b: str) -> bool:
        """True if a is an ancestor of b (b was caused/enabled by a)."""
        ...

    def find_path(self, from_id: str, to_id: str) -> list[CausalEdge] | None:
        """Shortest causal path between two nodes, or None."""
        ...
```

### 5. TemporalAnnotator — Enrichment, not Retrofit

TEM-IR enriches SM-IR through a `TemporalAnnotator` — a separate pass that
takes a `StateDAG` (read-only) and produces a `CausalGraph`.  The
annotator walks `StateVersion` nodes, infers causal relationships from
their `causal_parents` chains and `edge_type` values, and builds a typed
causal graph with three-layer time semantics.

```python
class TemporalAnnotator:
    def annotate(self, dag: StateDAG) -> CausalGraph:
        """Enrich a StateDAG with causal semantics.

        Walks the DAG's versions, promotes each NBK-style edge into a
        typed CausalEdge, builds the CausalGraph, and annotates each
        CausalEvent with its TimeModel.

        Does NOT modify the StateDAG — returns a separate CausalGraph.
        """
        graph = CausalGraph()
        for version_id in dag._versions:
            version = dag.get_version(version_id)
            for parent_id in version.causal_parents:
                parent = dag.get_version(parent_id)
                if parent:
                    edge = CausalEdge.from_state_versions(parent, version)
                    graph.add_edge(edge)
        return graph
```

This keeps state (SM-IR) and causality (TEM-IR) as separate concerns.
StateVersion stores *what* happened.  CausalGraph knows *why*.

The `TemporalAnnotator` is the enrichment boundary:

```
StateDAG (SM-IR)
       │
       ▼  TemporalAnnotator.annotate()    ← enrichment, not retrofit
       │
CausalGraph (TEM-IR)
```

SM-IR's `StateVersion` records a `source_event_id`.  The `CausalGraph`
can answer: "which state versions were caused by this event?" by
traversing from event → state version edges built by the annotator.

### 6. Test Strategy

- **test_causal_edge.py**: Create edges, build graph, verify traversal, test cycle detection
- **test_time_model.py**: Create events with different time layers, verify epoch ordering
- **test_causal_event.py**: Upgrade CEREvent, verify parent links, serialize/deserialize round-trip

### 7. Future Extension Points

- **Branching/merge**: `CausalGraph` supports DAGs from day one; merge is path-finding between branches
- **Speculative execution**: A branch is just a causal subgraph with an `INVALIDATES` edge back to the trunk if rejected
- **LS-IR**: The `WorkSurface` scheduler will use `CausalGraph.ancestors()` to determine which events are ready to dispatch
