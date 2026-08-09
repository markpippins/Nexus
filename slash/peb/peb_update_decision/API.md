# Command

/peb peb_update_decision

## Usage

Update an existing decision's status, summary, or affected keys.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `affected_keys` | array<string> | No | Updated affected keys |
| `entropy_class` | string | No | Updated entropy class |
| `id` | string | Yes | Decision UUID |
| `status` | enum(proposed,accepted,superseded,deprecated) | No | New status |
| `summary` | string | No | Updated structured summary |
| `title` | string | No | New title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_update_decision`
