# Command

/nebula execution_renew_lease

## Usage

Renew an active lease (extend TTL). Fails if lease is expired or released.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Lease UUID |
| `ttlSeconds` | number | No | New TTL in seconds (default: 300) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_renew_lease`
