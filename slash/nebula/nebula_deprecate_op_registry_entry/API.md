# Command

/nebula nebula_deprecate_op_registry_entry

## Usage

Deprecate a registry entry. Soft-retires it so existing WorkRequests still work, but new compilations should use the replacement.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Registry entry ID to deprecate |
| `successor_id` | string | No | Replacement entry ID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_deprecate_op_registry_entry`
