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

Executor binding is now split into two entry points:
- `select()` — called by the lowering pass (Phase 1.5) for capability-based executor selection
- `acquire()` — called by the scheduler (Phase 2) for runtime availability validation

See `SKILL.md` for the current contract.
