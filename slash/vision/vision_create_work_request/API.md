# Command

/vision vision_create_work_request

## Usage

Create a new work request.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `constraints` | string | No | Optional constraints JSON |
| `context` | string | No | Contextual data JSON |
| `intent` | string | Yes | What the work request should accomplish |
| `priority` | number | No | Priority level (default 5) |
| `status` | string | No | Status (default 'NEW') |
| `wrId` | string | No | Unique work request ID (auto-generated if omitted) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `vision-mcp`
- **Tool**: `vision_create_work_request`
