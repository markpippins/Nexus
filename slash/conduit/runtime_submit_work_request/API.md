# Command

/conduit runtime_submit_work_request

## Usage

Submit a validated CompilerOutput as a new WorkRequest. Enforces the compiler/runtime contract boundary — rejects any payload containing execution fields (status, worker, scheduling, etc.). Returns the initial folded state (DRAFT → VALIDATED).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `constraints` | object<maxRetries,deterministic,resourceHints,timeoutPolicy> | Yes | Constraint layer — what is allowed |
| `intent` | object<type,inputs,objective> | Yes | Intent layer — what is desired |
| `opTrace` | object<ipNodes,resolvedOps,registryVersion> | Yes | Op resolution trace |
| `wrId` | string | Yes | Unique WorkRequest ID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `runtime_submit_work_request`
