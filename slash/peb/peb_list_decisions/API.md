# Command

/peb peb_list_decisions

## Usage

List architecture decisions from peb.decisions. Filterable by status, author, affected key.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `adr_number` | string | No | Filter by exact ADR number (e.g. ADR-001) |
| `affected_key` | string | No | Filter by affected key (array overlap) |
| `author_id` | string | No | Filter by author role or name |
| `limit` | number | No | Max results (default 100, max 500) |
| `offset` | number | No | Offset for pagination |
| `status` | string | No | Filter by status (accepted, proposed, superseded, deprecated) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_list_decisions`
