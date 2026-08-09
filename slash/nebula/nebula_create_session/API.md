# Command

/nebula nebula_create_session

## Usage

Record a new work session against a system, subsystem, feature, or requirement.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `context` | string | No | Work context description |
| `model` | string | No | AI model used |
| `outcome` | string | null | No | Session outcome notes |
| `parentId` | string | Yes | Parent entity UUID |
| `parentName` | string | No | Name of parent entity |
| `parentType` | enum(system,subsystem,feature,requirement) | Yes | Type of parent entity |
| `platform` | string | No | Platform used (e.g. 'codebuff', 'claude') |
| `status` | string | No | Session status: Pending, Completed |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_session`
