---
superseded_by: SKILL.md
phase: execution
status: migrated
---

This file has been superseded by `SKILL.md` in the same directory.

The Scheduler receives a frozen ExecutionGraph from the Phase 1.5 lowering pass. All executor selections are already populated. The scheduler acquires (does not re-select) executors at runtime. See `SKILL.md` for the current contract.
