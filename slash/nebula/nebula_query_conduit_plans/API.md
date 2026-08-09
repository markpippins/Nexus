# Command

/nebula nebula_query_conduit_plans

## Usage

List conduit pipeline plans. Optionally include soft-deleted plans or query state as-of a past timestamp. Use this to answer 'what plans exist?' or 'what plans existed yesterday?'.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `asOf` | string | No | ISO 8601 timestamp to query historical plan state. Returns state derived from receipts up to that time. |
| `includeDeleted` | boolean | No | Include soft-deleted plans (deleted=1). Default false (only active plans). |
| `limit` | number | No | Max results (default 100, max 500) |
| `offset` | number | No | Offset for pagination |
| `status` | string | No | Filter by derived status (e.g. PLAN_CREATE, IMPLEMENTATION, BLOCK, REVIEW_PASS). |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_query_conduit_plans`
