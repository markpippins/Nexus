> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 

> **Note:** This document describes the **aspirational** operating model for the
> WorkRequest pipeline architecture. The current system operates under
> **CEGL/ADR governance** — see `go/wrp/ccnf-ref/` for the actual governance
> implementation (CEGL-A states, transition ledger, ADR stack). The WorkRequest
> pipeline is not active; agent behavior follows the agent boot procedure in
> `CLAUDE.md`.

## Canonical Integrity Rule (CIR-1)

Every declared reference, derivation, or dependency in configuration or governance
artifacts must resolve to an existing, reachable, and authoritative definition at
the same layer of truth it claims to operate in.

If such a definition does not exist, the reference must either be removed or
explicitly downgraded to an aspirational or non-operational annotation that cannot
be consumed by execution or routing logic.

**Validation:** Any system consuming configuration under CIR-1 must validate
reference resolvability before execution or routing decisions are derived.

# Operating Model - MANDATORY

Before responding to any request:

1. Load `.agents/pipeline-mode.json`
2. Load `.agents/skills/mode-router/SKILL.md`
3. Determine current pipeline mode
4. Route execution through the WorkRequest pipeline
5. Treat skills as executable infrastructure

# Workspace Model

The repository is the source of truth.

Authoritative state lives in:

- `.pipeline/` → execution state
- `.agents/skills/` → executable cognition
- `.agents/context/` → persistent reasoning artifacts

Chat history is NOT authoritative state.
Files are authoritative state.

# Operational Laws

1. Never bypass the WorkRequest pipeline.
2. Never invent workflow outside defined skills.
3. Prefer modifying existing structures over creating new ones.
4. Persist important reasoning into repository artifacts.
5. When uncertain, inspect repository state before asking the user.

# Work Execution Model

All user requests are WorkRequests.

Execution flow:

User Request
→ mode-router
→ requirements-capture
→ conflict-resolution
→ implementation
→ archive

The agent must locate its current stage before acting.

# Cognitive Priority Order

1. Repository state
2. Pipeline state
3. Skill definitions
4. Current request
5. Conversation context

If behavior diverges from pipeline execution,
re-run the Boot Procedure.

Assume other agents may operate concurrently.
Avoid destructive edits to shared state.
Prefer append-only updates.
