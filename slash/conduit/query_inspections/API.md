# Command

/conduit query_inspections

## Usage

Search inspection records. Scans the audit/INSPECTIONS directory for markdown files and returns them as InspectionEntry objects with category, status, and date range filters.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Filter by category: report, error, warning, blocker-report, todo, triage |
| `dateFrom` | string | No | Filter entries modified after this ISO date |
| `dateTo` | string | No | Filter entries modified before this ISO date |
| `page` | number | No | Page number (1-based), default 1 |
| `pageSize` | number | No | Items per page, default 50 |
| `planRef` | string | No | Filter by associated plan number |
| `search` | string | No | Free-text search across titles and summaries |
| `status` | string | No | Filter by status: resolved, unresolved, pending |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `query_inspections`
