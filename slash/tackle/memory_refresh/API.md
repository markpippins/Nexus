# Command

/tackle memory_refresh

## Usage

Trigger a full PG->Redis sync on the role-memory-srv. Reads all active procedures from PostgreSQL and repopulates the Redis cache.

## Parameters

*No parameters required.*

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `memory_refresh`
