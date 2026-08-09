# Command

/tackle upsert_ai_provider

## Usage

Create or update an AI provider.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `api_key` | string | No | API key (stored encrypted at rest) |
| `config_json` | string | No | Optional JSON config string |
| `endpoint_url` | string | No | API endpoint URL |
| `id` | string | Yes | Provider ID (e.g. 'prov-openai') |
| `name` | string | Yes | Display name |
| `type` | string | Yes | Provider type: openai, anthropic, google, ollama, opencode, codex, spring_ai, lm_server, custom |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `upsert_ai_provider`
