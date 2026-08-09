# Command

/semantics semantics_get_evidence_item

## Usage

Get a single row from semantics.evidence_item by id (evidence item (immutable, hash-deduplicated evidence record)).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row UUID (or smallint key) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_get_evidence_item`
