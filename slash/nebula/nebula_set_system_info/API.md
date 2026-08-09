# Command

/nebula nebula_set_system_info

## Usage

Save content to a system info tab.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | Yes | Tab content (Markdown or text) |
| `systemId` | string | Yes | System UUID |
| `tabId` | string | Yes | Tab identifier (e.g. 'overview', 'dependencies') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_set_system_info`
