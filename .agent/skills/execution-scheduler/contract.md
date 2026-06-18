>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
superseded_by: SKILL.md
phase: execution
status: migrated
---

This file has been superseded by `SKILL.md` in the same directory.

The Scheduler receives a frozen ExecutionGraph from the Phase 1.5 lowering pass. All executor selections are already populated. The scheduler acquires (does not re-select) executors at runtime. See `SKILL.md` for the current contract.
