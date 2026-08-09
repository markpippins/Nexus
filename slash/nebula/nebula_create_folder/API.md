# Command

/nebula nebula_create_folder

## Usage

Create a folder under a system (for organizing workspaces by category).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | enum(UI,Service,Library,Documentation,Config,data,api) | Yes | Folder category |
| `name` | string | Yes | Folder name |
| `note` | string | No | Optional note about this folder |
| `systemId` | string | Yes | Parent system UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_folder`
