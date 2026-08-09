# Command

/semantics semantics_update_statement_evidence

## Usage

Append-only replace on semantics.statement_evidence (statement evidence (evidence linked to a relationship claim)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
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
- **Tool**: `semantics_update_statement_evidence`
