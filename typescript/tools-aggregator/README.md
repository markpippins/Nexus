# Tools Aggregator — Unified MCP Tool Access

The **Tools Aggregator** provides centralized discovery and invocation of all tools from all MCP services (conduit-mcp, tackle-mcp, nebula-mcp, knowledge-mcp, terrain-mcp, vision-mcp, peb-mcp, role-memory-srv).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Inference Harness                        │
│                    (Python agent/chain)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │    Tools Aggregator Client             │
        │  (nexus/python/tackle/tools_aggregator_client.py)    │
        └────────────────────┬───────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │   Tools Aggregator Service             │
        │   (nexus/typescript/tools-aggregator/) │
        │   Port: 3200 (default)                 │
        └────────┬────────────────────┬──────────┘
                 │                    │
        ┌────────▼──────┐   ┌────────▼──────┐
        │ conduit-mcp   │   │ tackle-mcp    │  ... (7 other services)
        │ Port: 3100    │   │ Port: 3101    │
        └───────────────┘   └───────────────┘
```

## Setup

### 1. Install the Aggregator Service

```bash
cd /home/codex/dev/nexus/typescript/tools-aggregator
npm install
npm run build
```

### 2. Start the Aggregator

```bash
# Development (with auto-reload)
npm run dev

# Production
npm run start
```

The service will:
1. Start on port 3200 (configurable via `TOOLS_AGGREGATOR_PORT`)
2. Auto-discover all MCP services on startup
3. Create a unified tool registry
4. Expose HTTP endpoints for tool discovery and invocation

### 3. Use in Your Harness

#### TypeScript / Node.js

```typescript
import fetch from "node-fetch";

const client = new ToolsAggregatorClient("http://localhost:3200");

// Initialize discovery
await client.init();

// List all tools
const tools = client.listTools();

// Call a tool
const result = await client.callTool("query_conduit_state", {});
```

#### Python (Async)

```python
from nexus.python.tackle.tools_aggregator_client import ToolsAggregatorClient

async def main():
    client = ToolsAggregatorClient("http://localhost:3200")
    
    # Initialize discovery
    await client.init()
    
    # List all tools
    tools = client.list_tools()
    
    # Call a tool
    result = await client.call_tool("query_conduit_state", {})
    
    await client.close()
```

#### Python (Synchronous)

```python
from nexus.python.tackle.tools_aggregator_client import SyncToolsAggregatorClient

# Initialize
client = SyncToolsAggregatorClient("http://localhost:3200")
client.init()

# List all tools
tools = client.list_tools()

# Call a tool
result = client.call_tool("query_conduit_state", {})

client.close()
```

## API Endpoints

### GET /health

Check the health and status of the aggregator.

```bash
curl http://localhost:3200/health
```

**Response:**
```json
{
  "status": "ready",
  "timestamp": 1719474123456,
  "services": {
    "total": 8,
    "reachable": 7,
    "status": {
      "conduit-mcp": { "reachable": true, "toolCount": 15 },
      "tackle-mcp": { "reachable": true, "toolCount": 28 },
      ...
    }
  },
  "tools": {
    "total": 95
  }
}
```

### POST /init

Trigger tool discovery (runs automatically on startup).

```bash
curl -X POST http://localhost:3200/init
```

### GET /tools

List all available tools across all services.

```bash
curl http://localhost:3200/tools
```

**Response:**
```json
{
  "tools": [
    {
      "name": "query_conduit_state",
      "description": "Returns the full conduit state JSON including all plans...",
      "service": "conduit-mcp",
      "inputSchema": { ... }
    },
    ...
  ],
  "total": 95
}
```

### GET /tools/:name

Get a specific tool definition.

```bash
curl http://localhost:3200/tools/query_conduit_state
```

### GET /tools/by-service/:service

Get all tools from a specific service.

```bash
curl http://localhost:3200/tools/by-service/conduit-mcp
```

### POST /tools/call

Call a tool through the aggregator.

```bash
curl -X POST http://localhost:3200/tools/call \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "query_conduit_state",
    "arguments": {}
  }'
```

**Response:**
```json
{
  "success": true,
  "result": { ... },
  "service": "conduit-mcp",
  "tool": "query_conduit_state",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1719474123456
}
```

### GET /registry

Get the full tool registry.

```bash
curl http://localhost:3200/registry
```

## Configuration

Set these environment variables to customize the aggregator:

| Variable | Default | Description |
|----------|---------|-------------|
| `TOOLS_AGGREGATOR_PORT` | `3200` | Port to listen on |
| `TOOLS_AGGREGATOR_HOST` | `0.0.0.0` | Host to bind to |
| `CONDUIT_MCP_URL` | `http://localhost:3100` | Conduit MCP service URL |
| `TACKLE_MCP_URL` | `http://localhost:3101` | Tackle MCP service URL |
| `NEBULA_MCP_URL` | `http://localhost:3102` | Nebula MCP service URL |
| `KNOWLEDGE_MCP_URL` | `http://localhost:3103` | Knowledge MCP service URL |
| `TERRAIN_MCP_URL` | `http://localhost:3104` | Terrain MCP service URL |
| `VISION_MCP_URL` | `http://localhost:3105` | Vision MCP service URL |
| `PEB_MCP_URL` | `http://localhost:3106` | PEB MCP service URL |
| `ROLE_MEMORY_URL` | `http://localhost:3500` | Role Memory service URL |

