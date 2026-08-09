# Command

/conduit query_changes

## Usage

Search change reports. Scans the audit/CHANGES directory for markdown files and returns them as ChangeReportEntry objects with category filters.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Filter by category: committed, flagged, reviewed |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `query_changes`
