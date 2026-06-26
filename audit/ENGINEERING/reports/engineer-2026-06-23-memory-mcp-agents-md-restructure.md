# Session Report: memory-mcp + AGENTS.md restructure

**Date:** 2026-06-23  
**Role:** Engineer  
**Tags:** `infrastructure`, `mcp`, `role-memory`, `documentation`

## Summary

Built the Role Memory Procedure Registry MCP tools (memory-mcp) and
restructured AGENTS.md into a clean 4-tier architecture.

## Accomplishments

### #1008 — memory-mcp MCP tools (tackle-mcp)

Added 4 memory tools to tackle-mcp that read from the Redis cache maintained
by role-memory-srv (port 3500):

| Tool | Purpose | Source |
|------|---------|--------|
| `memory_get_procedures(role)` | Return procedure index for a role | Redis |
| `memory_get_procedure(slug)` | Return full procedure card | Redis |
| `memory_check_since(role, since)` | Check role_memory changes since timestamp | PostgreSQL |
| `memory_refresh()` | Trigger full PG→Redis sync | HTTP → role-memory-srv |

**Changes made:**
- Added `ioredis` dependency to tackle-mcp
- Created `src/memory.ts` — Redis connection, reader functions, PG change-check,
  and refresh proxy
- Updated `src/tools.ts` — 4 new tool definitions + handlers
- Updated `src/index.ts` — Redis initialization on startup, graceful shutdown

### #1009 — AGENTS.md restructure

Restructured the 1010-line flat document into a 4-tier hierarchy:

- **Preamble** — scope, intent, agent baseline
- **Tier 1: Operating Model** — database-first, messaging, governance,
  knowledge stratification
- **Tier 2: Turn Protocol** — bootstrap, post-turn, health check, backlog,
  planning check, elucidation
- **Tier 3: Role Overlays** — role memory registry, rover harvest, terrain
  registration, prompt/proposal capture
- **Tier 4: Meta-Governance** — boot procedure, reality rule, work request
  participation, safety, priority order
- **Appendix** — tool reference for nebula-mcp, tackle-mcp, conduit-mcp,
  plan deletion, orphan detection, chat integration, DAG direction

Added new sections:
- Role Memory Procedure Registry architecture diagram + usage flow
- tackle-mcp tool quick-reference tables

## Files Changed

- `nexus/typescript/tackle-mcp/package.json` — added `ioredis`
- `nexus/typescript/tackle-mcp/src/memory.ts` — **new** Redis reader module
- `nexus/typescript/tackle-mcp/src/tools.ts` — added 4 memory tool defs + handlers
- `nexus/typescript/tackle-mcp/src/index.ts` — Redis init + graceful shutdown
- `AGENTS.md` — restructured into tiered hierarchy (v2.0)
