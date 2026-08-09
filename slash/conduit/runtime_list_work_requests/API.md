# Command

/conduit runtime_list_work_requests

## Usage

List all WorkRequests with their folded states. Optional status filter.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results (default 50) |
| `status` | string | No | Optional status filter (e.g. VALIDATED, QUEUED, CLAIMED, SETTLED) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `runtime_list_work_requests`
