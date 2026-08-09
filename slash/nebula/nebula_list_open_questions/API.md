# Command

/nebula nebula_list_open_questions

## Usage

List open questions, optionally filtered by requirement, candidate, or status.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `candidateId` | string | No | Filter by candidate UUID |
| `requirementId` | string | No | Filter by requirement UUID |
| `status` | string | No | Filter by status (default: OPEN) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_open_questions`
