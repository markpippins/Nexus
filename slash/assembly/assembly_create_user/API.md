# Command

/assembly assembly_create_user

## Usage

Create a new user

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `alias` | string | Yes | Username (must be unique) |
| `avatar_url` | string | No | Optional avatar URL |
| `email` | string | Yes | Email address (must be unique) |
| `password` | string | No | Optional password (defaults to 'changeme') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_create_user`
