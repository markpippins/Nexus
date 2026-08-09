# Command

/nebula nebula_create_requirement

## Usage

Create a new requirement in the backlog.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | string | No | Acceptance criteria list |
| `candidateId` | string | null | No | Originating harvest candidate UUID |
| `completionDate` | string | null | No | Completion date string |
| `description` | string | No | Requirement description |
| `featureId` | string | null | No | Optional feature UUID |
| `parentId` | string | null | No | Parent requirement UUID (for hierarchy) |
| `priority` | string | No | Priority: Low, Medium, High |
| `reqType` | string | null | No | Requirement type: Epic, Story, Task, Bug |
| `startDate` | string | null | No | Start date string |
| `status` | string | No | Status: Backlog, ToDo, InProgress, Active, Blocked, Done, Cancelled, Accepted |
| `subsystemId` | string | null | No | Optional subsystem UUID — requirement can live at system level |
| `systemId` | string | Yes | System UUID |
| `title` | string | Yes | Requirement title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_requirement`
