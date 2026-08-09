# Command

/semantics semantics_resolve_drift_finding

## Usage

Transition a drift finding from detected → resolved (sets resolved_at). Idempotent: returns 1 on first resolve, 0 if already resolved / expired / missing.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Drift finding UUID |
| `resolved_at` | string | No | ISO timestamp (defaults to now) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_resolve_drift_finding`
