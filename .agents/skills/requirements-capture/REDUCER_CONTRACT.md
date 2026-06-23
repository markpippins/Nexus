> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# REQUIREMENTS SYSTEM — REDUCER CONTRACT v1

## 1. CORE PRINCIPLE
The reducer is a pure function over an ordered event stream.
No side effects. No filesystem interaction. No hidden state.

## 2. REDUCER API
### 2.1 Primary Function
```python
def reduce(events: list[Event]) -> ReductionResult:
    ...
```

### 2.2 Event Type
```python
class Event(TypedDict):
    event_id: str
    type: str  # REQ_* or FAILURE_*
    req_id: str | None  # None for FAILURE_* events
    timestamp: str
    payload: dict
```

### 2.3 Reduction Result
```python
class ReductionResult(TypedDict):
    index: dict[str, RequirementNode]
    graph: Graph
```

### 2.4 Requirement Node
```python
class RequirementNode(TypedDict):
    state: str
    intent: str | None
    intent_scope: str
    implementation_hint: str | None
    confidence: float | None
    narrative: str | None
    structure: Structure | None
    constraints: list[str]
    artifacts: list[ArtifactRef]
    rationale: str | None
    acceptance: list[str]
    status_hint: str | None
    lineage: Lineage
```

### 2.4a Structure
```python
class Structure(TypedDict):
    entities: list[Entity]
    relations: list[Relation]

class Entity(TypedDict):
    name: str
    type: str
    props: dict

class Relation(TypedDict):
    source: str
    target: str
    type: str
```

### 2.4b ArtifactRef
```python
class ArtifactRef(TypedDict):
    path: str
    description: str
    type: str
```

### 2.5 Lineage
```python
class Lineage(TypedDict):
    parents: list[str]
    children: list[str]
    aliases: list[str]
    superseded_by: list[str]
    merged_into: list[str]
```

### 2.6 Graph
```python
class Graph(TypedDict):
    nodes: set[str]
    edges: list[Edge]
```

### 2.7 Edge
```python
class Edge(TypedDict):
    from_id: str
    to_id: str
    type: str  # split | merge | supersede | duplicate
```

## 3. REDUCER STATE MODEL
### 3.1 Internal Working State
The reducer maintains ONLY this in-memory structure:
```python
state = {
    "nodes": dict[str, RequirementNode],
    "graph": Graph
}
```
No other state is allowed.

## 4. EVENT HANDLER CONTRACTS
Each handler MUST follow this interface:
```python
def handle(event: Event, state: dict) -> None:
    ...
```
All handlers mutate ONLY the in-memory reducer state.

## 5. EVENT SEMANTICS (FORMALIZED)

### 5.1 REQ_CREATED
**Preconditions**: req_id must not already exist
**Effect**:
- create node
- state = ACTIVE
- initialize lineage
- narrative = payload.narrative (or None)
- structure = payload.structure (or None)
- constraints = payload.constraints (or [])
- artifacts = payload.artifacts (or [])
- intent_scope = payload.intent_scope
- add to index + graph nodes

### 5.2 REQ_REFINED
**Preconditions**: req_id must exist
**Effect**:
- update: intent (optional), implementation_hint (optional), confidence (optional)
- update: narrative (optional — if present in payload, replace fully)
- update: structure (optional — if present in payload, replace fully)
- update: constraints (optional — if present in payload, replace fully)
- update: artifacts (optional — if present in payload, replace fully)
- update: rationale (optional — if present in payload, replace fully)
- update: acceptance (optional — if present in payload, replace fully)
- update: status_hint (optional — if present in payload, replace fully)
- supersedes is logged as lineage metadata but does NOT affect projection
- NO state change
- NO graph change
**IMPORTANT RULES**:
1. Refinement may set a dirty flag internally, but must not mutate state.
2. **Replacement semantics**: If a field is present in the payload, its value replaces the previous value entirely (not a diff or merge). If a field is absent, the previous value is preserved unchanged. An empty array or object is an explicit clear.
3. See [`CANONICAL_REFINEMENT_CONTRACT.md`](./CANONICAL_REFINEMENT_CONTRACT.md) for the full Canonical Refinement Contract governing reducer law and field semantics.

**IMPORTANT: `intent_scope` is NOT refinable.** Any `REQ_REFINED` event containing `intent_scope` in its payload MUST be rejected at validation (see V7).

### 5.3 REQ_SUPERSEDED
**Preconditions**: req_id exists, superseded_by exists or is created
**Effect**:
- state(req) = SUPERSEDED
- add edge(req → superseded_by[*])
- update lineage.superseded_by

