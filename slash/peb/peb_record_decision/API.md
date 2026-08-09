# Command

/peb peb_record_decision

## Usage

Append a decision. This is a state mutation - goes through full admission + transaction.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `affected_keys` | array<string> | Yes | Which peb_state keys change |
| `commit_ref` | string | null | No |  |
| `entity_id` | string | Yes |  |
| `entropy_class` | enum(collapser,shaper,neutral) | Yes |  |
| `summary` | string | No | Structured rationale |
| `title` | string | Yes |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_record_decision`
