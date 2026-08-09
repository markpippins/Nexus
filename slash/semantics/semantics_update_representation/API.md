# Command

/semantics semantics_update_representation

## Usage

Append-only replace on semantics.representation (representation (physical form of a concept)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
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
- **Tool**: `semantics_update_representation`
