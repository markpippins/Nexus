# Command

/semantics semantics_update_snapshot

## Usage

Append-only replace on semantics.snapshot (snapshot (per-baseline judgment record)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
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
- **Tool**: `semantics_update_snapshot`
