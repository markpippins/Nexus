> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
---
name: sync-plans
description: Synchronizes the implementation records with the written plans and the current codebase.
---

# Sync Plans Skill

## Purpose

Ensure that the `implementation_plan.md` accurately reflects the state of the codebase and that all planned tasks have been correctly translated into WorkRequests.

## Rules

1. Review the current `implementation_plan.md` in `IMPLEMENTATION_PLAN_RECORD`.
2. Compare the plan with the actual changes made to the codebase and the generated `WorkRequests`.
3. Update the `implementation_plan.md` to mark completed tasks, update progress, and adjust the roadmap as needed.
4. Ensure the `walkthrough.md` is updated to reflect the current flow of the system.
5. This skill should be triggered periodically or after a major set of tasks is completed.
