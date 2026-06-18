>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# REQUIREMENTS SYSTEM — EXECUTION BINDING LAYER v1

## 1. CORE PRINCIPLE
Execution is derived from QUERY outputs, never directly from events or raw state.
This preserves your architecture:
`EVENTS → REDUCER → INDEX/GRAPH → QUERY DSL → EXECUTION LAYER`
Execution is the last projection, not a parallel system.

## 2. EXECUTION INPUT CONTRACT
All execution starts from a bounded query result:
```json
ExecutionInput = {
  "query": "Query",
  "result_set": ["RequirementID"]
}
```

## 3. EXECUTION MODEL
### 3.1 Execution Unit
Each requirement becomes a Task Node:
```json
Task = {
  "req_id": "str",
  "state_snapshot": "RequirementNode",
  "dependencies": ["str"],
  "status": "pending | ready | blocked | in_progress | done",
  "execution_metadata": "dict"
}
```
**Important**: Tasks are NOT requirements. They are projections of requirements into actionable units.

## 4. TASK DERIVATION RULE
Tasks are created ONLY from queries:
`Tasks = f(QUERY_OUTPUT)`
**Never**:
- from raw INDEX
- from events
- from filesystem state

## 5. CORE EXECUTION QUERIES
These are the ONLY sanctioned entry points for execution.

### 5.1 IMPLEMENTATION PLAN QUERY
`PLAN_SET = SELECT(state == ACTIVE)`
Optionally refined:
```python
PLAN_SET = INTERSECT(
    SELECT(state == ACTIVE),
    SELECT(confidence >= threshold)
)
```

### 5.2 READY QUEUE
A requirement is executable if:
```python
READY(req) =
  state == ACTIVE
  AND all dependencies satisfied
  AND not blocked by IMPACT constraints
```

### 5.3 BLOCKED SET
Derived via reverse dependency traversal:
`BLOCKED = IMPACT_SET_OF(implemented but unfinished dependencies) UNION TRAVERSE(FAILURE_AFFECTS, DOWNSTREAM)`

## 6. TASK STATE MACHINE
### 6.1 States
`TASK_STATE ∈ { pending, ready, blocked, in_progress, done }`

### 6.2 Transitions
| From | To | Trigger |
|---|---|---|
| pending | ready | dependencies satisfied |
| ready | in_progress | execution started |
| in_progress | done | completion confirmed |
| ready | blocked | dependency failure |
| blocked | ready | dependency resolved |

### 6.3 Determinism Rule
Task state is ALWAYS recomputed from:
- INDEX
- GRAPH
- dependency resolution

No persistent task truth allowed.

## 7. DEPENDENCY MODEL
Dependencies are derived exclusively from GRAPH:
```python
dependency(req) = TRAVERSE(req, {SPLITS_TO, MERGED_INTO, SUPERSEDED_BY}, UPSTREAM)
```
**Rule**: A task cannot become READY if any upstream dependency is not IMPLEMENTED or TESTED (configurable policy).

## 8. EXECUTION PLAN GENERATION
### 8.1 PLAN STRUCTURE
```json
ExecutionPlan = {
  "ready": ["Task"],
  "blocked": ["Task"],
  "in_progress": ["Task"],
  "done": ["Task"]
}
```

### 8.2 PLAN GENERATION FUNCTION
`PLAN = build_execution_plan(QUERY_RESULT, INDEX, GRAPH)`

## 9. IMPLEMENTATION PIPELINE
### 9.1 Pipeline stages
1. **Stage 1 — Query selection**: `SELECT` candidate requirements
2. **Stage 2 — Dependency expansion**: `TRAVERSE` GRAPH for upstream constraints
3. **Stage 3 — Task construction**: map `REQ → Task`
4. **Stage 4 — Scheduling classification**: assign `READY / BLOCKED / PENDING`

## 10. EXECUTION SAFETY INVARIANTS
- **I1 — No direct mutation of requirements**: Execution layer MUST NOT modify INDEX, modify GRAPH, or emit events. Failure events are the sole exception and must pass through the event system, not bypass it.
- **I2 — Execution is ephemeral**: Tasks exist only in runtime. If recomputed, tasks must be identical.
- **I3 — Single direction of causality**: `REQUIREMENTS → TASKS`, NOT `TASKS → REQUIREMENTS`.
- **I4 — No hidden state**: All task status must be derivable from INDEX, GRAPH, FAILURE GRAPH, and execution input snapshot.
- **I5 — Failure-aware scheduling**: Tasks blocked by failure edges MUST NOT be scheduled as READY.

## 11. FEEDBACK LOOP (CRITICAL)
Execution outcomes re-enter system ONLY as events. Execution NEVER bypasses event system.

### 11.1 Completion feedback
```json
{
  "type": "REQ_IMPLEMENTED",
  "req_id": "...",
  "payload": { ... }
}
```

### 11.2 Failure feedback
```json
{
  "type": "REQ_REFINED",
  "req_id": "...",
  "payload": {
    "confidence": 0.3,
    "implementation_hint": "needs revision"
  }
}
```

## 12. SYSTEM ARCHITECTURE (FINAL FORM)
You now have a complete closed loop:
1. **Capture layer**: Append-only semantic intent log
2. **Reduction layer**: Deterministic state + graph builder
3. **Query layer**: Composable reasoning system
4. **Execution layer (this spec)**: Deterministic task projection + scheduling
5. **Failure detection layer**: Run-time failure observation + propagation via FAILURE_GRAPH
6. **Feedback loop**: Execution → events → system evolution

## 13. FINAL FORMULA
```
SYSTEM = f(event_log) 
  → reducer → (index, graph)
  → query_dsl
  → execution_projection
  → failure_detection → failure_graph
  → feedback_events
  → event_log
```

## 14. ONE-SENTENCE SUMMARY
Execution is a pure, ephemeral projection of query results over a deterministic event-sourced requirements graph, with all outcomes (including failure detection) fed back exclusively through the event system, preserving full reversibility, reproducibility, and failure traceability of system state.
