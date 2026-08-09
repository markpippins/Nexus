# Command

/semantics semantics_soft_delete_statement_evidence

## Usage

Soft-delete (expire) a row in semantics.statement_evidence by id — expire-not-delete: the row is retained with expired_at set. Idempotent (0 if already gone).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Row id to expire |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `semantics-mcp`
- **Tool**: `semantics_soft_delete_statement_evidence`
