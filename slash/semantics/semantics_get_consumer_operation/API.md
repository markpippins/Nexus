# Command

/semantics semantics_get_consumer_operation

## Usage

Get a single row from semantics.consumer_operation by id (consumer operation (who touches a representation and how)).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row UUID (or smallint key) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_get_consumer_operation`
