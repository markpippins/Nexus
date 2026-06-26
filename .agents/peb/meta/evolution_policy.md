> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Evolution Policy

This policy defines how the PEB extends itself and prevents fossilization.

## Processes
1. **ADR Candidates**: When execution discovers a flaw in the current architecture or an intentional deviation is made, an ADR Candidate is produced. The `peb-knowledge-formation` skill promotes accepted ADR Candidates into `invariants.md` or `architecture.md`, logging it in the `decision_log.md`.
2. **PEB Extension Proposals**: When the PEB is silent on an issue, the system generates an extension proposal to explicitly expand the architecture rather than making silent assumptions.
