# 007 — Circuit Breakers for Execution Trust Management

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript). Part of the Layer 3 primitive set; parent: `003-progressive-epistemic-instrumentation.md`.

## Architectural Intent

Circuit breakers manage **trust in execution**. In a probabilistic agentic runtime, any execution step can fail, loop, hallucinate, or diverge. Circuit breakers detect these conditions and interrupt execution before damage compounds. They are not error handlers — they are trust boundaries.

## Requirements & Acceptance Criteria

- [ ] Circuit breakers monitor execution state in real-time (not post-hoc)
- [ ] Three states: CLOSED (normal), OPEN (tripped, blocking execution), HALF-OPEN (probing recovery)
- [ ] Trip conditions: sustained failures, cost overrun, timeout, divergent output, safety violation
- [ ] Each circuit breaker is scoped to a specific trust boundary (agent, pipeline, model call)
- [ ] Tripped breakers emit structured events consumable by the Observability Layer
- [ ] Manual reset is required for OPEN → CLOSED transition (no automatic recovery)

## State Machine

```
    ┌──────────┐
    │  CLOSED  │  ← Normal operation. Execution proceeds.
    └────┬─────┘
         │ Trip condition detected
         ▼
    ┌──────────┐
    │   OPEN   │  ← Execution blocked. Must be manually reset.
    └────┬─────┘
         │ Manual reset
         ▼
    ┌───────────┐
    │ HALF-OPEN │  ← Probing: allows single execution to test recovery.
    └────┬──────┘
         │ Success → CLOSED     Failure → OPEN
         ▼
    ┌──────────┐
    │  CLOSED  │
    └──────────┘
```

## Implementation Notes

- Circuit breakers live in the Observability/Safety Layer (Layer 3)
- They wrap execution steps rather than being called inline
- Trip conditions are configurable per trust boundary
- A tripped circuit breaker should surface in the Scaffold UI immediately
- Kill switches are a manual override of a circuit breaker (not a separate mechanism)

## Unresolved Follow-Ups

- What is the minimum set of trip conditions for v0?
- Should circuit breakers be hierarchical (pipeline-level vs. step-level)?
- How do circuit breakers interact with kill switches?
