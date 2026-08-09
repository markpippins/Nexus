# Command

/nebula nebula_query_conduit_as_of

## Usage

Get a point-in-time snapshot of all plan states. Use this to answer 'what was in conduit yesterday?' or 'what was the pipeline state last Tuesday?'.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `includeDeleted` | boolean | No | Include plans that were soft-deleted as of that time. |
| `timestamp` | string | Yes | ISO 8601 timestamp (e.g. '2026-06-21T12:00:00Z' or '2026-06-21') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_query_conduit_as_of`
