# Command

/semantics semantics_update_consumer_operation

## Usage

Append-only replace on semantics.consumer_operation (consumer operation (who touches a representation and how)): expires the row with the given id and inserts a NEW version with a NEW id (natural-key uniqueness applies to active rows only).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to supersede |
| `p_consumer_name` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_notes` | string | No |  |
| `p_operation` | string | No |  |
| `p_representation_id` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_update_consumer_operation`
