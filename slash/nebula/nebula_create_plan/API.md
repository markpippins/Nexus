# Command

/nebula nebula_create_plan

## Usage

Create a new implementation plan in nebula.implementation_plans. Generates the next plan number, inserts the record, and returns the created plan. Receipts and tickets are handled downstream by conduit-mcp.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | array<string> | No | List of acceptance criteria |
| `dependencies` | array<string> | No | List of dependency plan numbers |
| `filesAffected` | array<string> | No | List of files that will be affected |
| `goal` | string | No | Goal description |
| `project` | string | No | Project name (default: 'nexus') |
| `promptRef` | string | No | Optional prompt reference |
| `title` | string | Yes | Plan title (required) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_plan`
