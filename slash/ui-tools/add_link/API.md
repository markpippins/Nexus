# Command

/ui-tools add_link

## Usage

Add a new link to the statusbar button box. Creates a new entry in throttler.links. The link will appear at the end of the button bar.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `address` | string | Yes | URL for the link (e.g., https://console.cloud.google.com) |
| `imagename` | string | Yes | Short image name used to fetch the icon from the image server (e.g., google-cloud-console) |
| `text` | string | No | Optional display text for the tooltip |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `ui-tools-mcp`
- **Tool**: `add_link`
