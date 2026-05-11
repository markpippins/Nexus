# peb-exception-router

## Purpose
Acts as the Hard-Fail Circuit Breaker and Edge-Router, enforcing decentralized escalation. It intervenes directly only for fatal structural errors, passing all cognitive uncertainties back to the cognitive roles via feedback edges.

## Input
- Violation signals from `peb-validation-layer`

## Output
- `HALT`: Execution aborted (Hard Law Breaches).
- `ROUTE_TO_PLANNER`: Signal routed via feedback edge to `mode-router` to resolve soft conflicts and `PEB_EXTENSION_PROPOSAL`s.
