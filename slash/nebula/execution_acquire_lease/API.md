# Command

/nebula execution_acquire_lease

## Usage

Acquire a temporal lease on an execution request. Only one active lease per request at a time.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `executorId` | string | Yes | Executor identity (e.g. 'conduit', 'cli', 'jenkins') |
| `requestId` | string | Yes | Request UUID to lease |
| `ttlSeconds` | number | No | Time-to-live in seconds (default: 300) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `execution_acquire_lease`
