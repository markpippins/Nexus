# Command

/semantics semantics_add_consumer_operation

## Usage

Add a row to semantics.consumer_operation (consumer operation (who touches a representation and how)) via the add_ proc. Body uses p_* params (see semantics_meta).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `p_consumer_name` | string | No |  |
| `p_expired_at` | string | No |  |
| `p_notes` | string | No |  |
| `p_operation` | string | No |  |
| `p_representation_id` | string | No |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_add_consumer_operation`
