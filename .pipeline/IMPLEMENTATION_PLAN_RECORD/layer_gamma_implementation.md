# Implementation Plan: Daemon Runtime Substrate (Layer Gamma)

## Goal
Implement the first operational daemon runtime for the WRP. This daemon will act as the enforcer of the governance and architectural boundaries by polling WorkRequests, checking governance, binding executors via the registry, and capturing Execution Receipts.

## Proposed Implementation

**Target File**: `.agent/scripts/daemon_runtime.py`

### 1. Polling Loop
A continuous process that polls `.pipeline/WORK_REQUESTS/queued/*.json`.

### 2. Validation & Binding
For each discovered WorkRequest, the daemon will:
1. Run a mock `run_governance_check(wr)` (representing CIR/CEGL validation).
2. Call `select_executor(wr, registry)` to find the mapped capability-bound builder in `.agent/config/executors.json`.

### 3. Execution & Archival
1. Invoke the chosen executor strictly via its `invocation_contract.command`.
2. Await the structured `ExecutionReceipt` JSON output.
3. If successful, append the receipt to `.pipeline/WORK_REQUESTS/log/` and move the immutable WR artifact to `.pipeline/WORK_REQUESTS/complete/`.
4. If it fails, move the WR to `.pipeline/WORK_REQUESTS/failed/`.

## Verification
- We will deploy the `daemon_runtime.py` script.
- We will update `WORK_TO_DATE.md`.
