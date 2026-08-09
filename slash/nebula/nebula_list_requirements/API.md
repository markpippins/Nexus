# Command

/nebula nebula_list_requirements

## Usage

List requirements, optionally filtered by system, subsystem, or feature.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `featureId` | string | No | Filter by feature UUID |
| `subsystemId` | string | No | Filter by subsystem UUID |
| `systemId` | string | No | Filter by system UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_requirements`
