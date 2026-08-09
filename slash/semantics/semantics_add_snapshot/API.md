# Command

/semantics semantics_add_snapshot

## Usage

Add a row to semantics.snapshot (snapshot (per-baseline judgment record)) via the add_ proc. Body uses p_* params (see semantics_meta).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_created_by` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_label` | string | No |  |
| `p_notes` | string | No |  |
| `p_parent_id` | string | No |  |
| `p_status` | string | No |  |
| `p_version` | number | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_snapshot`
