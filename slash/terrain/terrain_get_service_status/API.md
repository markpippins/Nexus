# Command

/terrain terrain_get_service_status

## Usage

Look up the current status and details of any registered service by name. Checks MCP servers, runnable services, and servers tables.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Service name to look up (e.g. 'conduit-mcp', 'nebula-srv', 'PostgreSQL') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `terrain-mcp`
- **Tool**: `terrain_get_service_status`
