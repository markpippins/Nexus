# Command

/conduit update_plan

## Usage

Update metadata for an existing implementation_plan (nebula.implementation_plans)

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | array<string> | No | New acceptance criteria |
| `dependencies` | array<string> | No | New dependencies |
| `filesAffected` | array<string> | No | New files affected list |
| `goal` | string | No | New goal description |
| `planNumber` | string | Yes | Plan number to update (e.g., "0051") |
| `project` | string | No | New project |
| `title` | string | No | New title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `update_plan`
