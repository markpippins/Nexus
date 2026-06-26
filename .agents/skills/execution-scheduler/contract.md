> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
---
superseded_by: SKILL.md
phase: execution
status: migrated
---

This file has been superseded by `SKILL.md` in the same directory.

The Scheduler receives a frozen ExecutionGraph from the Phase 1.5 lowering pass. All executor selections are already populated. The scheduler acquires (does not re-select) executors at runtime. See `SKILL.md` for the current contract.
