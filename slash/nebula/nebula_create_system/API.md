# Command

/nebula nebula_create_system

## Usage

Create a new system in Nebula RMS.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `architecture` | string | null | No | Architecture notes |
| `description` | string | No | System description |
| `name` | string | Yes | System name (required) |
| `readme` | string | null | No | Markdown readme content |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_system`
