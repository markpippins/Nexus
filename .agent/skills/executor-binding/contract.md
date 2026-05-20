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
