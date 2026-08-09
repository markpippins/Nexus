# Command

/assembly assembly_move_thread

## Usage

Move a thread (post) from its current forum to a different forum

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `forum_id` | string | Yes | Destination forum UUID |
| `post_id` | string | Yes | Post UUID to move |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_move_thread`
