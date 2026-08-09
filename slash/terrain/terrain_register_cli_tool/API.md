# Command

/terrain terrain_register_cli_tool

## Usage

Register or update a CLI tool / runnable script in the terrain topology. Creates if new, updates if name already exists.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `build_command` | string | No |  |
| `category` | string | No |  |
| `description` | string | No |  |
| `health` | string | No |  |
| `invocation` | string | No |  |
| `language` | string | No |  |
| `name` | string | Yes | Tool name (unique identifier, e.g. 'generate_docs') |
| `notes` | string | No |  |
| `startup` | string | No |  |
| `startup_script` | string | No |  |
| `tool_path` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `terrain-mcp`
- **Tool**: `terrain_register_cli_tool`
