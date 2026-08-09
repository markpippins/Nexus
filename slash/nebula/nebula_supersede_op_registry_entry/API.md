# Command

/nebula nebula_supersede_op_registry_entry

## Usage

Mark a registry entry as superseded (replaced by a fork). Requires successor_id.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Registry entry ID to supersede |
| `successor_id` | string | Yes | Replacement entry ID (required) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_supersede_op_registry_entry`
