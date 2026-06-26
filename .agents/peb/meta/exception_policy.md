> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Exception Policy (Decentralized)

This policy governs the `peb-exception-router`.

## Principle
The Router is NOT a single decision chokepoint. It is a Hard-Fail Circuit Breaker and Edge-Router. It does not resolve soft conflicts.

## Escalation Rules
- **HARD LAW BREACH (HALT)**: The Router intervenes directly to halt the pipeline only when there is irrecoverable state corruption, explicit authority leakage, or missing machine contracts.
- **SOFT LAW UNCERTAINTY (EDGE ROUTE)**: For ambiguous architecture drift or missing context, the Router does NOT decide. It generates an `ExceptionEvent` and routes to the observation layer (diagnostic stream). `mode-router` is excluded from the escalation path.
- **REQUEST_CLARIFICATION**: Passed through to the cognitive layers.
