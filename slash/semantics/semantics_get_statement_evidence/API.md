# Command

/semantics semantics_get_statement_evidence

## Usage

Get a single row from semantics.statement_evidence by id (statement evidence (evidence linked to a relationship claim)).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row UUID (or smallint key) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_get_statement_evidence`
