# Command

/tackle upsert_ai_model

## Usage

Create or update an AI model.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `harness_id` | string | Yes | Harness ID this model uses |
| `id` | string | Yes | Model ID (e.g. 'mod-gpt4o') |
| `model_identifier` | string | Yes | The model identifier string (e.g. 'gpt-4o') |
| `name` | string | Yes | Display name |
| `provider_id` | string | No | Optional provider ID for API routing |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `upsert_ai_model`
