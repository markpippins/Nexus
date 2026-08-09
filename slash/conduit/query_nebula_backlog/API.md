# Command

/conduit query_nebula_backlog

## Usage

Query the Nebula RMS backlog — returns all requirements with their status, priority, system, and subsystem. Useful for engineers to see what work is pending. Optionally filter by status or priority.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `priority` | string | No | Optional priority filter (e.g., "High", "Medium", "Low") |
| `status` | string | No | Optional status filter (e.g., "Backlog", "InProgress", "Done") |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `query_nebula_backlog`
