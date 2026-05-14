# REQUIREMENTS SYSTEM — FAILURE SEMANTICS v1

## 1. CORE PRINCIPLE

Failure is not external to the system. It is represented, recorded, and replayed as structured events.

There are only two unacceptable states:

- silent corruption
- non-deterministic divergence

Everything else becomes data.

## 2. FAILURE CLASSIFICATION MODEL

All failures fall into three layers:

### 2.1 EVENT LAYER FAILURES

Problems with input integrity.

- **F1 — Invalid event**: Malformed schema, missing fields, or unknown event type
- **F2 — Identity violation**: REQ_ID missing, duplicated, or malformed
- **F3 — Ordering ambiguity**: Events cannot be deterministically ordered

### 2.2 REDUCER LAYER FAILURES

Failures during state construction.

- **F4 — Transition violation**: Event implies invalid state transition
- **F5 — Graph inconsistency**: Edge references non-existent node or violates invariants
- **F6 — Non-deterministic reduction**: Same input yields different outputs (critical failure)

### 2.3 QUERY / EXECUTION LAYER FAILURES

Failures during interpretation and action.

- **F7 — Empty or ambiguous query result**: Query returns no nodes or multiple equally valid interpretations
- **F8 — Execution deadlock**: Tasks cannot proceed due to unresolved dependency cycle
- **F9 — Conflict saturation**: Too many unresolved conflicts block execution space

### 2.4 ARBITRATION / MULTI-AGENT FAILURES

- **F10 — Arbitration conflict collapse**: No deterministic winner among proposed events
- **F11 — Agent divergence explosion**: Agents produce irreconcilable event sets for same snapshot

## 3. FAILURE REPRESENTATION MODEL

Failures are NOT exceptions.

They are events.

### 3.1 Failure Event Schema

```json
FailureEvent = {
  "event_id": "str",
  "type": "FAILURE_*",
  "scope": "event | reducer | query | execution | arbitration",
  "severity": "warning | error | fatal",
  "context": {},
  "timestamp": "str"
}
```

### 3.2 Failure types (canonical set)

| Event Type | Scope | Severity |
|---|---|---|
| `FAILURE_INVALID_EVENT` | event | fatal |
| `FAILURE_IDENTITY_VIOLATION` | event | fatal |
| `FAILURE_ORDERING_AMBIGUITY` | event | fatal |
| `FAILURE_TRANSITION_VIOLATION` | reducer | error |
| `FAILURE_GRAPH_INCONSISTENCY` | reducer | error |
| `FAILURE_NON_DETERMINISM` | reducer | fatal |
| `FAILURE_QUERY_AMBIGUITY` | query | warning |
| `FAILURE_EXECUTION_DEADLOCK` | execution | error |
| `FAILURE_CONFLICT_OVERFLOW` | execution | warning |
| `FAILURE_ARBITRATION_COLLAPSE` | arbitration | error |
| `FAILURE_AGENT_DIVERGENCE` | arbitration | error |

## 4. FAILURE HANDLING RULES

### 4.1 HARD FAILURE (FATAL)

System MUST:
1. stop execution pipeline
2. emit FAILURE event
3. preserve full event log
4. prevent further state mutation

Examples: non-deterministic reducer, invalid event schema at ingestion boundary.

### 4.2 SOFT FAILURE (RECOVERABLE)

System:
1. emits FAILURE event
2. continues execution with degraded scope
3. marks affected nodes BLOCKED

Examples: partial query ambiguity, localized conflict cluster.

### 4.3 DEFERRED FAILURE

System:
1. emits FAILURE event
2. marks as unresolved
3. routes into conflict system

Examples: execution deadlock cycles, unresolved arbitration ties.

## 5. FAILURE → EVENT LOOP INTEGRATION

### 5.1 Failure is system input

`FAILURE_EVENT ∈ EVENT_LOG`

Meaning:
- failures are replayable
- failures affect future reduction
- failures shape graph state

### 5.2 Failure propagation rule

Failures propagate via GRAPH:

`Failure at node → impacts downstream nodes via IMPACT traversal`

## 6. FAILURE IN REDUCER (STRICT BEHAVIOR)

### 6.1 Reducer contract under failure

```python
def reduce(events):
    try:
        return normal_reduce(events)
    except Exception as e:
        emit_failure_event(e)
        halt_or_degrade()
```

