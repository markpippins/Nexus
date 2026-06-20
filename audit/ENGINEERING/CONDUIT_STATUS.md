# Conduit Status — Active System Reference

**Purpose:** This document is the single canonical reference for the relationship between the aspirational Nexus Work Request Pipeline (WRP) architecture and the active Conduit system. Files that describe the aspirational WRP architecture link here instead of repeating the status inline.

---

## Status Summary

| System | Status | Location |
|---|---|---|
| **Conduit** (active) | Operational — cron-driven pipeline | `nexus/python/conduit/`, `nexus/typescript/conduit-mcp/` |
| **Nexus WRP** (aspirational) | Inactive — under construction, not operational | `nexus/audit/` (spec documents), `nexus/.agent/` (configuration) |

## The Active System: Conduit

Conduit is the operational pipeline that processes WorkRequests today. It consists of:

- **Python orchestrator** (`nexus/python/conduit/`) — cron-driven WorkRequest processor using Temporal workflows
- **TypeScript MCP server** (`nexus/typescript/conduit-mcp/`) — Express server providing plan management, ticket lifecycle, session tracking, and AI config via MCP tools
- **Angular UI** (`nexus/angular/conduit-ui/`) — dashboard for plan viewing, AI config, and pipeline monitoring
- **Data store** — PostgreSQL (migrated from SQLite; see [`conduit-db-conversion.md`](./conduit-db-conversion.md))

### What Conduit Does

1. Receives user intent via the Planner agent
2. Creates plans (markdown files + DB rows)
3. Issues receipts (PLAN_CREATE, IMPLEMENTATION, etc.) through the pipeline manager
4. Dispatches WorkRequests to model executors (Ollama, OpenCode, etc.)
5. Manages ticket lifecycle (open → claimed → complete/failed/stale)
6. Tracks work sessions and audit trails

### Key Conduit Documents

| Document | What It Covers |
|---|---|
| [`conduit-code-assessment.md`](./conduit-code-assessment.md) | Current state assessment — FS/DB tension, PG migration progress |
| [`conduit-db-conversion.md`](./conduit-db-conversion.md) | SQLite → PostgreSQL migration specification |
| [`ARCHITECTURE/conduit-hang-remediation.md`](./ARCHITECTURE/conduit-hang-remediation.md) | Hang cycle fixes for model dispatch |
| [`pipeline-manager-acceptance-checklist.md`](./pipeline-manager-acceptance-checklist.md) | Final acceptance criteria for the pipeline manager |
| [`DAEMON_README.md`](./DAEMON_README.md) | WRP Daemon — watches `.conduit-data/WORK_REQUESTS/` |

## The Aspirational Architecture: Nexus WRP

The documents in `nexus/audit/` (top-level specs) describe the intended long-term architecture for the Nexus Work Request Pipeline. This architecture is **inactive** — it represents design intent, not operational reality.

### What the WRP Aspires To

A four-phase compiler + runtime + introspection architecture:

```
Phase 1:   Specification Compiler  (Prompt → WorkRequestGraph)
Phase 1.5: Lowering Compiler       (WorkRequestGraph → ExecutionGraph)
Phase 2:   Execution Runtime        (ExecutionGraph → EventLog)
Phase 3:   Observation Layer        (EventLog + ExecutionGraph → View AST)
```

Key concepts defined in the aspirational specs:
- **WorkRequest IR** — canonical intermediate representation
- **ExecutionGraph** — frozen runtime AST
- **CER (Canonical Event Record)** — single canonical event format
- **CCNF** — deterministic normalization function
- **Replay Engine** — temporal state reconstruction
- **Validator** — four-dimension validation (Static, Runtime, AEI, HAEC)
- **PEB** — Persistent Engineering Brain (governance kernel)
- **CIRS** — Cognitive Integrity Rule System

### Aspirational Spec Documents

| Document | What It Defines |
|---|---|
| [`COMPILER_ARCHITECTURE.md`](./COMPILER_ARCHITECTURE.md) | Four-phase architecture overview (hub document) |
| [`WORKREQUEST_SPEC.md`](./WORKREQUEST_SPEC.md) | WorkRequest IR specification |
| [`EXECUTION_GRAPH_SCHEMA.md`](./EXECUTION_GRAPH_SCHEMA.md) | ExecutionGraph schema v2 |
| [`PHASE1_SPECIFICATION_COMPILER.md`](./PHASE1_SPECIFICATION_COMPILER.md) | Phase 1 — Prompt → WorkRequestGraph |
| [`LOWERING_PASS.md`](./LOWERING_PASS.md) | Phase 1.5 — WorkRequestGraph → ExecutionGraph |
| [`PHASE2_EXECUTION_RUNTIME.md`](./PHASE2_EXECUTION_RUNTIME.md) | Phase 2 — ExecutionGraph → EventLog |
| [`OBSERVATION_MODEL.md`](./OBSERVATION_MODEL.md) | Phase 3 — semantic projection |
| [`VALIDATOR_SPEC.md`](./VALIDATOR_SPEC.md) | ExecutionGraph Validator |
| [`CER_SPEC.md`](./CER_SPEC.md) | Canonical Event Record format |
| [`CER_CCNF.md`](./CER_CCNF.md) | CER Canonical Normalization Function |
| [`REPLAY_ENGINE.md`](./REPLAY_ENGINE.md) | Temporal AST interpreter |
| [`DISTRIBUTED_SCHEDULER.md`](./DISTRIBUTED_SCHEDULER.md) | Multi-host scheduler |
| [`EVENT_GRAMMAR.md`](./EVENT_GRAMMAR.md) | Event type taxonomy |
| [`peb-mcp-spec.md`](./peb-mcp-spec.md) | PEB governance kernel |
| [`cognitive-integrity-rule-system.md`](./cognitive-integrity-rule-system.md) | CIRS rule framework |
| [`atten-spec.md`](./atten-spec.md) | Atten projection generator |

## The Bridge: Shared Concept

The **only shared concept** between the aspirational WRP and the active Conduit system is the **`WorkRequest` type** — the canonical unit of executable intent.

In Conduit, WorkRequests are JSON files written to `.conduit-data/WORK_REQUESTS/` and rows in the `work_requests` PostgreSQL table. In the WRP specs, WorkRequests are the canonical IR that flows through the compiler pipeline.

## Architecture Intentions (Not Yet Operational)

Several concepts from the aspirational specs are referenced in active code or configuration but are **not yet operational**:

| Concept | Where It Appears | Status |
|---|---|---|
| PEB (Persistent Engineering Brain) | `nexus/.agent/peb/` directory | Aspirational — flat files, not queryable |
| CIRS rules | `cognitive-integrity-rule-system.md` | Design complete, not enforced in runtime |
| Atten | `atten-spec.md` | Design only — no implementation |
| CER event log | Event system specs | Conduit uses flat files, not CER |
| Replay Engine | Replay spec | No implementation |
| ExecutionGraph | Execution specs | No implementation |

## Related Cross-References

- [`CROSS_REFERENCES.md`](./CROSS_REFERENCES.md) — Full concept-to-file index
- [`ANALYSIS.md`](./ANALYSIS.md) — System analysis with WRP vs Conduit comparison
- [`ANALYSIS/operator-plane-gap-analysis.md`](./ANALYSIS/operator-plane-gap-analysis.md) — Gap analysis between aspirational and operational
