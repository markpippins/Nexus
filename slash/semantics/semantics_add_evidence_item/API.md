# Command

/semantics semantics_add_evidence_item

## Usage

Add a row to semantics.evidence_item (evidence item (immutable, hash-deduplicated evidence record)) via the add_ proc. Body uses p_* params (see semantics_meta). Note: Immutable after creation (no update_ proc). Soft-close via soft_delete_. Dedup on (evidence_type_id, source_hash).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
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
- **Tool**: `semantics_add_evidence_item`
