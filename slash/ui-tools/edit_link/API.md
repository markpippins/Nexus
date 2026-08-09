# Command

/ui-tools edit_link

## Usage

Edit an existing link's properties. Can update address, imagename, text, or type. Use type='separator' to convert a link into a separator.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `address` | string | No | New URL for the link |
| `id` | string | Yes | UUID of the link to edit |
| `imagename` | string | No | New image name for the icon |
| `text` | string | No | New display text for tooltip |
| `type` | enum(link,separator) | No | Type of item: 'link' or 'separator' |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `ui-tools-mcp`
- **Tool**: `edit_link`
