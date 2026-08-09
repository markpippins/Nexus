# Command

/nebula nebula_create_workspace

## Usage

Map a system or subsystem to a filesystem workspace path.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subsystemId` | string | null | No | Optional subsystem UUID |
| `systemId` | string | Yes | System UUID |
| `workspacePath` | string | Yes | Relative path from nexus root (e.g. 'typescript/conduit-mcp') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_workspace`
