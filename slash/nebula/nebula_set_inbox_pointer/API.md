# Command

/nebula nebula_set_inbox_pointer

## Usage

Set the inbox pointer (watermark) for a role. Call this after surfacing new messages to mark them as seen.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | Role name (e.g., architect, engineer, planner) |
| `timestamp` | string | Yes | ISO timestamp of the last-seen record |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_set_inbox_pointer`
