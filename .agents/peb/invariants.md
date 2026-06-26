> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Invariants

This document defines the hard laws and non-negotiable rules of the system.

## Hard Laws
1. **No Authority Leakage**: EXECUTORS may not emit WorkRequests. CRITICS may not execute steps or assign tasks.
2. **State Dependency**: System decisions must be grounded in the existing PEB state. Any derivation from silent parts of the PEB without explicit extension is a violation.
3. **Semantic Normalization**: All cognitive pipeline steps must produce parseable, structurally verifiable JSON metadata detailing context used, decisions, and next steps.
