> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
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
