# Command

/conduit revise_plan

## Usage

Create a revision copy of an existing implementation_plan in planning state. Copies title/goal/acceptance criteria but strips filesAffected (Planner will add those). Issues a PLANNING receipt on the new plan.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | array<string> | No | Optional updated acceptance criteria |
| `dependencies` | array<string> | No | Optional updated dependencies |
| `goal` | string | No | Optional updated goal |
| `planNumber` | string | Yes | Plan number to revise (e.g. "0053") |
| `title` | string | No | Optional new title (defaults to original) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `revise_plan`
