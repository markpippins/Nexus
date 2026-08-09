# Command

/terrain terrain_register_runnable_service

## Usage

Register or update a runnable service (Express, FastAPI, Spring Boot, UI app, etc.) in the terrain topology.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `description` | string | No |  |
| `health` | string | No |  |
| `health_check_url` | string | No |  |
| `name` | string | Yes | Service name (e.g. 'vision-srv') |
| `port` | number | No |  |
| `service_type_id` | number | No | Service type ID: 2=Microservice, 3=Express, 12=Python Service (default 3) |
| `startup` | string | No |  |
| `status` | string | No |  |
| `version` | string | No |  |
| `workspace_path` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `terrain-mcp`
- **Tool**: `terrain_register_runnable_service`
