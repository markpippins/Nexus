# Command

/semantics semantics_add_statement_evidence

## Usage

Add a row to semantics.statement_evidence (statement evidence (evidence linked to a relationship claim)) via the add_ proc. Body uses p_* params (see semantics_meta). Note: Polymorphic junction — statement_type ∈ {concept_relationship, representation_relationship}. Unique on (evidence_item_id, statement_type, statement_id, role).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_comment` | string | No |  |
| `p_evidence_item_id` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_role` | string | No |  |
| `p_statement_id` | string | No |  |
| `p_statement_type` | string | No |  |
| `p_strength` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_statement_evidence`
