---
name: archive-implementation
description: Records the current state of implementation (plans, tasks, walkthroughs) and stacks them in IMPLEMENTATION_RECORD.
---

# Archive Implementation Skill

## Purpose
Maintain a historical record of implementation states and ensure the current plan, task, and walkthrough are up to date.

## Rules
1. Check if `IMPLEMENTATION_RECORD` directory exists at the project root.
2. If it exists, update the following files:
   - `implementation_plan.md`
   - `task.md`
   - `walkthrough.md`
3. **Materialized State View**:
   - Produce or update `WORK_TO_DATE.md` at the project root.
   - `WORK_TO_DATE.md` is a compiled projection of:
     - Current intent interpretations.
     - Active WorkRequests and their lifecycle states.
     - Supersession history.
4. **Stacking Pattern**:
   - Before updating, "stack" the previous versions using the `stacker.py` logic.
5. Ensure all files are valid Markdown and include necessary metadata.

## Stacking Logic
- Find the highest `N` for `file.md.resolved.N`.
- Increment `N` and copy the current `file.md.resolved` to `file.md.resolved.N+1`.
- Copy current `file.md` to `file.md.resolved`.
- Overwrite `file.md` with the new content.
