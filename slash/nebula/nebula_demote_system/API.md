# Command

/nebula nebula_demote_system

## Usage

Demote a system into a subsystem of another system (merges hierarchy).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sourceSystemId` | string | Yes | System UUID to demote |
| `targetSystemId` | string | Yes | Target system UUID that will become the parent |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_demote_system`
