# Command

/peb peb_validate_transition

## Usage

Check whether a WorkStatus transition is legal.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entity_id` | string | Yes | Who is requesting |
| `from_state` | string | Yes | Current pipeline state (WorkStatus) |
| `to_state` | string | Yes | Desired next state (WorkStatus) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_validate_transition`
