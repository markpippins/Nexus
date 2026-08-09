# Command

/service-broker service_broker_login

## Usage

Login via the service-broker. Returns a token, userId, and admin status. The token is valid for 24 hours.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `email` | string | Yes | User email (matches assembly.users.email) |
| `password` | string | Yes | User password |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `service-broker-mcp`
- **Tool**: `service_broker_login`
