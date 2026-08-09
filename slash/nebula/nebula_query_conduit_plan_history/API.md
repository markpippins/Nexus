# Command

/nebula nebula_query_conduit_plan_history

## Usage

Get the full lifecycle history of a single conduit plan — plan metadata, all receipts, all tickets, linked sessions, and token usage. Use this to answer 'what happened to plan X?'.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `planId` | string | Yes | The plan number or ID (e.g. '0169', '0075') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_query_conduit_plan_history`
