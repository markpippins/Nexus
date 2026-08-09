# Command

/nebula execution_issue_receipt

## Usage

Issue an immutable receipt from a completed attempt. Consumed by the Kernel.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentRole` | string | No | Agent role (defaults to executor_id) |
| `attemptId` | string | Yes | Attempt UUID |
| `metadata` | string | No | Additional metadata |
| `summary` | string | No | Human-readable summary |
| `type` | string | No | Receipt type (default: EXECUTION_COMPLETE or EXECUTION_FAILED based on attempt status) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_issue_receipt`
