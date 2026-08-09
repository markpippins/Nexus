# Command

/conduit report_builder_status

## Usage

Report or update builder process status

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `note` | string | No | Optional note |
| `pid` | number | No | Optional PID |
| `status` | string | Yes | Builder status (running, idle, stale, killed) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `report_builder_status`
