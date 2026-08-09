# Command

/ui-tools reorder_links

## Usage

Reorder links and separators in the statusbar. Provide an ordered array of { id, sortOrder } pairs. All items must be included.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `items` | array<object> | Yes | Array of { id: string, sortOrder: number } pairs in the desired order |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `ui-tools-mcp`
- **Tool**: `reorder_links`
