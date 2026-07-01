# SM-IR: State Model Intermediate Representation

**Project:** nexus/python/ir
**Plan Number:** v0136
**Status:** completed
**Source:** Event-Driven CLI Agents harvest (`67853dbb-...`) — candidate `0925e399`

## Goal

Replace MEEP's flat `ExecutionState` with a versioned, causally-addressable `StateDAG` — the SM-IR memory substrate. Every mutation creates a new `StateVersion` linked by causal edges; no in-place mutation. Each lease (future) operates on a `StateView`: a time-bounded, causality-filtered projection of the DAG.

## Architectural Problem

MEEP's `ExecutionState` is a flat dict (`node_states: dict[str, NodeState]`). The replay engine reconstructs it from a hash-chained `CERLog` by folding events into the dict. This works for a single deterministic trace but breaks down when:

- **Multiple execution contexts** need to see different slices of state
- **Causality** matters beyond a linear hash chain (causes vs enables vs invalidates vs refines)
- **Auditability** requires knowing *which* event produced *which* state version
- **Branching/merge** semantics are needed for speculative execution (TEM-IR future)

The spec defines SM-IR as: *"Semantic memory substrate defining existence, persistence, and reconstruction. State is a versioned, causally-addressable StateDAG. No in-place mutation — version expansion only."*

## Target Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Promotion Boundary                           │
│                                                                   │
│  NBK Trace ──[replay_snapshot]──► StateVersion                    │
│    │                                       │                      │
│    │  PromotionReceipt:                    │                      │
│    │  "Promoted ExecutionState|             │                      │
│    │   StateVersion into                    │                      │
│    │   StateVersion {vid}                   │                      │
│    │   via stage=replay_snapshot"           │                      │
│    │                                       │                      │
│  CEREvent ──[replay_snapshot]──► StateVersion                     │
│    │                                       │                      │
│    │  PromotionReceipt:                    │                      │
│    │  "Promoted CEREvent(evt-001)          │                      │
│    │   into StateVersion {vid}              │                      │
│    │   edge_type=caused_by"                 │                      │
│    └───────────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────┐
│                  CERLog (MEEP)                   │
│  hash-chained events: evt-001, evt-002, ...     │
└────────────────────┬────────────────────────────┘
                     │ replay / fold
                     ▼
┌─────────────────────────────────────────────────┐
│              SM-IR StateDAG                      │
│                                                  │
│  StateVersion₀ ──[caused_by]──► StateVersion₁   │
│       │                              │           │
│       └──[refines]──► StateVersion₂              │
│              │                                   │
│              └──[enables]──► StateVersion₃       │
│                                                  │
│  Each StateVersion:                              │
│    • data: immutable snapshot of state           │
│    • causal_parents: list[StateVersionId]        │
│    • source_event_id: CEREvent.id (provenance)   │
│    • edge_type: CausalEdgeType                   │
│    • hash: content-addressable integrity         │
│    • promotion_receipt: PromotionReceipt | None  │
└────────────────────┬────────────────────────────┘
                     │ project(lease, time)
                     ▼
┌─────────────────────────────────────────────────┐
│                StateView                         │
│  • visible_state: filtered snapshot              │
│  • causal_boundary: which edges are reachable    │
│  • temporal_slice: [valid_from, valid_until]     │
└─────────────────────────────────────────────────┘
```

### Promotion Model (not extension)

A `StateVersion` is not a "Trace with extra fields" — it's the result of
replay and snapshot compilation applied to NBK's `Trace` primitive.  The
original `Trace` still exists in NBK; the `StateVersion` is a promoted
representation that preserves execution data while adding versioning,
causal addressing, and content-addressable hashing.

```
NBK Trace (node_id, input, output)  ← reference interpreter
       │
       │  StateReplayEngine.replay()
       ▼  replay_snapshot              ← compilation step
       │
  StateVersion (data, hash, receipt)   ← production type
