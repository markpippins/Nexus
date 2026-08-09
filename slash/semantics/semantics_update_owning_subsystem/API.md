# Command

/semantics semantics_update_owning_subsystem

## Usage

Append-only replace on semantics.owning_subsystem (owning subsystem (fleet)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_description` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_id` | number | No | Required — stable smallint lookup key |
| `p_name` | string | No |  |
| `p_new_id` | number | No | Required for update — the new smallint key |
| `p_path` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_owning_subsystem`
