# Command

/nebula nebula_create_subsystem

## Usage

Create a new subsystem under a system.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `description` | string | No | Subsystem description |
| `name` | string | Yes | Subsystem name |
| `readme` | string | null | No | Markdown readme for this subsystem |
| `systemId` | string | Yes | Parent system UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_subsystem`
