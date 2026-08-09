# Command

/nebula nebula_spawn_plan_from_candidate

## Usage

Full flow: link a harvest candidate to a system/subsystem, create a requirement derived from the candidate's title and intent, and optionally cross-reference a conduit plan — all in one atomic transaction. Returns the updated candidate, the new requirement, and the cross-reference (if planRef was provided).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | string | No | Acceptance criteria list |
| `description` | string | No | Requirement description (defaults to candidate intent_description) |
| `featureId` | string | null | No | Optional feature UUID to link candidate and requirement to |
| `id` | string | Yes | Harvest candidate UUID |
| `parentId` | string | null | No | Parent requirement UUID (for hierarchy) |
| `planRef` | string | No | Optional conduit plan reference (e.g. '0136') — creates a cross-reference with rel_type='spawns_plan' |
| `priority` | string | No | Requirement priority: Low, Medium, High (default Medium) |
| `reqType` | string | null | No | Requirement type: Epic, Story, Task, Bug |
| `status` | string | No | Requirement status: Backlog, ToDo, InProgress, Active, Blocked, Done, Cancelled, Accepted (default Backlog) |
| `subsystemId` | string | null | No | Optional subsystem UUID — requirement can live at system level |
| `systemId` | string | Yes | System UUID to link the candidate to (also used for the requirement and info tab) |
| `title` | string | No | Requirement title (defaults to candidate title) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_spawn_plan_from_candidate`
