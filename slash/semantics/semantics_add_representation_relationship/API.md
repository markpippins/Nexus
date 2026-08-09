# Command

/semantics semantics_add_representation_relationship

## Usage

Add a row to semantics.representation_relationship (representation relationship (fidelity/lineage between forms)) via the add_ proc. Body uses p_* params (see semantics_meta). Note: Evidence is now first-class via evidence_item + statement_evidence (V072).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_expired_at` | string | No |  |
| `p_from_representation_id` | string | No |  |
| `p_notes` | string | No |  |
| `p_relationship_type` | string | No |  |
| `p_to_representation_id` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_representation_relationship`
