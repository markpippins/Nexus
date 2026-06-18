>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: archive-implementation
description: Records the current state of implementation (plans, tasks, walkthroughs) and stacks them in IMPLEMENTATION_PLAN_RECORD.
---

# Archive Implementation Skill

## Purpose

Maintain a historical record of implementation states and ensure the current plan, task, and walkthrough are up to date.

## Rules

1. Check if `.pipeline/IMPLEMENTATION_PLAN_RECORD` directory exists at the project root.
2. If it exists, create new sequential plan files (e.g., `layer_<alpha>_implementation.md`, `layer_<alpha>_task.md`, etc.).
3. **Materialized State View**:
   - Produce or update `WORK_TO_DATE.md` at the project root.
   - `WORK_TO_DATE.md` is a compiled projection of:
     - Current intent interpretations.
     - Active WorkRequests and their lifecycle states.
     - Supersession history.
4. **Immutability (CRITICAL)**:
   - Implementation plans, tasks, and walkthroughs are a sequential record of work and MUST be treated as strictly immutable.
   - You MUST NEVER edit, overwrite, or delete an existing implementation record. New states always create a new versioned file.
5. Ensure all files are valid Markdown and include necessary metadata.
