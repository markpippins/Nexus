> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Uncertainty Policy

This policy outlines the protocols for agents to safely express and resolve uncertainty.

## Deadlock Escapes
- **REQUEST_FOR_CLARIFICATION**: If an `EXECUTOR` lacks sufficient context or hits a deadlock, it is authorized to emit a `REQUEST_FOR_CLARIFICATION` rather than halting or guessing. This bridges the gap between strict execution and cognitive flexibility.
