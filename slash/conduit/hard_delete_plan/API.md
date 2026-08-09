# Command

/conduit hard_delete_plan

## Usage

Permanently delete an implementation_plan and ALL associated tickets and receipts from the database. Irreversible — use only for stuck plans that cannot be recovered via unblock_plan or delete_plan. Requires confirmPlanTitle to match the plan's actual title as a safety guard.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `confirmPlanTitle` | string | Yes | Must match the exact plan title to confirm deletion (e.g. "Test plan with new ticket bootstrap") |
| `planNumber` | string | Yes | Plan number to permanently delete (e.g. "0081") |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `hard_delete_plan`
