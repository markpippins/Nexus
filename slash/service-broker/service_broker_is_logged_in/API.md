# Command

/service-broker service_broker_is_logged_in

## Usage

Check if a token is still valid (user is logged in).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token` | string | Yes | The auth token from a previous login |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `service-broker-mcp`
- **Tool**: `service_broker_is_logged_in`
