# Command

/semantics semantics_add_relationship_type

## Usage

Add a row to semantics.relationship_type (relationship type (vocabulary of legal edge types)) via the add_ proc. Body uses p_* params (see semantics_meta). Note: Vocabulary table — FK-referenced by concept_relationship / representation_relationship (only defined types are legal edges). update takes p_new_name (names are never reused).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_description` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_name` | string | No |  |
| `p_new_name` | string | No | Required for update — the new relationship type name |
| `p_notes` | string | No |  |
| `p_scope` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_relationship_type`
