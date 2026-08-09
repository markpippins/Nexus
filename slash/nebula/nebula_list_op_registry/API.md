# Command

/nebula nebula_list_op_registry

## Usage

List Op Mapping Registry entries with optional filters by intent_id, status, or text search.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `intent_id` | string | No | Filter by intent identifier |
| `limit` | number | No | Max results (default 100) |
| `offset` | number | No | Offset for pagination |
| `search` | string | No | Free-text search across label, intent_id, notes |
| `status` | string | No | Filter by status (active, deprecated, superseded) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_op_registry`
