# Command

/conduit agent_heartbeat

## Usage

Report agent liveness and current activity

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `detail` | string | No | Optional detail (e.g., "Executing plan 0029") |
| `pid` | number | No | Optional OS process ID |
| `role` | string | Yes | Agent role (planner, builder, reviewer, critic, analyst, architect) |
| `sessionId` | string | No | Optional session ID — if provided, heartbeat is persisted to the database for staleness detection |
| `state` | string | Yes | Agent state (idle, working, blocked) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `agent_heartbeat`