```

Two promotion paths exist:
1. **NBK Trace → StateVersion**: When replaying NBK execution traces into
   versioned state snapshots.
2. **CEREvent → StateVersion**: When replaying MEEP's CERLog events
   through `StateReplayEngine._event_to_delta()`, each event promotes
   into a new `StateVersion` with a `PromotionReceipt` recording the
   `source_event_id` and `edge_type`.

Both paths emit `PromotionReceipt` objects via `StateDAG.mutate()`.
The receipt chain forms the foundation for downstream provenance
(RL-IR's `ProvenanceGraph`).

## Files Affected

### CREATE

| File | Purpose |
|---|---|
| `nexus/python/ir/__init__.py` | Module init, public exports |
| `nexus/python/ir/state_dag.py` | `StateDAG`, `StateVersion`, `StateVersionId`, causal edge types, `mutate()` |
| `nexus/python/ir/state_view.py` | `StateView` — filtered projection for a lease/time boundary |
| `nexus/python/ir/state_replay.py` | `StateReplayEngine` — replays CERLog into StateDAG (replaces flat ExecutionState rebuild) |
| `nexus/python/ir/tests/__init__.py` | Test package |
| `nexus/python/ir/tests/test_state_dag.py` | Unit tests: version creation, causal edges, immutability, hash integrity |
| `nexus/python/ir/tests/test_state_view.py` | Unit tests: projection, filtering, boundary semantics |
| `nexus/python/ir/tests/test_state_replay.py` | Integration tests: replay CERLog → StateDAG, verify provenance |
| `nexus/python/ir/pyproject.toml` | Package config |

### MODIFY

| File | Purpose |
|---|---|
| `nexus/python/meep/replay_engine.py` | Add optional `use_state_dag=True` flag — when set, returns `StateDAG` instead of flat `ExecutionState` |
| `nexus/python/meep/models.py` | Add `source_event_id` to `CEREvent` if missing; document that `ExecutionState` is the legacy flat view |

### NO REMOVAL
MEEP's `ExecutionState` remains for backward compatibility; `StateDAG` is the new canonical representation.

## Acceptance Criteria

- [ ] `StateVersion` is immutable after creation (dataclass with `frozen=True`, or equivalent)
- [ ] `StateDAG.mutate(delta, source_event_id)` creates a new `StateVersion` linked to parents by causal edges
- [ ] `StateDAG.get_version(version_id)` retrieves a specific version by ID
- [ ] `StateDAG.head` returns the latest version(s) — supports multiple heads (branching)
- [ ] `StateView.project(state_dag, lease_spec, time_range)` returns a filtered projection
- [ ] `StateView` supports three filter axes: role capabilities, causal boundary, temporal slice
- [ ] `StateReplayEngine.replay(cer_log)` produces a `StateDAG` where each event maps to a version
- [ ] Each `StateVersion` records its `source_event_id` for provenance tracing
- [ ] Content-addressable hashing: `StateVersion.hash` is deterministic for same data + same parents (version_id excluded)
- [ ] `StateDAG` can be serialized to/from JSON for persistence
- [ ] Each `StateVersion` carries a `promotion_receipt: PromotionReceipt` recording the promotion from upstream representation
- [ ] Two promotion paths are supported: NBK `Trace` → `StateVersion` and `CEREvent` → `StateVersion`
- [ ] Deterministic replay: same events → same data and causal structure (not same version_ids)
- [ ] All unit tests pass: `pytest nexus/python/ir/tests/ -v`
- [ ] MEEP's existing `ExecutionState` path continues to work (no regression)
- [ ] MEEP's existing replay engine tests still pass

## Dependencies

- Python 3.11+ (dataclasses, `frozen=True`, `hashlib`)
- MEEP's `CERLog` and `CEREvent` (read-only dependency)
- No new packages required (stdlib only for v1)

## Implementation Notes

### 1. Minimal v1: No Leases Yet

This is SM-IR standalone. `StateView.project()` accepts a `lease_spec` dict (not a `RoleLease` object) — anticipating Event-to-Lease but not depending on it. The lease spec is `{role: str, capabilities: set[str]}`.

### 2. Causal Edge Types

From the TEM-IR spec, but defined here for self-containment:
```python
class CausalEdgeType(str, Enum):
    CAUSED_BY = "caused_by"       # Standard event → state link
    ENABLES = "enables"           # This version makes another possible
    INVALIDATES = "invalidates"   # This version renders a prior version obsolete
    REFINES = "refines"           # This version is a more-detailed version of a parent
```

The default edge from `mutate()` is `CAUSED_BY`. `ENABLES`, `INVALIDATES`, `REFINES` are added explicitly.

### 3. StateVersion Hash

Content-addressable integrity — a pure function of data, causal parents,
source event ID, and edge type.  Identity fields (version_id, timestamp)
are excluded so that two versions with identical content produce the
same hash.

```python
hash = sha256(json.dumps({
    "data": self.data,
    "causal_parents": sorted(self.causal_parents),
    "source_event_id": self.source_event_id,
    "edge_type": self.edge_type.value,
}, sort_keys=True))
```

This gives content-addressable integrity — tampering with state data
produces a mismatched hash.  Deterministic replay of the same events
will produce versions with the same data and causal structure, but
with different version_ids (random UUIDs).  Hash equality is therefore
NOT the test for deterministic replay — compare data and topology instead.

### 4. Integration with CERLog Replay

Existing replay: fold events into `ExecutionState` dict (linear, single head).

New replay (SM-IR):
```python
def replay_to_dag(cer_log: CERLog) -> StateDAG:
    dag = StateDAG()
    for event in cer_log.events:
        delta = _event_to_delta(event)  # NODE_START → running, NODE_COMPLETE → completed
        dag.mutate(delta, source_event=event.event_id)
    return dag
```

The `_event_to_delta()` function is a bridge — it translates MEEP's `CEREvent` (NODE_START, NODE_COMPLETE, NODE_FAIL, NODE_SKIP) into SM-IR deltas.

### 5. StateView Projection

```python
StateView.project(
    dag: StateDAG,
    lease_spec: dict,           # {role: "builder", capabilities: {"read:state", "write:state"}}
    time_range: tuple[datetime, datetime] | None = None,
    causal_depth: int | None = None  # How many causal steps back from head
) -> dict  # The visible state snapshot
```

v1 is a simple filter: if time_range given, only versions within it. If causal_depth given, traverse that many edges back from head. Capability filtering deferred to v2 (needs GP-IR policy predicates).

### 6. No In-Place Mutation

The core invariant: `StateDAG.mutate()` always returns a new `StateVersion`; existing versions are never modified. This is enforced by `frozen=True` dataclasses and no setter methods.

### 7. Test Strategy

- **test_state_dag.py**: Create versions, verify immutability, verify causal edges, verify hashing, serialize/deserialize round-trip
- **test_state_view.py**: Project with time bounds, project with causal depth, verify filtered result
- **test_state_replay.py**: Create CERLog with known events, replay to StateDAG, verify version count, verify provenance links

### 8. Future Extension Points

These are NOT in scope for this plan but the code should accommodate them:

- **TEM-IR**: `CausalEdge` type already defined here; TEM-IR will add Lease Time and Causal Time layers
- **LS-IR**: `StateView` projection is the basis for the `WorkSurface` query
- **Event-to-Lease**: `StateView` will bind to a `RoleLease` instead of a `lease_spec` dict
- **Branching/merge**: `StateDAG` supports multiple heads from day one (branching), merge logic comes later
