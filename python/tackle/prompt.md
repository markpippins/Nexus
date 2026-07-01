# Tackle Package — Tools Aggregator Client

## `tools_aggregator_client.py`

The `ToolsAggregatorClient` (async) and `SyncToolsAggregatorClient` (sync wrapper)
provide a Python API for the centralized Tools Aggregator service on port 3200.

### Capabilities

- **Tool discovery** — `POST /init` triggers server-side discovery across 8 MCP services
- **Tool listing** — `GET /tools` returns all aggregated tool definitions
- **Tool invocation** — `POST /tools/call` routes to the correct MCP service
- **Group by service** — Tools are tagged with their source service name

### Usage (sync)

```python
from tackle.tools_aggregator_client import SyncToolsAggregatorClient

client = SyncToolsAggregatorClient("http://localhost:3200")
client.init()
tools = client.list_tools()
result = client.call_tool("nebula_health", {})
client.close()
```

### Known Limitations

- Only **conduit-mcp** (port 3100) is currently reachable by the aggregator
- Other services have wrong default URLs or use incompatible transports (SSE, stdio)
- Requires `httpx` to be installed

### Changes — 2026-06-27

- Fixed `SyncToolsAggregatorClient` event loop bug: `_get_loop()` created a new
  event loop on every call, causing "bound to a different event loop" errors.
  Replaced with `_ensure_loop()` that stores and reuses the loop.
- Fixed tool cache in async `init()`: was calling `POST /init` on the server
  but never populating the local `_tools` dict. Added `await self._refresh_tools()`
  after successful initialization.
- Moved `self._initialized = True` after `_refresh_tools()` so an empty cache
  is never incorrectly reported as ready.
