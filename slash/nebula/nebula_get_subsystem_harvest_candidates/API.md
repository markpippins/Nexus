# Command

/nebula nebula_get_subsystem_harvest_candidates

## Usage

List all harvest candidates linked to a specific subsystem (filtered by subsystem_id). Returns candidates with their hierarchy links and harvest source.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subsystemId` | string | Yes | Subsystem UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_get_subsystem_harvest_candidates`
