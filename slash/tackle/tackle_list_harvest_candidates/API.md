# Command

/tackle tackle_list_harvest_candidates

## Usage

List harvest candidates from the Nebula RMS. Each candidate is a specification extracted from a harvest pipeline run. Optionally filter by harvest, system, subsystem, or feature.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `featureId` | string | No | Filter by linked feature UUID |
| `harvestId` | string | No | Filter by parent harvest UUID |
| `limit` | number | No | Max results (default 100) |
| `offset` | number | No | Pagination offset |
| `subsystemId` | string | No | Filter by linked subsystem UUID |
| `systemId` | string | No | Filter by linked system UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `tackle_list_harvest_candidates`
