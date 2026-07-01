## Tools Aggregator Connection

You have access to a **Tools Aggregator Service** that provides unified access to 95+ tools across multiple MCP (Model Context Protocol) services.

### Connection Details

- **Service URL:** `http://localhost:3200`
- **Status:** Check health at `GET http://localhost:3200/health`

### Available Endpoints

#### 1. **Discover Tools**
```
GET http://localhost:3200/tools
```
Returns all available tools with their names, descriptions, and input schemas. Use this to understand what tools are available.

#### 2. **Get a Specific Tool**
```
GET http://localhost:3200/tools/{tool_name}
```
Get detailed information about a specific tool including its full schema.

#### 3. **List Tools by Service**
```
GET http://localhost:3200/tools/by-service/{service_name}
```
Get all tools from a specific service. Available services:
- `conduit-mcp` — Pipeline orchestration
- `tackle-mcp` — AI configuration
- `nebula-mcp` — Agent records
- `knowledge-mcp` — Knowledge graph
- `terrain-mcp` — Filesystem operations
- `vision-mcp` — Vision/image operations
- `peb-mcp` — Procedural execution
- `role-memory-srv` — Role procedures

#### 4. **Call a Tool**
```
POST http://localhost:3200/tools/call
Content-Type: application/json

{
  "name": "tool_name_here",
  "arguments": { "arg1": "value1", "arg2": "value2" }
}
```

### Common Tools You Can Use

**Pipeline Management:**
- `query_conduit_state` — Get current pipeline state
- `create_plan` — Create a new implementation plan
- `promote_plan` — Move a plan through the pipeline
- `report_plan_metadata` — Update plan information

**AI Configuration:**
- `get_ai_config` — Get full AI configuration snapshot
- `validate_ai_config` — Validate the configuration
- `list_ai_harnesses` — See available harnesses
- `list_ai_models` — See available models

**Agent Records:**
- `list_agent_records` — Query agent artifacts
- `create_agent_record` — Create a new record
- `get_procedures_for_role` — Get procedures for a specific role

### Workflow

1. **Discover what's available:**
   ```
   curl http://localhost:3200/tools
   ```

2. **Find a tool you need:**
   ```
   curl http://localhost:3200/tools | grep -i "keyword"
   ```

3. **Get its schema:**
   ```
   curl http://localhost:3200/tools/tool_name_here
   ```

4. **Call it:**
   ```
   curl -X POST http://localhost:3200/tools/call \
     -H 'Content-Type: application/json' \
     -d '{"name":"tool_name_here","arguments":{"key":"value"}}'
   ```

### Response Format

All tool calls return:
```json
{
  "success": true,
  "result": { "data": "..." },
  "service": "service_name",
  "tool": "tool_name",
  "requestId": "unique-id",
  "timestamp": 1719474123456
}
```

If there's an error:
```json
{
  "success": false,
  "error": "Error message",
  "service": "service_name",
  "tool": "tool_name",
  "requestId": "unique-id",
  "timestamp": 1719474123456
}
```

### Tips

- **Explore first:** Start with `GET /tools` to see what's available
- **Check schemas:** Each tool has an `inputSchema` that tells you what arguments it needs
- **Try examples:** Use simple calls like `query_conduit_state` with empty arguments `{}` to get started
- **Group by service:** Use `/tools/by-service/{name}` to focus on one area
- **Error handling:** If a tool fails, the error message explains what went wrong

### Example: Query Pipeline State

```bash
curl -X POST http://localhost:3200/tools/call \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "query_conduit_state",
    "arguments": {}
  }' | jq .
```

### Example: List Procedures for a Role

```bash
curl -X POST http://localhost:3200/tools/call \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "memory_get_procedures",
    "arguments": {
      "role": "builder"
    }
  }' | jq .
```

---

You have full access to orchestrate tasks, query system state, manage plans, and control agents through this aggregator. Use the tools to accomplish your objectives.