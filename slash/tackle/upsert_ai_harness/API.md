# Command

/tackle upsert_ai_harness

## Usage

Create or update an AI harness.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Harness ID (e.g. 'harn-opencode') |
| `invocation_semantics` | string | No | JSON string describing binary, capabilities, semantics, and execution mode |
| `name` | string | Yes | Display name |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `upsert_ai_harness`
