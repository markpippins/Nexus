# Command

/nebula execution_list_requests

## Usage

List execution requests, optionally filtered by status.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results (default 50, max 200) |
| `status` | string | No | Filter by status (DRAFT, COMPILED, VALIDATED, ADMITTED, READY, COMPLETED, FAILED, CANCELLED) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_list_requests`
