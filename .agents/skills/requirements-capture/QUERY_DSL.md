> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# REQUIREMENTS SYSTEM — QUERY DSL v1

## 1. CORE PRINCIPLE
Queries are pure functions over `INDEX` and `GRAPH`.
They are:
- deterministic
- side-effect free
- composable
- fully derivable from `reduce()` output

## 2. DATA INPUTS
All queries operate on:
- **INDEX**: `RequirementID → RequirementNode`
- **GRAPH**: nodes + edges

**No event log access allowed at query layer.**

## 3. QUERY PRIMITIVES
These are the only allowed building blocks.

### 3.1 NODE SELECTOR
`SELECT(predicate)`
Returns subset of requirement IDs.
Example predicates:
- `state == ACTIVE`
- `confidence > 0.7`
- `type == "functional"`

### 3.2 GRAPH TRAVERSAL
`TRAVERSE(start_nodes, edge_types, direction)`
`direction ∈ {UPSTREAM, DOWNSTREAM, BOTH}`
Edge types:
- `SPLITS_TO`, `MERGED_INTO`, `SUPERSEDED_BY`, `DUPLICATE_OF`, `IMPLEMENTS`, `TESTS`

### 3.3 SET OPERATIONS
- `UNION(A, B)`
- `INTERSECT(A, B)`
- `DIFF(A, B)`

## 4. HIGH-LEVEL QUERIES (DERIVED MACROS)
These are syntactic sugar over primitives.

### 4.1 ACTIVE SET
`ACTIVE() = SELECT(state == ACTIVE)`

### 4.2 TERMINAL SET
`TERMINAL() = SELECT(state in { SUPERSEDED, SPLIT, MERGED, INVALIDATED, ALIAS })`

### 4.3 LINEAGE
“What is the full history chain?”
`LINEAGE(req_id) = TRAVERSE({req_id}, ALL_EDGE_TYPES, UPSTREAM)`

### 4.4 DEPENDENCIES
“What does this depend on?”
`DEPENDENCIES(req_id) = TRAVERSE({req_id}, {SPLITS_TO, MERGED_INTO}, UPSTREAM)`

### 4.5 IMPACT ANALYSIS
“What will this affect?”
`IMPACT(req_id) = TRAVERSE({req_id}, ALL_EDGE_TYPES, DOWNSTREAM)`

### 4.6 CANONICAL RESOLUTION
“Resolve identity collapse”
`CANONICAL(req_id) = FOLLOW(req_id, DUPLICATE_OF, UNTIL_TERMINAL)`

### 4.7 EVOLUTION TRACE
“How did this requirement evolve?”
`EVOLUTION(req_id) = FILTER(EVENTS, req_id) ORDER BY timestamp`
*(Note: this is a debug view, not a graph query)*

### 4.8 IMPLEMENTATION SET
`IMPLEMENTED() = SELECT(state == IMPLEMENTED)`

### 4.9 READY FOR TEST
`READY_TO_TEST() = SELECT(state == IMPLEMENTED)`

### 4.10 FAILURE SET
`FAILURES() = SELECT(type == "failure")`

### 4.11 FAILURE IMPACT
`FAILURE_IMPACT(req_id) = TRAVERSE({req_id}, {FAILURE_AFFECTS}, UPSTREAM)`

### 4.12 BLOCKED BY FAILURE
`BLOCKED_BY_FAILURE(req_id) = TRAVERSE({req_id}, {FAILURE_AFFECTS}, DOWNSTREAM)`

## 5. COMPOSABILITY RULES
All queries must support composition:
`QUERY ::= primitive | QUERY ⊕ QUERY | TRAVERSE(QUERY, ...)`
Where `⊕ ∈ {UNION, INTERSECT, DIFF}`

**Example**:
“Active functional requirements that depend on split chains”
```python
INTERSECT(
  SELECT(state == ACTIVE),
  TRAVERSE(
    SELECT(type == "functional"),
    {SPLITS_TO},
    UPSTREAM
  )
)
```

## 6. EXECUTION MODEL
### 6.1 Query evaluation order
1. Evaluate `SELECT` sets
2. Evaluate `TRAVERSE` expansions
3. Apply set operations
4. Return stable sorted node list

### 6.2 Determinism rule
`Same INDEX + GRAPH → identical query results`
No dependence on event order, filesystem, or execution timing.

## 7. QUERY SAFETY RULES
- **Q1 — No event access**: Queries MUST NOT reference CAPTURE_RECORD.
- **Q2 — No mutation**: Queries MUST NOT modify INDEX or GRAPH.
- **Q3 — Closure**: All results must be subsets of known nodes.
- **Q4 — Finite traversal**: Traversal must terminate (no infinite loops on malformed graphs).

## 8. RECOMMENDED IMPLEMENTATION SHAPE (Python)
This maps cleanly to:
```python
class QueryEngine:
    def select(self, predicate): ...
    def traverse(self, nodes, edges, direction): ...
    def union(self, a, b): ...
    def intersect(self, a, b): ...
    def diff(self, a, b): ...

# Macros
def active(): ...
def lineage(req_id): ...
def impact(req_id): ...
def canonical(req_id): ...
```

## 9. SYSTEM COMPLETENESS STATEMENT
At this point the system has 5 discrete layers:
1. **Event layer**: append-only semantic history
2. **Reducer layer**: deterministic state + graph construction
3. **Projection layer**: INDEX, GRAPH, TO_DATE
4. **Query layer**: composable reasoning interface (this spec)
5. **Failure query layer**: queryable failure nodes + causal impact edges

## 10. ONE-SENTENCE FINAL FORM
The system is a deterministic event-sourced semantic graph engine with a pure functional query layer over materialized projections, enabling reproducible reasoning over requirement evolution, lineage, impact, and failure causality, with failures surfaced as first-class queryable entities.
