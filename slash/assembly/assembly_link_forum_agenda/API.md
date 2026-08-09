# Command

/assembly assembly_link_forum_agenda

## Usage

Link a forum to an agenda (mark forum as deliberation space for that agenda)

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agenda_id` | string | Yes | Nebula agenda UUID |
| `forum_id` | string | Yes | Forum UUID |
| `label` | string | No | Optional label (e.g. 'primary', 'cross-reference') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_link_forum_agenda`
