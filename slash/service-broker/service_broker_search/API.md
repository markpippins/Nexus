# Command

/service-broker service_broker_search

## Usage

Perform a Google search via the broker-gateway. Calls googleSearchService.simpleSearch. Returns up to 10 results with title, link, snippet, and displayLink.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | The search query string |
| `token` | string | No | Auth token (any value works; broker does not validate search tokens) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `service-broker-mcp`
- **Tool**: `service_broker_search`
