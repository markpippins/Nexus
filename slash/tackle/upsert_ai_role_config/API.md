# Command

/tackle upsert_ai_role_config

## Usage

Create or update an AI role configuration with optional fallback model priorities.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `extra_params` | string | No | Optional JSON extra parameters |
| `harness_id` | string | Yes | Harness ID for the primary model |
| `id` | string | Yes | Role config ID (e.g. 'rc-builder') |
| `model_id` | string | Yes | Primary model ID |
| `model_priorities` | array<object> | No | Optional fallback model priority list |
| `provider_id` | string | Yes | Provider ID for the primary model |
| `role` | string | Yes | Role name: planner, builder, reviewer, critic, analyst, architect, inspector, engineer, rover |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `upsert_ai_role_config`