### 5.4 REQ_SPLIT
**Preconditions**: req_id exists
**Effect**:
- state(parent) = SPLIT
- for each child: ensure node exists, state(child) = ACTIVE
- add edges parent → children
- update lineage.children

### 5.5 REQ_MERGED
**Preconditions**: all req_ids exist
**Effect**:
- state(all sources) = MERGED
- state(target) = ACTIVE
- add edges sources → target
- update lineage.merged_into

### 5.6 REQ_INVALIDATED
**Preconditions**: req_id exists
**Effect**:
- state(req) = INVALIDATED
- remove from ACTIVE projection
- preserve node + lineage

### 5.7 REQ_DUPLICATE_OF
**Preconditions**: both req_ids exist
**Effect**:
- state(req) = ALIAS
- update lineage.aliases
- add edge(req → canonical)

### 5.8 REQ_IMPLEMENTED
**Preconditions**: req_id exists
**Effect**:
- state(req) = IMPLEMENTED
- attach implementation_ref

### 5.9 REQ_TESTED
**Preconditions**: req_id exists
**Effect**:
- state(req) = TESTED
- attach result
- if result == "fail": OPTIONAL policy: state = ACTIVE

### 5.10 FAILURE_EVENT (meta-event)
**Preconditions**: none
**Effect**:
- create FAILURE node in graph (not in INDEX)
- add edge FAILURE → affected req_ids via FAILURE_AFFECTS
- NO mutation of requirement state
- NO change to INDEX
- Failure nodes persist only in GRAPH, derived from event log

## 6. REDUCER LOOP (STRICT ORDERING)
```python
def reduce(events):
    try:
        state = init_empty()
        for event in sorted(events, key=timestamp_then_event_id):
            dispatch(event, state)  # No merging. No interpretation. No reconciliation. — per CRC §5
        return build_output(state)
    except Exception as e:
        emit_failure_event(e)
        halt_or_degrade()
```

## 7. DERIVATION RULES
### 7.1 INDEX construction
`INDEX = { req_id → node_state + lineage }`
Built AFTER full replay only.

### 7.2 GRAPH construction
- `GRAPH.nodes` = all req_ids
- `GRAPH.edges` = all event-derived relations

### 7.3 ACTIVE set rule
`ACTIVE = { req_id | state == ACTIVE }`

## 8. VALIDATION RULES (HARD FAIL CONDITIONS)
Reject entire event stream if:
- **V1** — unknown event type (maps to F1 — `FAILURE_INVALID_EVENT`)
- **V2** — duplicate event_id (maps to F1 — `FAILURE_INVALID_EVENT`)
- **V3** — missing req_id (maps to F2 — `FAILURE_IDENTITY_VIOLATION`)
- **V4** — invalid transition (maps to F4 — `FAILURE_TRANSITION_VIOLATION`)
- **V5** — orphan merge/split references (maps to F5 — `FAILURE_GRAPH_INCONSISTENCY`)
- **V6** — non-deterministic ordering ambiguity (maps to F3 — `FAILURE_ORDERING_AMBIGUITY`)
- **V7** — refinement scope violation: `REQ_REFINED` event with `intent_scope` in payload (maps to F4 — `FAILURE_TRANSITION_VIOLATION`)

See [`FAILURE_SEMANTICS.md`](./FAILURE_SEMANTICS.md) for the full failure classification and handling model.

## 9. DETERMINISM GUARANTEE
The reducer MUST satisfy:
`reduce(events) == reduce(events)` # identical output always
Given identical: event list, ordering rule, and handler logic.

## 10. TEST VECTORS (MINIMAL REQUIRED SET)
These are mandatory for implementation validation.

**T1: Create → Refine → Implement**
- Expected: ACTIVE → ACTIVE → IMPLEMENTED, no graph edges

**T2: Split**
- Expected: parent SPLIT, children ACTIVE, correct edges

**T3: Merge**
- Expected: sources MERGED, target ACTIVE, edges sources → target

**T4: Supersede chain**
- Expected: linear or branching supersession preserved, no loss of intermediate nodes

**T5: Duplicate collapse**
- Expected: alias state, canonical preserved, correct alias edge

**T6: Invalid event rejection**
- Expected: system fails fast before partial reduction

## 11. FINAL CONTRACT STATEMENT
The reducer is a pure deterministic function that transforms an ordered append-only event log into a fully materialized requirement index and dependency graph. All state is derived. No mutation, interpretation, or external context is permitted during reduction. Failure events are preserved in the log and materialized as graph nodes without mutating requirement state, ensuring deterministic replay of system faults.
