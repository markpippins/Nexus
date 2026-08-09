# Command

/terrain terrain_register_dependency

## Usage

Register a dependency relationship between two services (e.g., MCP server depends on a runnable service). Upserts by source+target pair.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `criticality` | string | No | Dependency criticality: critical, high, medium, low (default 'medium') |
| `description` | string | No |  |
| `source_name` | string | Yes | Source service name (must exist in mcp_servers or runnable_services) |
| `source_type` | enum(mcp_server,runnable_service) | Yes | Source service type |
| `target_name` | string | Yes | Target service name (must exist in mcp_servers or runnable_services) |
| `target_type` | enum(mcp_server,runnable_service) | Yes | Target service type |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `terrain-mcp`
- **Tool**: `terrain_register_dependency`
