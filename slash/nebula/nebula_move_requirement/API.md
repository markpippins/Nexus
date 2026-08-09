# Command

/nebula nebula_move_requirement

## Usage

Move a requirement to a new status (kanban-friendly). Optionally pass expectedCurrentStatus to assert the current value; the call returns 409 on mismatch.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `expectedCurrentStatus` | enum(Backlog,ToDo,InProgress,Active,Blocked,Done,Cancelled,Accepted) | No | Optional optimistic-concurrency check. If supplied and the current status differs, the call fails with 409. |
| `id` | string | Yes | Requirement UUID |
| `targetStatus` | enum(Backlog,ToDo,InProgress,Active,Blocked,Done,Cancelled,Accepted) | Yes | Status to move the requirement into |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_move_requirement`
