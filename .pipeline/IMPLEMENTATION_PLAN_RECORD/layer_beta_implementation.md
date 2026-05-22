# Implementation Plan: ExecutorRegistry Configuration (Revision Beta)

## Goal
Establish a "Dumb" `ExecutorRegistry` configuration that strictly separates governance from runtime execution. The registry and the daemon will form the first operational runtime substrate for the WRP. Gemini Flash will act as the capability-bound builder, leaving all governance, validation, and reasoning to the pipeline.

## Architectural Imperatives

1. **Dumb Registry**: The registry only handles matching `WorkRequest.type` to `Executor.supports`. It performs NO validation of CEGL or constitutional state.
2. **Immutable Inputs**: WorkRequests are read-only to the executor. They are mutation intent artifacts, not task tickets to be rewritten.
3. **Execution Receipts**: Every execution MUST yield an execution receipt for replayability and lineage.
4. **Capability-Bound**: Executors declare specific operations, never general autonomy.

## Proposed Implementation

### 1. Schema Definition Updates
**Target File**: `.agent/schema/executor_registry.schema.json`
The schema will strictly enforce "dumbness":
- `executor_id`: string
- `supports`: List of explicit WorkRequest types/actions (e.g., `["CODE_WRITE", "FILE_READ"]`).
- `invocation_contract`: How the executor is invoked (e.g., CLI, HTTP).

**Target File**: `.agent/schema/execution_receipt.schema.json`
Define the mandatory receipt emitted by executors:
- `work_request_id`: ID of the consumed WR
- `executor_id`: ID of the executor
- `inputs`: Captured context at time of execution
- `mutations`: Explicit list of what was changed
- `timestamp`: UTC ISO
- `result`: "SUCCESS" | "FAILED"
- `lineage_parent`: ID of the prior execution or graph state

### 2. Default Configuration File (`executors.json`)
**Target File**: `.agent/config/executors.json`

```json
{
  "executors": [
    {
      "executor_id": "gemini-flash-builder-v1",
      "supports": [
        "CODE_WRITE",
        "REFACTOR",
        "DOC_UPDATE"
      ],
      "invocation_contract": {
        "type": "cli",
        "command": "./scripts/run-gemini-builder.sh"
      },
      "system_prompt": "You are a deterministic execution engine bounded by specific capabilities. You are given an immutable WorkRequest. Do not plan, reason, or alter intent. Execute the exact instructions and return a structured Execution Receipt containing your mutations."
    }
  ]
}
```

### 3. Daemon Execution Layer (Future/Next Step)
When we build the daemon, its loop will strictly be:
1. Poll `WORK_REQUESTS/queued/`
2. Run CIR/CEGL governance validation (outside the registry)
3. Lookup Executor in Registry based on WR `type`
4. Pass WR to Executor
5. Capture `ExecutionReceipt` and write to `WORK_REQUESTS/complete/` or `EventLog`.

## Verification
- Validate the updated `executors.json` against the schema.
- Emit a `WorkRequestGraph` to signal completion of this plan.
