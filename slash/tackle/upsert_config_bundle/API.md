# Command

/tackle upsert_config_bundle

## Usage

Create or update a config bundle — the atomic unit of model+provider+harness+invocation config.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `command` | string | No | CLI command override |
| `endpoint_url` | string | No | HTTP endpoint override |
| `harness_id` | string | No | Optional harness ID override |
| `id` | string | Yes | Bundle ID (e.g. 'cb-builder-mod-gpt4o') |
| `invocation_mode` | enum(CLI,HTTP,SDK,MCP) | No | CLI | HTTP | SDK | MCP |
| `model_id` | string | Yes | Model ID |
| `name` | string | Yes | Human-readable name |
| `priority` | number | No | Priority (0 = primary) |
| `provider_id` | string | No | Optional provider ID override |
| `role` | string | Yes | Role this bundle belongs to |
| `timeout_ms` | number | No | Timeout in milliseconds |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `upsert_config_bundle`
