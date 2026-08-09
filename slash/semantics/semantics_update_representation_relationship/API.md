# Command

/semantics semantics_update_representation_relationship

## Usage

Append-only replace on semantics.representation_relationship (representation relationship (fidelity/lineage between forms)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_expired_at` | string | No |  |
| `p_from_representation_id` | string | No |  |
| `p_notes` | string | No |  |
| `p_relationship_type` | string | No |  |
| `p_to_representation_id` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_representation_relationship`
