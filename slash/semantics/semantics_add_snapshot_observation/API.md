# Command

/semantics semantics_add_snapshot_observation

## Usage

Add a row to semantics.snapshot_observation (snapshot observation (per-baseline judgment on a representation)) via the add_ proc. Body uses p_* params (see semantics_meta).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_audit_reason` | string | No |  |
| `p_completed_fix_ref` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_is_completed_fix` | boolean | No |  |
| `p_lifecycle_state` | string | No |  |
| `p_representation_id` | string | No |  |
| `p_safe_to_retire` | boolean | No |  |
| `p_snapshot_id` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_snapshot_observation`
