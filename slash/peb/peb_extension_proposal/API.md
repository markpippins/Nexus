# Command

/peb peb_extension_proposal

## Usage

When PEB is silent on an issue, propose an extension.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entity_id` | string | Yes |  |
| `gap_description` | string | Yes |  |
| `proposed_content` | string | No |  |
| `rationale` | string | Yes |  |
| `target_key` | string | Yes |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_extension_proposal`
