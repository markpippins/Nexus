> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Trace Policy

This policy governs when and how the Execution Context is instrumented. It prevents fragmented cognition governance and trace corruption by verbosity.

## Instrumentation Boundaries
Only cognitive boundaries may append to the Execution Context. Structural and utility skills inherit the trace context but do NOT append to it.
Authorized cognitive boundary skills:
- `mode-router`
- `decompose-task`
- Planner, Executor, Critic (via `work-request-emission`)
- `peb-exception-router`

## Causal DAG Schema
The execution trace is a Directed Acyclic Graph (DAG) of reasoning, not a flat list of episodes. Every append MUST follow this YAML schema:

```yaml
RUN_SEGMENT:
  id: [unique_segment_id]
  parent_segment_id: [id_of_preceding_segment]
  stage: [cognitive_role_or_skill]
  inputs: [summary of PEB/Thought Context state]
  causal_entries: [Why a transformation or decision occurred]
  rejected_alternatives: [Branch points considered and discarded]
```
