# Command

/conduit create_plan

## Usage

[DEPRECATED — use nebula_create_plan instead] Create a new implementation_plan record (writes to nebula.implementation_plans). Issues a PLAN_CREATE receipt and bootstraps a builder ticket. Note: for the new pipeline flow, prefer runtime_submit_work_request instead.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | array<string> | No | List of acceptance criteria |
| `dependencies` | array<string> | No | List of dependency plan numbers |
| `filesAffected` | array<string> | No | List of files that will be affected |
| `goal` | string | No | Goal description |
| `project` | string | No | Project name (e.g., "conduit-ui") |
| `promptRef` | string | No | Optional prompt number this plan was spawned from (e.g., "0001") |
| `title` | string | Yes | Plan title (e.g., "Dark/light theme toggle") |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `create_plan`
