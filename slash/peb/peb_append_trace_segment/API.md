# Command

/peb peb_append_trace_segment

## Usage

Append an observational trace segment (never authoritative).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `causal_entries` | string | No |  |
| `confidence` | number | Yes |  |
| `entity_id` | string | Yes |  |
| `inputs` | string | No |  |
| `parent_trace_id` | string | null | No |  |
| `rejected_alternatives` | string | No |  |
| `stage` | string | Yes |  |
| `work_request_id` | string | Yes |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_append_trace_segment`
