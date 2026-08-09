# Command

/nebula nebula_set_preference

## Usage

Set a user preference value.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | string | Yes | Preference key (e.g. 'theme', 'sidebarCollapsed') |
| `value` | string | No | Value to store (any JSON-serializable value) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_set_preference`
