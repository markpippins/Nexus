# Command

/conduit runtime_transition

## Usage

Apply a transition event to a WorkRequest. Validates against the state machine. Allowed types: WR_VALIDATED, WR_CLAIMED, WR_ACKED, WR_SETTLED, WR_REJECTED, WR_FAILED, WR_NOOP, WR_DEFERRED (WR_VALIDATED: VALIDATED→QUEUED — used by the ADR-006 cascade admission subscriber).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payload` | object | No | Optional payload (e.g. { workerId, reason, error }) |
| `type` | string | Yes | Event type (WR_VALIDATED, WR_CLAIMED, WR_ACKED, WR_SETTLED, WR_REJECTED, WR_FAILED, WR_NOOP, WR_DEFERRED) |
| `wrId` | string | Yes | WorkRequest ID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `runtime_transition`
