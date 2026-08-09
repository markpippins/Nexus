# Command

/nebula nebula_batch_update_requirements

## Usage

Batch update the status of multiple requirements at once.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `ids` | array<string> | Yes | Array of requirement UUIDs |
| `status` | string | Yes | New status to apply to all (e.g. 'Done', 'InProgress') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_batch_update_requirements`
