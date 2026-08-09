# Command

/nebula nebula_list_harvests

## Usage

List harvest pipeline outputs, optionally filtered by model, version, or source hash.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `level` | number | No | Filter by abstraction level (1-4) |
| `limit` | number | No | Max results (default 100, max 500) |
| `model` | string | No | Filter by model name (e.g. 'DeepSeek V4') |
| `offset` | number | No | Offset for pagination |
| `sourceHash` | string | No | Filter by source content hash (MD5) |
| `version` | number | No | Filter by harvest version number |
| `visibilityScope` | string | No | Filter by visibility scope (builder, architect, planner, reviewer, all) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_harvests`
