# Command

/nebula nebula_move_subsystem

## Usage

Move a subsystem to a different parent system (transactional).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subsystemId` | string | Yes | Subsystem UUID to move |
| `targetSystemId` | string | Yes | Target parent system UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_move_subsystem`
