# Command

/nebula nebula_update_requirement

## Usage

Update a requirement's fields.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | string | No | Acceptance criteria list |
| `candidateId` | string | null | No | Originating harvest candidate UUID |
| `completionDate` | string | null | No | Completion date |
| `description` | string | No | New description |
| `featureId` | string | null | No | Reassign to feature |
| `id` | string | Yes | Requirement UUID |
| `parentId` | string | null | No | Parent requirement UUID |
| `priority` | string | No | New priority |
| `reqType` | string | null | No | Requirement type: Epic, Story, Task, Bug |
| `startDate` | string | null | No | Start date |
| `status` | string | No | New status |
| `subsystemId` | string | No | Reassign to subsystem |
| `systemId` | string | No | Reassign to system |
| `title` | string | No | New title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_update_requirement`
