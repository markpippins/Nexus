> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Recording Rules (.pipeline/PROMPT_RECORDS & .pipeline/IMPLEMENTATION_PLAN_RECORD)

## Overview

To ensure traceability and consistency, the agent must maintain a dual-record system when operating as a planner.

## Rules

1. **Prompt Archiving**:
   - Every major task or phase start must have its initiating prompt recorded in `.pipeline/PROMPT_RECORDS`.
   - Files should be named `layer_<alpha>_<name>_prompt.md`.
   - If the directory does not exist, the agent should propose creating it.

2. **Implementation Stacking**:
   - The current state of `implementation_plan.md`, `task.md`, and `walkthrough.md` must be preserved in `.pipeline/IMPLEMENTATION_PLAN_RECORD`.
   - The "Stacking Pattern" must be followed:
     - `file.md` (Current)
     - `file.md.resolved` (Snapshot of the most recent completion)
     - `file.md.resolved.N` (Historical sequence)
   - Every time a set of `WorkRequests` is emitted, the implementation records should be stacked.

3. **Synchronization**:
   - The `implementation_plan.md` must be synchronized with the actual codebase and generated `WorkRequests` to ensure the "single source of truth" is maintained.