## Integration with Harness

To integrate the tools aggregator with your inference harness:

### 1. Add to Harness Initialization

```python
from nexus.python.tackle.tools_aggregator_client import SyncToolsAggregatorClient

class InferenceHarness:
    def __init__(self, harness_name: str, ...):
        self.harness_name = harness_name
        self.tools_client = SyncToolsAggregatorClient()
        self.tools_client.init()  # Discover all tools
        self._tools_by_name = {t.name: t for t in self.tools_client.list_tools()}
    
    def available_tools(self):
        """Return tools available to the agent."""
        return self._tools_by_name
    
    def invoke_tool(self, tool_name: str, arguments: dict):
        """Call a tool through the aggregator."""
        return self.tools_client.call_tool(tool_name, arguments)
```

### 2. Pass Tools to Agent

```python
# For LangChain
from langchain.tools import Tool

def make_langchain_tools(harness):
    """Convert aggregated tools to LangChain tools."""
    tools = []
    for tool_name, tool_def in harness.available_tools().items():
        tools.append(Tool(
            name=tool_name,
            description=tool_def.description,
            func=lambda args, t=tool_name: harness.invoke_tool(t, args)
        ))
    return tools

# For OpenAI Functions
def make_openai_tools(harness):
    """Convert aggregated tools to OpenAI function definitions."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema
            }
        }
        for tool in harness.available_tools().values()
    ]
```

## Service Discovery

The aggregator automatically discovers MCP services from environment variables or default URLs:

```
conduit-mcp    → http://localhost:3100  (required)
tackle-mcp     → http://localhost:3101  (required)
nebula-mcp     → http://localhost:3102
knowledge-mcp  → http://localhost:3103
terrain-mcp    → http://localhost:3104
vision-mcp     → http://localhost:3105
peb-mcp        → http://localhost:3106
role-memory-srv → http://localhost:3500
```

If a required service is unreachable, the aggregator logs a warning but continues. If an optional service is unavailable, it's simply marked as unreachable in the status.

## Error Handling

The aggregator returns structured error responses:

```json
{
  "success": false,
  "error": "Tool execution failed",
  "service": "conduit-mcp",
  "tool": "query_conduit_state",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1719474123456
}
```

Error codes:
- `TOOL_NOT_FOUND` — Tool doesn't exist in any service
- `SERVICE_NOT_FOUND` — Service doesn't exist
- `INVALID_REQUEST` — Missing required fields
- `INTERNAL_ERROR` — Server-side error

## Troubleshooting

### Tools not being discovered

1. Check aggregator health:
   ```bash
   curl http://localhost:3200/health
   ```

2. Ensure MCP services are running on expected ports

3. Check environment variables for service URLs:
   ```bash
   echo $CONDUIT_MCP_URL
   echo $TACKLE_MCP_URL
   ```

4. Trigger manual discovery:
   ```bash
   curl -X POST http://localhost:3200/init
   ```

### Tool call fails

1. Verify the tool name exists:
   ```bash
   curl http://localhost:3200/tools | grep <tool_name>
   ```

2. Check the tool's input schema for required arguments:
   ```bash
   curl http://localhost:3200/tools/<tool_name>
   ```

3. Check aggregator logs for detailed error messages

## Command Router (slash-command-mcp fold, D-2026-08-16-002)

The aggregator also serves the DSL command tools natively — no separate
slash-command-mcp service (:3220 retired). Service name `command-router`,
protocol `local`:

- `command_lookup` — resolve a command to its service/tool
- `command_completions` — completions for a partial DSL line
- `command_execute` — execute a DSL command (single hop through the
  aggregator's own `mcp.command_registry` read-model)

Registry read-model lives in `src/command-registry.ts`; parsing/coercion in
`src/command-parser.ts` / `src/command-coerce.ts`; dispatch in
`src/command-router.ts`. Direct REST clients can use the `/commands/*`
namespace (`/commands/execute`, `/commands/search/:prefix`,
`/commands/resolve/:command`, `/commands/:service/commands`) instead of
JSON-RPC. See `docs/slash-command-mcp-retirement.md` for the full record.

## Docker

To run the aggregator in Docker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY nexus/typescript/tools-aggregator .
RUN npm install && npm run build
EXPOSE 3200
CMD ["npm", "start"]
```

```bash
docker run -p 3200:3200 \
  -e CONDUIT_MCP_URL=http://host.docker.internal:3100 \
  -e TACKLE_MCP_URL=http://host.docker.internal:3101 \
  tools-aggregator
```
