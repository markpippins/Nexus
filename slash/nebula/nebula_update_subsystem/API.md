# Command

/nebula nebula_update_subsystem

## Usage

Update a subsystem's metadata.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `color` | string | No | Hex color string (e.g. '#3B82F6') |
| `description` | string | No | New description |
| `id` | string | Yes | Subsystem UUID |
| `name` | string | No | New name |
| `readme` | string | null | No | New readme content |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_update_subsystem`
