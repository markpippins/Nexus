# Command

/nebula nebula_update_system

## Usage

Update an existing system's metadata.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `architecture` | string | null | No | New architecture notes |
| `description` | string | No | New description |
| `id` | string | Yes | System UUID |
| `name` | string | No | New system name |
| `readme` | string | null | No | New readme content |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_update_system`
