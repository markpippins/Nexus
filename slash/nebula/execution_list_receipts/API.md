# Command

/nebula execution_list_receipts

## Usage

List execution receipts, optionally filtered by request or type.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results |
| `requestId` | string | No | Filter by request UUID |
| `type` | string | No | Filter by receipt type |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_list_receipts`
