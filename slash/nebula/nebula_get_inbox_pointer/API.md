# Command

/nebula nebula_get_inbox_pointer

## Usage

Get the inbox pointer (watermark) for a role. Returns the ISO timestamp of the last-seen record, or null if no pointer exists.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | Role name (e.g., architect, engineer, planner) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_get_inbox_pointer`
