# Command

/nebula nebula_update_feature

## Usage

Update a feature's metadata.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `description` | string | No | New description |
| `id` | string | Yes | Feature UUID |
| `name` | string | No | New name |
| `readme` | string | null | No | New readme content |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_update_feature`
