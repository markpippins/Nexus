# Command

/peb peb_request_clarification

## Usage

Emit a REQUEST_FOR_CLARIFICATION when an agent lacks context.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `ambiguity` | string | Yes |  |
| `entity_id` | string | Yes |  |
| `options_considered` | string | No |  |
| `proposed_resolution` | string | null | No |  |
| `work_request_id` | string | Yes |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_request_clarification`
