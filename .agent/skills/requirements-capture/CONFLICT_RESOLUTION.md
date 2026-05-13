# REQUIREMENTS SYSTEM — CONFLICT RESOLUTION LAYER v1

## 1. CORE PRINCIPLE
Conflicts are not removed. They are explicitly represented and deterministically resolved.
- No hidden arbitration.
- No heuristic-only decisions.
- No silent overrides.
Everything becomes a graph + rule evaluation.

## 2. WHAT COUNTS AS A CONFLICT
A conflict exists when two or more requirements or execution paths satisfy:

- **C1 — Structural conflict**: Two ACTIVE requirements encode mutually incompatible intent. (e.g., REQ-A: “must use PostgreSQL”, REQ-B: “must use SQLite only”)
- **C2 — Dependency conflict**: A requirement depends on multiple upstream nodes that cannot coexist.
- **C3 — Execution conflict**: Two tasks compete for mutually exclusive resource or ordering constraint.
- **C4 — Semantic duplication divergence**: Multiple nodes represent same intent but diverge in refinement history.

## 3. CONFLICT REPRESENTATION MODEL
Conflicts are **FIRST-CLASS GRAPH OBJECTS**.

### 3.1 Conflict Node
```json
Conflict = {
  "conflict_id": "str",
  "type": "structural | dependency | execution | semantic",
  "participants": ["RequirementID"],
  "description": "str",
  "severity": "low | medium | high | fatal",
  "timestamp": "str"
}
```

### 3.2 Conflict Edge
Conflicts connect to requirements: `Requirement ↔ Conflict`
Edge types: `INVOLVES`, `CAUSED_BY`, `RESOLVED_BY`

## 4. CONFLICT DETECTION RULES
Conflicts are derived during REDUCE + QUERY phases.

### 4.1 Structural conflict detection
```python
if requirements have contradictory constraints:
    emit CONFLICT(type="structural")
```
Detected via incompatible TYPE fields, mutually exclusive implementation hints, explicit negation in intent.

### 4.2 Dependency conflict detection
```python
if DAG traversal yields cycles or deadlocks:
    emit CONFLICT(type="dependency")
```

### 4.3 Execution conflict detection
```python
if two READY tasks require exclusive resources:
    emit CONFLICT(type="execution")
```

### 4.4 Semantic drift detection
```python
if DUPLICATE_OF chains diverge beyond threshold:
    emit CONFLICT(type="semantic")
```

## 5. RESOLUTION FUNCTION
### 5.1 Core resolver signature
```python
def resolve(conflicts, index, graph) -> ResolutionPlan:
    ...
```

### 5.2 Resolution output
```json
ResolutionPlan = {
  "resolved": ["Resolution"],
  "unresolved": ["Conflict"],
  "side_effect_events": ["Event"]
}
```

### 5.3 Resolution object
```json
Resolution = {
  "conflict_id": "str",
  "strategy": "str",
  "winner": "RequirementID | None",
  "actions": ["str"]
}
```

## 6. RESOLUTION STRATEGIES (FINITE SET)
You are NOT allowed arbitrary heuristics outside this set.

### 6.1 SUPRESEDE_RESOLUTION
One requirement replaces another (higher confidence or newer refinement wins).
**Event emitted**: `REQ_SUPERSEDED`

### 6.2 MERGE_RESOLUTION
Combine incompatible but partially overlapping requirements.
**Event emitted**: Create unified `REQ_MERGED` node

### 6.3 SPLIT_RESOLUTION
Conflict arises from under-decomposition.
**Event emitted**: Decompose into orthogonal sub-requirements

### 6.4 PRIORITY_RESOLUTION
Deterministic ranking wins.
`priority_score = confidence + recency_weight + implementation_clarity - contradiction_count`
Highest score wins.

### 6.5 INVALIDATION_RESOLUTION
One branch is deemed non-viable.
**Event emitted**: `REQ_INVALIDATED`

### 6.6 DEFER_RESOLUTION
Cannot resolve in current information state. Mark conflict as unresolved, block dependent execution.

## 7. RESOLUTION ORDERING RULE
Conflicts MUST be resolved in deterministic order:
1. structural
2. dependency
3. semantic
4. execution

## 8. CONFLICT-AWARE REDUCER EXTENSION
During reduction:
```python
for each event:
    apply transition
    then run conflict_detector()
    attach conflicts to graph
```

## 9. EXECUTION LAYER INTEGRATION
### 9.1 Task blocking rule
`TASK is BLOCKED if: exists unresolved CONFLICT affecting its req_id`

### 9.2 Safe execution rule
`Only execute tasks where: no high or fatal conflicts exist upstream`

## 10. CONFLICT LIFECYCLE
`DETECTED → ACTIVE → RESOLVED | DEFERRED`

### 10.1 RESOLVED
Emits structural event(s). Modifies graph only via event log.

### 10.2 DEFERRED
Remains in system. Blocks dependent nodes. No structural change.

## 11. CRITICAL SYSTEM INVARIANTS
- **I1 — No silent resolution**: Every resolution MUST emit at least one event.
- **I2 — No hidden preference**: No heuristic outside `RESOLUTION_STRATEGIES`.
- **I3 — Deterministic conflict detection**: Same graph ⇒ same conflicts.
- **I4 — Conflicts are data**: Not exceptions. Not logs. Nodes in the system.

## 12. SYSTEM COMPLETENESS (UPDATED ARCHITECTURE)
You now have:
1. **Event system**: Semantic history
2. **Reducer**: Deterministic state + graph
3. **Query DSL**: Composable reasoning
4. **Execution layer**: Task projection + scheduling
5. **Conflict system (this layer)**: Deterministic ambiguity resolution + blocking logic

## 13. FINAL FORMULA (FULL SYSTEM)
```text
EVENTS
  → REDUCER
    → INDEX + GRAPH
      → QUERY DSL
        → EXECUTION PLAN
          → CONFLICT DETECTION
            → RESOLUTION EVENTS
              → EVENTS
```
Closed loop.

## 14. ONE-SENTENCE SUMMARY
The system resolves ambiguity by elevating conflicts to first-class graph entities and deterministically transforming them through a finite resolution strategy set, ensuring that even contradictory requirement states produce reproducible execution outcomes.
