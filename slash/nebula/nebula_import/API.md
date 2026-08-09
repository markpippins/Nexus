# Command

/nebula nebula_import

## Usage

Bulk import systems, requirements, sessions, preferences, and info tabs from a migration payload.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `infoTabs` | object | No | Info tabs map: systemId -> { tabId -> content } |
| `preferences` | object | No | Preferences key/value map |
| `requirements` | array | No | Array of requirement objects to import |
| `systems` | array | No | Array of system objects to import |
| `workSessions` | array | No | Array of work session objects to import |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_import`
