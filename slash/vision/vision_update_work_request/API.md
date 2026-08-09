# Command

/vision vision_update_work_request

## Usage

Update a work request's fields.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `constraints` | string | No | New constraints |
| `context` | string | No | New context |
| `id` | string | Yes | Work request ID |
| `intent` | string | No | New intent |
| `priority` | number | No | New priority |
| `status` | string | No | New status |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `vision-mcp`
- **Tool**: `vision_update_work_request`
