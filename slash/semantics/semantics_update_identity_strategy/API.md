# Command

/semantics semantics_update_identity_strategy

## Usage

Append-only replace on semantics.identity_strategy (identity strategy (what identity means for a concept)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_canonical_key_description` | string | No |  |
| `p_concept_id` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_notes` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_identity_strategy`
