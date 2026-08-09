# Command

/semantics semantics_update_evidence_type

## Usage

Append-only replace on semantics.evidence_type (evidence type (vocabulary of evidence kinds)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_description` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_name` | string | No |  |
| `p_notes` | string | No |  |
| `p_origin_category` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_evidence_type`
