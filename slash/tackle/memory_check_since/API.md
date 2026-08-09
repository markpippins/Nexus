# Command

/tackle memory_check_since

## Usage

Check whether role memory procedures have changed since a given timestamp for a specific role. Queries PostgreSQL directly.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | Role name |
| `since` | string | Yes | ISO 8601 timestamp (e.g. '2026-06-23T00:00:00Z') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `memory_check_since`
