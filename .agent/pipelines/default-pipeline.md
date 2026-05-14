# Default Agent Pipeline

## Overview

The `.agent` pipeline is a deterministic transformation engine that converts user intent into auditable, lifecycle-managed `WorkRequests`. It is designed as a compilation pipeline, separating free reasoning (outside the pipeline) from structured transformation (inside the pipeline).

## Pipeline Flow

The default sequence of operations is:

0. **`resolve-intent`**: Load `.pipeline/PIPELINE_INTENT.yaml`, validate against schema v1, normalize to ExecutionState, reject invalid combinations. If ambiguous, halt and report.

1. **`archive-prompt`**: Verbatim capture of the original user request with an assigned `prompt_id`.

2. **`requirements-capture`**: Transformation of the raw prompt into a structured internal representation. Behavior depends on `processingMode`:
   - `generate`: emit requirements as WR intent blocks
   - `execute`: bind requirements to target project resources
   - `transform`: operate on existing WR lifecycle states

3. **`resource-binding`**: Mapping of the structured intent to specific project resources (files/directories). Gates on `mutationScope.filesystem.read`.

4. **`decompose-task`**: Breaking down the goal into atomic units of work.

5. **`work-request-emission`**: Generation of lifecycle-aware `WorkRequest` objects (v1, v2, etc.). Only active when `processingMode == generate`.

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
