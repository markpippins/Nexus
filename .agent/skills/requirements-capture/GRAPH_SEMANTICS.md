# REQUIREMENTS SYSTEM — GRAPH SEMANTICS SPEC v1

## 1. CORE PRINCIPLE
The graph is a deterministic projection of event-derived relationships between requirement identities.
It is:
- directed
- typed
- acyclic per relationship type (not globally guaranteed)
- fully reconstructable from the event log

No edges are stored independently.

## 2. GRAPH MODEL
### 2.1 Node
`Node = RequirementID`
Nodes are:
- immutable identities
- always present if ever referenced in any event

### 2.2 Edge
```json
Edge = {
    "from": "RequirementID",
    "to": "RequirementID",
    "type": "EdgeType"
}
```

### 2.3 Edge Types
`EdgeType ∈ { CREATED, REFINES, SPLITS_TO, MERGED_INTO, SUPERSEDED_BY, DUPLICATE_OF, IMPLEMENTS, TESTS, FAILURE_AFFECTS, FAILURE_CAUSES }`

## 3. EDGE DERIVATION RULES (FROM EVENTS)
This is the most important section.

### 3.1 REQ_CREATED
**Rule**: No edges created. Node is introduced only.

### 3.2 REQ_REFINED
**Rule**: No edges created. Refinement is metadata-only.

### 3.3 REQ_SPLIT
Event: parent → children
**Rule**:
```python
for child in children:
    add edge(parent → child, SPLITS_TO)
```
**Properties**:
- parent becomes source-only node
- children inherit conceptual lineage, not state

### 3.4 REQ_MERGED
**Rule**:
```python
for source in req_ids:
    add edge(source → target, MERGED_INTO)
```
**Important**: MERGE creates fan-in structure. Target is convergence node.

### 3.5 REQ_SUPERSEDED
**Rule**: `add edge(req → superseding, SUPERSEDED_BY)`
**Semantics**: replacement relationship. Does NOT imply deletion or merging.

### 3.6 REQ_DUPLICATE_OF
**Rule**: `add edge(req → canonical, DUPLICATE_OF)`
**Semantics**: identity collapse. Aliasing only (no structural merge).

### 3.7 REQ_IMPLEMENTED
**Rule**: `add edge(req → implementation_ref_node, IMPLEMENTS)`
Where `implementation_ref_node` is a synthetic node (e.g. commit hash, build artifact, or external system ID).

### 3.8 REQ_TESTED
**Rule**: `add edge(req → test_result_node, TESTS)`
Where `test_result_node` is: `PASS`, `FAIL`, or structured test artifact reference.

### 3.9 FAILURE_EVENT (meta-event)
**Rule**:
```python
failure_node = create_failure_node(event)
for affected_req in extract_affected(event):
    add edge(failure_node → affected_req, FAILURE_AFFECTS)
```
**Properties**:
- failure nodes are not requirement nodes; they exist only in GRAPH
- failure edges do not alter INDEX state
- failures are replayable from event log

## 4. GRAPH INVARIANTS
- **I1 — Edge immutability**: Once derived from an event prefix, an edge is never removed or mutated. Graph is replay-based.
- **I2 — Node persistence**: Any req_id appearing in any event must exist as a node. Even if invalidated, superseded, or aliased.
- **I3 — Type consistency**: Edges must always respect `from != to`. No self-loops allowed (prevents accidental recursion in merges/splits).
- **I4 — Event completeness**: Every structural relationship in the graph MUST originate from an event. No implicit edges.

## 5. GRAPH STATE DERIVATION (FROM REDUCER OUTPUT)
Graph is constructed after INDEX:
- **5.1 Node set**: `GRAPH.nodes` = all req_ids seen in event log
- **5.2 Edge set**: `GRAPH.edges` = union(all event-derived edges)

## 6. GRAPH QUERY SEMANTICS
This is where the system becomes useful.

### 6.1 Lineage traversal
**“Why does this requirement exist?”**
`ancestors(req)` = traverse incoming edges: `SPLITS_TO`, `MERGED_INTO`, `SUPERSEDED_BY`, `DUPLICATE_OF`

### 6.2 Dependency expansion
**“What does this requirement depend on?”**
`dependencies(req)` = reverse traversal of: `SPLITS_TO` (parent), `MERGED_INTO` (sources)

### 6.3 Impact analysis
**“What breaks if this changes?”**
`impact(req)` = forward traversal of: `SPLITS_TO`, `MERGED_INTO`, `SUPERSEDED_BY`

### 6.4 Canonical resolution
**“What is the real requirement behind this alias?”**
`canonical(req)`: follow `DUPLICATE_OF` edges until terminal node

### 6.5 Evolution chain
**“How did this requirement evolve?”**
`history(req)`: ordered event projection filtered by req_id

## 7. CAUSALITY MODEL
The graph encodes causal intent transformation, not just structure. Each edge type maps to a semantic transformation:

| Edge | Meaning |
|---|---|---|
| `SPLITS_TO` | decomposition of intent |
| `MERGED_INTO` | synthesis of intent |
| `SUPERSEDED_BY` | replacement of intent |
| `DUPLICATE_OF` | identity resolution |
| `IMPLEMENTS` | realization |
| `TESTS` | validation |
| `FAILURE_AFFECTS` | causal impact of failure |

## 8. TEMPORAL SEMANTICS (IMPORTANT)
The graph is time-aware but not time-stamped internally.
Meaning: edges exist in full graph. Temporal ordering is reconstructed from events.
So: `Graph(t) = projection of events ≤ t`

## 9. CONSISTENCY GUARANTEE
The system guarantees:
- **Deterministic Graph Property**: `reduce(events) → GRAPH` is identical every time.
- **Replay equivalence**: `GRAPH = f(event_log)`. No alternative construction path exists.

## 10. FINAL SYSTEM PICTURE
You now have 5 layers:
1. **Event Log (truth)**: Append-only semantic history
2. **Reducer (logic)**: Pure function transforming events → state
3. **INDEX (state projection)**: Current semantic snapshot
4. **GRAPH (causal projection)**: Relationship + lineage + dependency structure
5. **FAILURE GRAPH (failure projection)**: Failure nodes + causal impact edges derived from FAILURE events

## 11. ONE SENTENCE SUMMARY
The system is a deterministic event-sourced semantic graph engine where requirement identities evolve through typed transitions and failures are represented as first-class causal nodes, with all structural relationships reconstructed as typed edges derived from an immutable event history.
