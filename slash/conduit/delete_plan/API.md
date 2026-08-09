# Command

/conduit delete_plan

## Usage

Archive an implementation_plan: sets status='archived' so it disappears from active views. Receipts and audit trail are preserved. Use unblock_plan to restore.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `planNumber` | string | Yes | Plan number to delete (e.g. "0053") |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `delete_plan`
