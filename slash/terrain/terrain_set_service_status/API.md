# Command

/terrain terrain_set_service_status

## Usage

Update the status of any registered service (MCP server or runnable service) by name.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Service name |
| `status` | string | Yes | New status: ONLINE, OFFLINE, STARTING, ERROR |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `terrain-mcp`
- **Tool**: `terrain_set_service_status`