### 6.2 Deterministic failure rule

Even failure behavior must be deterministic.

Given same events:
- same failures must be emitted
- same blocking decisions must occur

## 7. FAILURE IN QUERY LAYER

### 7.1 Ambiguity rule

If query returns ambiguous set:
`emit FAILURE_QUERY_AMBIGUITY`

AND optionally:
- request refinement query
- narrow selection automatically if deterministic rule exists

## 8. FAILURE IN EXECUTION LAYER

### 8.1 Execution stall rule

If TASK becomes BLOCKED due to failure:
`propagate FAILURE_EXECUTION_DEADLOCK`

### 8.2 Recovery rule

Execution may resume ONLY if:
`FAILURE resolved OR superseded by event`

## 9. FAILURE IN MULTI-AGENT SYSTEM

### 9.1 Divergence collapse rule

If agents cannot reconcile:
`emit FAILURE_AGENT_DIVERGENCE`

Then:
- route into arbitration failure system
- block event emission

### 9.2 Arbitration fallback

If arbitration fails:
1. freeze event stream
2. emit FAILURE_ARBITRATION_COLLAPSE
3. require explicit resolution event

## 10. FAILURE RESOLUTION MODEL

Failures are resolved via events, not patches.

### 10.1 Resolution event types

- `REQ_REFINED`
- `REQ_SPLIT`
- `REQ_SUPERSEDED`
- `REQ_INVALIDATED`

OR:

- `FAILURE_RESOLVED`

### 10.2 Resolution rule

A failure is only resolved when a new event explains why it no longer applies.

- No deletion.
- No override.
- No silent fix.

## 11. FAILURE STATE IN GRAPH

Failures become nodes in the graph.

### 11.1 Failure node rule

`FAILURE` nodes connect to:
- affected REQUIREMENTS
- triggering EVENTS
- downstream IMPACT paths

### 11.2 Why this matters

You now get:
- traceable system brittleness
- replayable debugging
- causal failure analysis

## 12. SYSTEM RESILIENCE MODEL

The system is:

- **NOT**: crash-prone imperative pipeline, exception-driven runtime, hidden retry system
- **BUT**: event-sourced failure graph machine

## 13. FINAL SYSTEM INVARIANTS (UPDATED)

- **I1 — No silent failure**: All failures MUST emit events
- **I2 — No hidden recovery**: Recovery must be explicit event sequence
- **I3 — Deterministic failure reproduction**: Same input → same failure events
- **I4 — Failures are first-class nodes**: They participate in GRAPH semantics
- **I5 — System halts on irreducible uncertainty**: No speculative execution allowed beyond defined rules

## 14. SYSTEM COMPLETENESS (FINAL ARCHITECTURE)

You now have 8 discrete layers:

1. **Event layer**: append-only semantic history (defined in `SKILL.md`)
2. **Reducer layer**: deterministic state + graph construction (defined in `REDUCER_CONTRACT.md`)
3. **Projection layer**: INDEX, GRAPH, TO_DATE (defined in `GRAPH_SEMANTICS.md`)
4. **Query layer**: composable reasoning interface (defined in `QUERY_DSL.md`)
5. **Execution layer**: deterministic task projection + scheduling (defined in `EXECUTION_BINDING.md`)
6. **Conflict Resolution layer**: deterministic ambiguity resolution + blocking logic (defined in `CONFLICT_RESOLUTION.md`)
7. **Multi-agent layer**: concurrent proposal system + deterministic arbitration (defined in `MULTI_AGENT_COORDINATION.md`)
8. **Failure layer (this spec)**: structured failure representation + deterministic recovery

## 15. FINAL FORMULA

```text
AGENTS (parallel)
  → propose events
    → ARBITRATION (total order)
      → EVENT LOG (single truth)
        → REDUCER
          → INDEX + GRAPH
            → QUERY DSL
              → EXECUTION
                → CONFLICT SYSTEM
                  → FAILURE DETECTION
                    → FAILURE GRAPH
                      → EVENTS
                        → AGENTS
```

Closed loop. Fully deterministic. Failure-safe by construction.

## 16. ONE-SENTENCE SUMMARY

The system represents failure as first-class event-sourced graph data rather than exceptions, ensuring that all system faults are deterministically replayable, causally traceable, and resolvable only through explicit event sequences.
