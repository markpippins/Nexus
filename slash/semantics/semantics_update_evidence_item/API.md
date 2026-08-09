# Command

/semantics semantics_update_evidence_item

## Usage

Append-only replace on semantics.evidence_item (evidence item (immutable, hash-deduplicated evidence record)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_captured_at` | string | No |  |
| `p_evidence_type_id` | string | No |  |
| `p_excerpt` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_metadata` | object | No |  |
| `p_note` | string | No |  |
| `p_origin` | string | No |  |
| `p_source_hash` | string | No |  |
| `p_uri` | string | No |  |
| `p_valid_from` | string | No |  |
| `p_valid_to` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_evidence_item`
