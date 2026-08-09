# Command

/tackle import_ai_config

## Usage

Replace the entire AI configuration with a full snapshot. Clears all existing data and bulk-inserts the provided providers, harnesses, models, roles, and config bundles.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `bundles` | array | No | Array of config_bundle objects |
| `harnesses` | array | No | Array of harness objects |
| `models` | array | No | Array of model objects |
| `providers` | array | No | Array of provider objects |
| `roles` | array | No | Array of role_config objects |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `import_ai_config`
