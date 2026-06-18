>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Default Agent Pipeline

## Overview

The `.agent` pipeline is a deterministic transformation engine within a three-layer architecture: **Control Plane → Execution Pipeline → Observation Layer** (see `COMPILER_ARCHITECTURE.md §1.1`). It converts user intent into auditable, lifecycle-managed `WorkRequests`. It is designed as a compilation pipeline, separating free reasoning (outside the pipeline) from structured transformation (inside the pipeline).

**Control Plane Precondition**: Before this pipeline executes, `normalize-intent` has produced canonical `ExecutionState` and `mode-router` has selected this pipeline. All stages consume `ExecutionState` as a read-only execution contract. No stage interprets `PIPELINE_INTENT.yaml` or derives `ExecutionState`.

## Pipeline Flow

The default sequence of operations is:

1. **`archive-prompt`**: Verbatim capture of the original user request with an assigned `prompt_id`.

2. **`requirements-capture`**: Transformation of the raw prompt into a structured internal representation. Consumes `ExecutionState` as a read-only execution contract. Does not interpret intent or modify execution authority. Behavior reflects `ExecutionState`:
   - `READ_ONLY_PLAN`: emit requirements as WR intent blocks
   - `CODE_EXECUTION`: bind requirements to target project resources
   - `TRANSFORM_PIPELINE`: operate on existing WR lifecycle states

3. **`resource-binding`**: Mapping of the structured intent to specific project resources (files/directories). Gates on `mutationScope.filesystem.read`.

4. **`decompose-task`**: Breaking down the goal into atomic units of work.

5. **`work-request-emission`**: Generation of lifecycle-aware `WorkRequest` objects (v1, v2, etc.). Emits work requests consistent with `ExecutionState.processingMode`.

6. **`archive-implementation`**: Snapshotting the planning state and materializing the `WORK_TO_DATE.md` projection. Respects `mutationScope.filesystem.write` for record format.

## WorkRequest Lifecycle

WorkRequests transition through the following states:

- **DRAFT**: Newly emitted version.
- **SUPERSEDED**: Replaced by a more recent version for the same intent.
- **CANDIDATE**: Stabilized plan ready for final check.
- **APPROVED**: Authorized for execution.
- **EXECUTED**: Completed and verified on the filesystem.

## Supersession Management

- Every emission checks for existing WorkRequests targeting the same `intent_node_id`.
- If found, previous versions are explicitly marked as `SUPERSEDED`.
- The new WorkRequest includes a `supersedes` array and a structured `derivation` object explaining the iteration.

## Materialized View (WORK_TO_DATE.md)

The pipeline produces `WORK_TO_DATE.md` at the project root. This file is NOT documentation; it is a compiled projection of the current system state, including active intents and the lifecycle status of all related WorkRequests.

## Stability Assessment Artifact

To begin tracking compilation stability, the pipeline emits a `stability-assessment` artifact for each intent node. This is a purely observational analytical artifact with no authority over the pipeline flow.

**Example Structure:**

```json
{
  "intent_node_id": "A",
  "stability_score": 0.82,
  "signals": {
    "semantic_delta_trend": "decreasing",
    "resource_binding_stable": true,
    "supersession_frequency": "low",
    "architectural_reversals": 0
  },
  "recommendation": "PROMOTE_TO_CANDIDATE"
}
```

This preserves the compiler architecture while providing the roots of an analytical layer for future expansion.
