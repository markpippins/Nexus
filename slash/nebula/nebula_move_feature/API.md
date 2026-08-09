# Command

/nebula nebula_move_feature

## Usage

Move a feature to a different subsystem (transactional, re-parents requirements).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `featureId` | string | Yes | Feature UUID to move |
| `targetSubsystemId` | string | Yes | Target subsystem UUID |
| `targetSystemId` | string | Yes | Target system UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_move_feature`
