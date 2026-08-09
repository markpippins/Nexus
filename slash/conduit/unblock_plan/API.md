# Command

/conduit unblock_plan

## Usage

Move a blocked plan back to pending: undeletes (status→pending) if archived, deletes all BLOCK/PLAN_BLOCK receipts, issues a PLAN_CREATE receipt, and spawns a builder ticket so the conduit can pick it up again.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `planNumber` | string | Yes | Plan number to unblock (e.g. "0076") |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `unblock_plan`
