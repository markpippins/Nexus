# Command

/semantics semantics_add_owning_subsystem

## Usage

Add a row to semantics.owning_subsystem (owning subsystem (fleet)) via the add_ proc. Body uses p_* params (see semantics_meta). Note: Stable smallint lookup key — id is caller-supplied; update requires p_new_id.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
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
- **Tool**: `semantics_add_owning_subsystem`
