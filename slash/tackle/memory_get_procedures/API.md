# Command

/tackle memory_get_procedures

## Usage

Return the procedure index for a given role (list of procedure summaries). Reads from Redis cache.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | Role name (engineer, planner, architect, etc.) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `memory_get_procedures`
