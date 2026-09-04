# mcp-bridge

Generic **stdio-to-SSE bridge** for MCP servers. Spawns one or more stdio MCP
servers as child processes and re-exposes each over the MCP-over-SSE transport
on its own port, so the `tools-aggregator` (and any other SSE-capable MCP client)
can reach MCPs that only speak stdio — `knowledge-mcp`, `vision-mcp`, `peb-mcp`,
`terrain-mcp`, `tackle-prompt-bridge` — without each package shipping its own
`src/sse.ts` variant.

This is **Plan B** from Assembly to-do `33177879`: one generic wrapper per
package's `src/sse.ts` boilerplate, configured by env instead of edited
per-package.

## Why

The `tools-aggregator` reached only HTTP-shaped MCPs (REST + JSON-RPC). The
four stdio-only MCPs above were unreachable through the aggregator's
discovery layer. This bridge front-ends each of them over the same SSE
transport the aggregator already understands (via the SSE adapter in
`tools-aggregator/src/discovery.ts`), so adding a new stdio MCP doesn't
require ~80 lines of per-package SSE wiring.

## Configuration

One env block per served MCP. `MCP_BRIDGE_<NAME>_PORT` is the
discriminator — the bridge scans env for those keys and treats each match
as a target spec.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `MCP_BRIDGE_<NAME>_PORT` | yes | `3131` | The bridge listens on this port |
| `MCP_BRIDGE_<NAME>_CMD` | yes | `node` | Executable to spawn the child with |
| `MCP_BRIDGE_<NAME>_ARGS` | yes | `dist/index.js` | Spawn args, `;`-separated if multiple |
| `MCP_BRIDGE_<NAME>_CWD` | yes | `/home/codex/dev/nexus/typescript/knowledge-mcp` | Working directory for the child |
| `MCP_BRIDGE_<NAME>_ENV_<K>` | no | `KNOWLEDGE_DB_URL=…` | Per-target extra env var (`<K>` uppercase) |

`<NAME>` is matched to the MCP service the aggregator expects (e.g.
`KNOWLEDGE`, `VISION`, `PEB`, `TERRAIN`). The bridge logs as
`mcp-bridge[<NAME>]`.

## Port assignments (defaults wired today)

| MCP | Port | Aggregator service name |
|---|---|---|
| knowledge-mcp | 3131 | `knowledge-mcp` |
| vision-mcp | 3132 | `vision-mcp` |
| peb-mcp | 3133 | `peb-mcp` |
| terrain-mcp | 3134 | `terrain-mcp` |
| tackle-prompt-bridge | 3135 | `tackle-prompt-bridge` |
| sonar-mcp | 3137 | `sonar-mcp` |

Operators can re-target a single bridge-wrapped MCP without editing the
aggregator's `DEFAULT_SERVICES` by overriding the matching
`MCP_BRIDGE_<NAME>_URL` env on the aggregator side.

## Capabilities forwarded

The bridge advertises **both** `tools` and `prompts` capabilities to its SSE
clients, and forwards the matching JSON-RPC methods to the child verbatim:

| Method | Forwarded via | Notes |
|---|---|---|
| `tools/list` | `client.listTools()` | Verbatim; child owns schemas |
| `tools/call` | `client.callTool(...)` | No arg validation; child validates |
| `prompts/list` | `client.listPrompts(...)` | Added for `tackle-prompt-bridge`; pass-through `params` for per-role scope |
| `prompts/get` | `client.getPrompt(...)` | No placeholder rendering; child returns raw `body_md` + `_tackle` metadata |

A tool-only child (knowledge/vision/peb/terrain) simply won't return prompts — a
mistargeted `prompts/get` will error on the child side, which is correct (we do
NOT mask the gap with a fake empty list). A prompt-only child (tackle-prompt-bridge)
behaves the same way for `tools/*`.

## How it works

For each target:

1. Spawns the configured child process via `StdioClientTransport`.
2. Connects an MCP `Client` to the child over stdio.
3. Stands up `http.createServer` exposing `GET /sse`, `POST /messages`,
   `GET /health`, exactly mirroring `nebula-mcp/src/sse.ts`.
4. Forwards `tools/list`, `tools/call`, `prompts/list`, and `prompts/get`
   JSON-RPC requests from the upstream SSE stream to the child client
   verbatim (no schema re-materialization — the child MCP owns its own
   validation; no placeholder rendering — the caller renders parameters).

## Lifecycle

- The child is spawned once at bridge startup and held alive for the
  bridge's lifetime. Spawning a fresh child per SSE session would defeat
  the bridge's startup-cost amortization.
- If a child exits, the bridge logs the close; `Restart=on-failure` in the
  systemd unit restarts the entire bridge so all targets come back.
- `SIGTERM` triggers a clean shutdown: HTTP server closes, child closes,
  bridge exits.

## Cross-refs

- Assembly to-do `33177879` — original gap analysis and acceptance criteria.
- SSE adapter (the client side the aggregator uses to reach this bridge):
  `nexus/typescript/tools-aggregator/src/discovery.ts` (`discoverSSE`,
  `sseCallTool`, `SseSession` pool).
- Similar hand-written SSE server (the pattern the bridge replaces for new
  stdio MCPs): `nexus/typescript/nebula-mcp/src/sse.ts`.
