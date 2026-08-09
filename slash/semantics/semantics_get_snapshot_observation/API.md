# Command

/semantics semantics_get_snapshot_observation

## Usage

Get a single row from semantics.snapshot_observation by id (snapshot observation (per-baseline judgment on a representation)).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row UUID (or smallint key) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_get_snapshot_observation`
