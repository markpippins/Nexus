> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# peb-exception-router

## Purpose
Acts as the Hard-Fail Circuit Breaker and Edge-Router, enforcing decentralized escalation. It intervenes directly only for fatal structural errors, passing all cognitive uncertainties back to the cognitive roles via feedback edges.

## Input
- Violation signals from `peb-validation-layer`

## Output
- `HALT`: Execution aborted (Hard Law Breaches).
- `ROUTE_TO_PLANNER`: Generate `ExceptionEvent` for observation layer diagnostic stream. No routing influence. `mode-router` is excluded from the escalation path.
