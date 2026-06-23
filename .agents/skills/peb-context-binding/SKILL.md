> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# peb-context-binding

## Purpose
Prepares the environment for the LLM by computing the `PEB_STATE_HASH` (for long-term memory) and `THOUGHT_CONTEXT_HASH` (for short-term memory), reading all files from `.agents/peb/` and `.agents/thought_context/`, and bundling them with the `UNIVERSAL_READ.md` contract and the appropriate Role Contract.

## Input
- `role_authority` (PLANNER, EXECUTOR, CRITIC)
- `cognitive_mode` (e.g., DEBUG, RESEARCH, REFACTOR)
- `work_request` or `intent`

## Output
- Structurally validated prompt payload with the `PEB READ CONTRACT`, hashes, dynamic role mode, and the temporally continuous `thought_context` appended.
