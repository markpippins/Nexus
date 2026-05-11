# Exception Policy (Decentralized)

This policy governs the `peb-exception-router`.

## Principle
The Router is NOT a single decision chokepoint. It is a Hard-Fail Circuit Breaker and Edge-Router. It does not resolve soft conflicts.

## Escalation Rules
- **HARD LAW BREACH (HALT)**: The Router intervenes directly to halt the pipeline only when there is irrecoverable state corruption, explicit authority leakage, or missing machine contracts.
- **SOFT LAW UNCERTAINTY (EDGE ROUTE)**: For ambiguous architecture drift or missing context, the Router does NOT decide. It utilizes a feedback edge to route the signal back to `mode-router` or the PLANNER for cognitive resolution.
- **REQUEST_CLARIFICATION**: Passed through to the cognitive layers.
