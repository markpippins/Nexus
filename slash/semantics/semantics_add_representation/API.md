# Command

/semantics semantics_add_representation

## Usage

Add a row to semantics.representation (representation (physical form of a concept)) via the add_ proc. Body uses p_* params (see semantics_meta).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_concept_id` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_label` | string | No |  |
| `p_owner` | string | No |  |
| `p_owning_subsystem_id` | number | No | owning subsystem smallint id |
| `p_raw_metadata` | object | No | JSONB metadata |
| `p_schema_name` | string | No |  |
| `p_table_name` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_representation`
