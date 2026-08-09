# Command

/semantics semantics_list_snapshot_observation

## Usage

List active rows in semantics.snapshot_observation (snapshot observation (per-baseline judgment on a representation)). Expired rows excluded unless include_expired is true.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `include_expired` | boolean | No | Also return expired rows |
| `limit` | number | No | Max rows (default 100, max 500) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_list_snapshot_observation`
