> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
---
name: pipeline-intent
description: Defines or updates the Pipeline Intent Contract for a pipeline.
---

# Pipeline Intent Skill

## Purpose
Establishes the Pipeline Intent Contract for an existing pipeline workspace. This is a decision skill, not a setup skill.

## Trigger
When the user asks to "define intent", "configure pipeline", "set pipeline purpose" — any request about pipeline semantics after infrastructure exists.

Also called in sequence after `pipeline-init` when the user says "set up a pipeline" (orchestrated externally — this skill does not invoke `pipeline-init` itself).

## Precondition
- `.pipeline/` directory MUST already exist at target
- If missing: error with message "Run pipeline-init first" — do not auto-invoke

## Execution

### Step 1: Analyze context
Apply deterministic inference rules per `PIPELINE_INTENT_SPEC.md §5.1`:

| Context | direction | processingMode | mutationScope |
|---|---|---|---|
| Target has `src/` with source files | external-only | execute | filesystem.write=all, code.write=true |
| Target is empty | external-only | generate | filesystem.write=non-code-only, code.write=false |
| User said "instrument"/"telemetry" | internal-instrumentation | execute | code.write=true, runtime.instrument=true |
| User said "plan"/"architect" | external-only | generate | filesystem.write=non-code-only, code.write=false |
| User said "transform WRs" | external-only | transform | filesystem.write=non-code-only, code.write=false |

### Step 2: Ask user when ambiguous
If no single deterministic rule matches, or multiple match:
- Present all valid options with their ExecutionState consequences
- Require explicit confirmation
- Do NOT default

### Step 3: Write PIPELINE_INTENT.yaml
Write the resolved contract to `<target>/.pipeline/PIPELINE_INTENT.yaml`:

```yaml
pipelineIntent:
  specification: "v1"
  direction: <resolved>
  processingMode: <resolved>
  mutationScope:
    filesystem:
      read: true
      write: <resolved>
    code:
      write: <resolved>
    runtime:
      instrument: <resolved>
```

### Step 4: Update pipeline-mode.json
Write to `<target>/.agents/pipeline-mode.json`:
- `mode`: `plan` if ExecutionState is READ_ONLY_PLAN or TRANSFORM, `execute` otherwise
- `intent_source: <removed: CIR-1 — no pipeline exists>

## Expected Result
- `.pipeline/PIPELINE_INTENT.yaml` with valid, normalized intent
- `.agents/pipeline-mode.json` with mode + intent_source
