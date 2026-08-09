# Command

/peb peb_supersede_decision

## Usage

Supersede an existing decision. Creates a new ADR that replaces the old one, marking the old as 'superseded'.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `affected_keys` | array<string> | No | Affected keys (default: inherit from superseded) |
| `author_id` | string | Yes | Author of the superseding decision |
| `id` | string | Yes | UUID of the decision to supersede |
| `summary` | string | No | New decision summary explaining what changed and why |
| `title` | string | No | Title for the new decision (default: auto-generated) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_supersede_decision`
