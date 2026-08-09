# Command

/nebula nebula_resolve_question

## Usage

Resolve an open question that has been answered. Requires an existing answer.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `questionId` | string | Yes | Question UUID to resolve |
| `resolvedBy` | string | Yes | Who resolved it (role name, e.g. 'planner') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_resolve_question`
