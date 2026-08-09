# Command

/semantics semantics_add_evidence_type

## Usage

Add a row to semantics.evidence_type (evidence type (vocabulary of evidence kinds)) via the add_ proc. Body uses p_* params (see semantics_meta). Note: Vocabulary table — FK-referenced by evidence_item. update takes p_new_name.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_description` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_name` | string | No |  |
| `p_notes` | string | No |  |
| `p_origin_category` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_evidence_type`
