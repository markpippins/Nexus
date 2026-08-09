# Command

/conduit agent_finished

## Usage

Report agent has finished its current task

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `exitCode` | number | No | Optional exit code (0=success) |
| `role` | string | Yes | Agent role |
| `summary` | string | No | Optional summary |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `agent_finished`
