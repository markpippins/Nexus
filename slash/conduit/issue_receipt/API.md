# Command

/conduit issue_receipt

## Usage

Record a conduit event receipt. Required for state transitions.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agent_role` | string | Yes | planner|builder|reviewer|watchdog |
| `artifact_path` | string | No | Optional path to proof artifact |
| `metadata` | object | No | Optional arbitrary metadata |
| `plan_id` | string | Yes | Plan number (e.g. "0053") |
| `session_id` | string | No | Optional session ID |
| `summary` | string | No | Optional one-line summary |
| `type` | string | Yes | PLAN_CREATE|IMPLEMENTATION|REVIEW_PASS|REVIEW_REJECT|BLOCK|PLANNING|HOLD|API_LIMIT|CANCELLED|ABANDONED |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `issue_receipt`
