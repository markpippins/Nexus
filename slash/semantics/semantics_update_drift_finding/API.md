# Command

/semantics semantics_update_drift_finding

## Usage

Append-only replace on semantics.drift_finding (drift finding (finding against a snapshot observation)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_description` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_observation_id` | string | No |  |
| `p_resolved_at` | string | No |  |
| `p_severity` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_drift_finding`
