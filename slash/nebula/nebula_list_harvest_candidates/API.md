# Command

/nebula nebula_list_harvest_candidates

## Usage

List harvest candidates, optionally filtered by harvest, system, subsystem, or feature. Each candidate is an individually addressable specification extracted from a harvest.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `featureId` | string | No | Filter by linked feature UUID |
| `harvestId` | string | No | Filter by parent harvest UUID |
| `limit` | number | No | Max results (default 100, max 500) |
| `offset` | number | No | Offset for pagination |
| `subsystemId` | string | No | Filter by linked subsystem UUID |
| `systemId` | string | No | Filter by linked system UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_harvest_candidates`
