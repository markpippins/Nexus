# MCP Transport Matrix

Canonical reference for how each MCP server in the Nexus platform is
reached over the wire. Source of truth for Gap 2 of to-do `8e09a57f`
("MCP layer gaps") — agents should consult this instead of probing.

## Rules of thumb

1. **`POST /` is the universal JSON-RPC endpoint.** All HTTP MCP servers
   accept JSON-RPC at `POST http://localhost:<port>/`. There is **no**
   `POST /tools/call` route anywhere — that path 404s.
2. **Two transport behaviors exist:**
   - **Stateless** — `tools/list` and `tools/call` work immediately with
     no handshake. `Content-Type: application/json` only.
   - **Sessionful (streamable HTTP)** — you must first
     `initialize`, read the `mcp-session-id` response header, then send
     all subsequent requests with `mcp-session-id` + `mcp-protocol-version: 2025-03-26`.
3. **`tools/list` is authoritative.** Each server's catalog is stable and
   registered in `mcp.command_registry` (seeded from the tools-aggregator
   at `:3210/tools`, which discovers every server via `tools/list`).
4. Tool names in `mcp.command_registry` use the service prefix without
   `-mcp` (e.g. `nebula_get_inbox` under service `nebula`).

## Matrix (verified 2026-08-09)

| Server | Port | Transport | Handshake required | Tools | Endpoint |
|---|---|---|---|---|---|
| conduit-mcp | 3100 | streamable HTTP (stateless POST /) | ❌ none | 29 | `POST /` |
| nebula-mcp | 3102 | streamable HTTP (sessionful) | ✅ initialize → `mcp-session-id` header | 105 | `POST /` (also legacy `GET /sse` + `POST /messages?sessionId=` on the same port) |
| address-tts-mcp | 3105 | streamable HTTP (stateless POST /) | ❌ none | 3 | `POST /` |
| semantics-mcp | 3161 | streamable HTTP (stateless POST /) | ❌ none | 77 | `POST /` |
| assembly-mcp | 3113 | streamable HTTP (stateless POST /) | ❌ none | 25 | `POST /` |
| slash-command-mcp | 3220 | streamable HTTP (stateless POST /) | ❌ none | 3 | `POST /` |
| tackle-mcp | 3400 | streamable HTTP (stateless POST /) | ❌ none | 42 | `POST /` |

### Other registered services (in `mcp.command_registry`, ports per config)

| Service | Registered tools | Notes |
|---|---|---|
| knowledge | 8 | knowledge-mcp |
| peb | 16 | peb-mcp |
| terrain | 13 | terrain-mcp (also serves the terrain registry API) |
| vision | 10 | vision-mcp |
| ui-tools | 6 | UI tool bridge |
| service-broker | 4 | — |

## Canonical client call (sessionful — nebula-mcp)

```python
import json, http.client

def rpc(method, params, sid=None):
    conn = http.client.HTTPConnection("localhost", 3102)
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if sid:
        headers["mcp-session-id"] = sid
        headers["mcp-protocol-version"] = "2025-03-26"
    conn.request("POST", "/", json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(), headers)
    resp = conn.getresponse()
    sid_out = resp.getheader("mcp-session-id")
    body = resp.read().decode()
    conn.close()
    return sid_out, json.loads(body)

sid, _ = rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "x", "version": "1"}})
rpc("notifications/initialized", {}, sid)
_, result = rpc("tools/call", {"name": "nebula_get_inbox", "arguments": {"role": "engineer"}}, sid)
```

## Canonical client call (stateless — most servers)

```bash
curl -s -X POST http://localhost:3400/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Why nebula-mcp requires the handshake (and others don't)

nebula-mcp (`src/sse.ts`) implements the MCP Streamable HTTP spec
faithfully — requests without an initialized session return
`-32000 Bad Request: Server not initialized`. The other servers
(deployed via the `@modelcontextprotocol/sdk` stateless pattern or a
custom router) answer `tools/list` without a session. This asymmetry is
intentional (sessionful enables per-connection state); the matrix above
is the canonical record of which is which.
