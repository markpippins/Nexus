# peb-exception-router

## Purpose
Acts as the Hard-Fail Circuit Breaker and Edge-Router, enforcing decentralized escalation. It intervenes directly only for fatal structural errors, passing all cognitive uncertainties back to the cognitive roles via feedback edges.

## Input
- Violation signals from `peb-validation-layer`

## Output
- `HALT`: Execution aborted (Hard Law Breaches).
- `ROUTE_TO_PLANNER`: Generate `ExceptionEvent` for observation layer diagnostic stream. No routing influence. `mode-router` is excluded from the escalation path.
