# Command

/conduit query_archive

## Usage

Search archived pipeline artifacts. Scans the audit/ARCHIVES directory for markdown files and returns them as ArchiveEntry objects with pagination, category, and date range filters.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Filter by category: completed-plans, build-logs, prompts, changes |
| `dateFrom` | string | No | Filter entries modified after this ISO date |
| `dateTo` | string | No | Filter entries modified before this ISO date |
| `page` | number | No | Page number (1-based), default 1 |
| `pageSize` | number | No | Items per page, default 50 |
| `search` | string | No | Free-text search across titles and summaries |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `query_archive`
