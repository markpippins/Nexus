# Command

/semantics semantics_update_representation_identity

## Usage

Append-only replace on semantics.representation_identity (representation identity (how a form expresses its concept's identity)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_expired_at` | string | No |  |
| `p_identity_expression` | string | No |  |
| `p_identity_strategy_id` | string | No |  |
| `p_notes` | string | No |  |
| `p_representation_id` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_representation_identity`
