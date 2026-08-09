# Command

/nebula execution_transition_request

## Usage

Transition a WorkRequest to a new status. Enforces valid state transitions per ADR-006.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Request UUID |
| `reason` | string | No | Reason for transition |
| `targetStatus` | enum(COMPILED,VALIDATED,ADMITTED,READY,COMPLETED,FAILED,CANCELLED) | Yes | Target status |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_transition_request`
