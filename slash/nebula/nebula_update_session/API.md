# Command

/nebula nebula_update_session

## Usage

Update a work session's outcome or status.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Session UUID |
| `outcome` | string | null | No | Outcome notes |
| `status` | string | No | New status: Pending, Completed |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_update_session`
