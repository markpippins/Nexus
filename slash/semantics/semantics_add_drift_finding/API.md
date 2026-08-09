# Command

/semantics semantics_add_drift_finding

## Usage

Add a row to semantics.drift_finding (drift finding (finding against a snapshot observation)) via the add_ proc. Body uses p_* params (see semantics_meta). Note: Lifecycle: detected (resolved_at NULL) → resolved via semantics_resolve_drift_finding.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_description` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_observation_id` | string | No |  |
| `p_resolved_at` | string | No |  |
| `p_severity` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_drift_finding`
