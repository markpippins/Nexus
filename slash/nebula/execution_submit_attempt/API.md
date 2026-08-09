# Command

/nebula execution_submit_attempt

## Usage

Submit an execution attempt result. Creates an attempt record linked to the lease.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `error` | string | No | Error message if failed |
| `exitCode` | number | No | Exit code |
| `leaseId` | string | Yes | Lease UUID (must be ACTIVE) |
| `result` | string | No | Result payload (any JSON) |
| `status` | enum(SUCCEEDED,FAILED,TIMED_OUT) | No | Attempt outcome (default: SUCCEEDED) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_submit_attempt`
