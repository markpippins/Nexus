# Command

/semantics semantics_get_snapshot

## Usage

Get a single row from semantics.snapshot by id (snapshot (per-baseline judgment record)).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row UUID (or smallint key) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_get_snapshot`
