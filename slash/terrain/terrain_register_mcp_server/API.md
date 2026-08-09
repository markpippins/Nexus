# Command

/terrain terrain_register_mcp_server

## Usage

Register or update an MCP server in the terrain topology. Creates if new, updates if name already exists.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `description` | string | No |  |
| `health` | string | No |  |
| `health_check_url` | string | No |  |
| `name` | string | Yes | MCP server name (e.g. 'vision-mcp') |
| `port` | number | No |  |
| `startup` | string | No |  |
| `status` | string | No | Status: ONLINE, OFFLINE, STARTING, ERROR |
| `transport_type` | string | No | Transport: stdio, sse, streamable-http |
| `version` | string | No |  |
| `workspace_path` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `terrain-mcp`
- **Tool**: `terrain_register_mcp_server`
