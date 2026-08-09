# Command

/semantics semantics_update_snapshot_observation

## Usage

Append-only replace on semantics.snapshot_observation (snapshot observation (per-baseline judgment on a representation)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
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
- **Tool**: `semantics_update_snapshot_observation`
