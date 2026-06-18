>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Exception Policy (Decentralized)

This policy governs the `peb-exception-router`.

## Principle
The Router is NOT a single decision chokepoint. It is a Hard-Fail Circuit Breaker and Edge-Router. It does not resolve soft conflicts.

## Escalation Rules
- **HARD LAW BREACH (HALT)**: The Router intervenes directly to halt the pipeline only when there is irrecoverable state corruption, explicit authority leakage, or missing machine contracts.
- **SOFT LAW UNCERTAINTY (EDGE ROUTE)**: For ambiguous architecture drift or missing context, the Router does NOT decide. It generates an `ExceptionEvent` and routes to the observation layer (diagnostic stream). `mode-router` is excluded from the escalation path.
- **REQUEST_CLARIFICATION**: Passed through to the cognitive layers.
