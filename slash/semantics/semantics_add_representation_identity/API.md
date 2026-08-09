# Command

/semantics semantics_add_representation_identity

## Usage

Add a row to semantics.representation_identity (representation identity (how a form expresses its concept's identity)) via the add_ proc. Body uses p_* params (see semantics_meta).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_expired_at` | string | No |  |
| `p_identity_expression` | string | No |  |
| `p_identity_strategy_id` | string | No |  |
| `p_notes` | string | No |  |
| `p_representation_id` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_representation_identity`
