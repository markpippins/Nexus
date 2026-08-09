# Command

/nebula nebula_create_feature

## Usage

Create a new feature under a subsystem.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `description` | string | No | Feature description |
| `name` | string | Yes | Feature name |
| `readme` | string | null | No | Markdown readme for this feature |
| `subsystemId` | string | Yes | Parent subsystem UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_feature`
