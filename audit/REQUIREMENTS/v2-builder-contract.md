# v2 Builder Contract Requirements

**Captured:** 2026-06-05
**Source:** Builder Contract v1 (Ollama Execution Layer) proposal
**Status:** Requirements — not yet implemented

## Summary

Replace the current markdown-plan→freeform-implementation builder model with an
Execution Packet system where the Planner emits machine-readable diffs and the
Builder is a deterministic execution engine with zero creative authority.

## What stays from v1 (already implemented)

- One plan per session (v062)
- Receipt-based state tracking (v055-v058)
- Watcher→Builder→Reviewer cycle
- Circuit breaker with ollama fallback (config-based)
- Structured change reports (CHANGES/committed/)

## v2 Changes Required

### 1. Planner → Builder Protocol

Planner must emit an "Execution Packet" JSON alongside the markdown plan:

```json
{
  "task_id": "v057",
  "execution_contract": {
    "invariants": ["SQLite schema must remain backward compatible"],
    "allowed_operations": ["create_file", "modify_function", "add_schema_field"],
    "forbidden_operations": ["rename_core_types", "change_event_semantics"],
    "data_model": { ... },
    "module_map": { ... },
    "acceptance_tests": [ ... ]
  },
  "diff": [
    {
      "op": "modify_function",
      "target": "db.ts:getReceipt",
      "change": { "type": "patch", "replace": "..." }
    }
  ]
}
```

### 2. Atomic Diff Operations

Allowed operations only:
- `create_file`
- `modify_file`
- `modify_function`
- `add_function`
- `add_schema_field`
- `delete_field` (gated)
- `wire_dependency`

Core rule: "If it is not expressible as an atomic diff, it is not executable."

### 3. Builder Behavior Contract

Non-negotiable rules:
- **No invention**: missing info → `NEEDS_CLARIFICATION` (never guess)
- **No scope expansion**: don't "also improve X"
- **No multi-tasking**: one packet = one execution
- **Deterministic output**: always valid JSON `{ "status": "completed"|"needs_clarification", ... }`

### 4. Memory Model

- Planner provides full context as static snapshot
- Builder treats context as frozen, no cross-task memory
- No long-context reasoning required (targets Llama 3 8B class models)

### 5. Watchdog Change

From time-based kill → progress-based kill:
- Builder emits periodic "diff progress ticks"
- Watchdog expects ticks at regular intervals
- Long executions are not suspicious if progress is reported

## Implementation Order

| Phase | What | Prerequisites |
|-------|------|---------------|
| Phase 1 | Planner emits Execution Packets | New Planner output format |
| Phase 2 | Builder-fallback adopts JSON contract | builder-fallback.md prompt |
| Phase 3 | Builder-default adopts JSON contract | builder.md prompt update |
| Phase 4 | Progress-based watchdog | Phase 1-3 complete |

## Not for v1

- Changing plan file format (markdown stays)
- Removing current freeform builder (coexists with contract builder)
- Forcing all agents to adopt the contract (phased approach)
