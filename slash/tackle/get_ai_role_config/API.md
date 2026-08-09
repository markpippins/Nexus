# Command

/tackle get_ai_role_config

## Usage

Get a single AI role configuration by role name.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | Role name: planner, builder, reviewer, critic, analyst, architect, inspector, engineer, rover |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `get_ai_role_config`
