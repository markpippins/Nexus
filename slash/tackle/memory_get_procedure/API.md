# Command

/tackle memory_get_procedure

## Usage

Return the full procedure card for a given slug. Reads from Redis cache.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | string | Yes | Procedure slug (e.g. 'handle-review-rejection') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `memory_get_procedure`
