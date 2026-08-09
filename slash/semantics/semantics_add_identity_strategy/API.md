# Command

/semantics semantics_add_identity_strategy

## Usage

Add a row to semantics.identity_strategy (identity strategy (what identity means for a concept)) via the add_ proc. Body uses p_* params (see semantics_meta).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_canonical_key_description` | string | No |  |
| `p_concept_id` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_notes` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_identity_strategy`
