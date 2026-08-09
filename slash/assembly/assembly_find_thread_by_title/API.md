# Command

/assembly assembly_find_thread_by_title

## Usage

Search threads by title (case-insensitive partial match). Returns up to 20 results with id, title, forum, and dates.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | Yes | Search pattern (partial match, e.g. 'magnet' matches 'Investigation: Magnetize button...') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_find_thread_by_title`
