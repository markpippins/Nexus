# Command

/assembly assembly_find_forum_by_name

## Usage

Search forums by name (case-insensitive partial match). Returns up to 20 results with id, name, slug, and expiration status.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Search pattern (partial match, e.g. 'todo' matches 'To Do') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_find_forum_by_name`
