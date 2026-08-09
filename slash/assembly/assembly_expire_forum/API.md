# Command

/assembly assembly_expire_forum

## Usage

Soft-delete a forum by setting its expiration date to now. The forum disappears from list results but data is preserved.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `forum_id` | string | Yes | Forum UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_expire_forum`
