// Generic stdio→SSE bridge for MCP servers.
//
// Spawns one or more stdio MCP servers as child processes and re-exposes each
// over the MCP-over-SSE transport on its own port. The tools-aggregator
// (and any other SSE-capable MCP client) can then reach MCPs that only
// speak stdio — knowledge-mcp, vision-mcp, peb-mcp, terrain-mcp — by
// pointing at the bridge-assigned port instead of trying to spawn the
// stdio process itself.
//
// This is Plan B from the filed Assembly to-do (33177879): one generic
// wrapper per MCP package's `src/sse.ts` boilerplate, configured by env
// instead of edited per package.
//
// Config (one block per served MCP):
//
//   MCP_BRIDGE_<NAME>_CMD=<exec>            e.g. "node"
//   MCP_BRIDGE_<NAME>_ARGS=<arg;arg;...>    e.g. "dist/index.js"  (split on ';')
//   MCP_BRIDGE_<NAME>_PORT=<port>            e.g. "3131"
//   MCP_BRIDGE_<NAME>_CWD=<dir>              optional cwd, defaults to process.cwd
//   MCP_BRIDGE_<NAME>_ENV_<K>=<v>            per-MCP extra env vars (cumulative)
//
// NAME must match the MCP service the aggregator expects (e.g. `knowledge`,
// `vision`, `peb`, `terrain`). The aggregator reaches the bridge at
// http://localhost:<port>/. Discovery and tool calls are transparent:
// the aggregator's SSE adapter (tools-aggregator/src/discovery.ts) opens
// `GET /sse` here, gets back `/messages?sessionId=…`, and POSTs JSON-RPC
// envelopes that we forward straight to the spawned stdio child.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as http from "http";
import { URL } from "url";
import { pathToFileURL } from "url";

interface BridgeTarget {
  name: string;
  port: number;
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
}

function parseTargets(): BridgeTarget[] {
  const env = process.env;
  // Find names by scanning MCP_BRIDGE_*_PORT — PORT is the discriminator.
  const names = new Set<string>();
  for (const key of Object.keys(env)) {
    const m = key.match(/^MCP_BRIDGE_([A-Z0-9_]+)_PORT$/);
    if (m) names.add(m[1]);
  }
  if (names.size === 0) {
    console.error("[mcp-bridge] No MCP_BRIDGE_*_PORT env vars set; nothing to bridge.");
    console.error("[mcp-bridge] Example: MCP_BRIDGE_KNOWLEDGE_PORT=3131 MCP_BRIDGE_KNOWLEDGE_CMD=node MCP_BRIDGE_KNOWLEDGE_ARGS=dist/index.js MCP_BRIDGE_KNOWLEDGE_CWD=/home/codex/dev/nexus/typescript/knowledge-mcp");
    return [];
  }

  const targets: BridgeTarget[] = [];
  for (const name of names) {
    const pfx = `MCP_BRIDGE_${name}_`;
    const port = parseInt(env[`${pfx}PORT`] || "", 10);
    const command = env[`${pfx}CMD`];
    const argsRaw = env[`${pfx}ARGS`] || "";
    const cwd = env[`${pfx}CWD`];
    if (!port || !command) {
      console.error(`[mcp-bridge] Skipping ${name}: missing PORT or CMD`);
      continue;
    }
    const args = argsRaw ? argsRaw.split(";").map((a) => a).filter(Boolean) : [];
    const envExtra: Record<string, string> = {};
    for (const key of Object.keys(env)) {
      // SECURITY: escape regex metacharacters in pfx before interpolation.
      // name is constrained to [A-Z0-9_]+ by the extraction regex, but
      // defense-in-depth: escape anyway in case the constraint changes.
      const escapedPfx = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = key.match(new RegExp(`^${escapedPfx}ENV_([A-Z0-9_]+)$`, "i"));
      if (m) envExtra[m[1]] = env[key]!;
    }
    targets.push({ name, port, command, args, cwd, env: envExtra });
  }
  return targets;
}

interface Session {
  client: Client;
  transport: StdioClientTransport;
  sse: SSEServerTransport;
  sessionId: string;
}

async function serveTarget(target: BridgeTarget): Promise<void> {
  console.error(`[mcp-bridge] Starting ${target.name} → port ${target.port} (${target.command} ${target.args.join(" ")})`);

  // Build the child environment: inherit our env (so DB URLs, node path, etc.
  // work) then apply the per-MCP extras. Explicit inheritance is safer than
  // StdioClientTransport's default filtered env.
  const spawnEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") spawnEnv[k] = v;
  }
  for (const [k, v] of Object.entries(target.env)) {
    spawnEnv[k] = v;
  }

  // 1. Spawn + connect the stdio child via the MCP Client API.
  const childTransport = new StdioClientTransport({
    command: target.command,
    args: target.args,
    cwd: target.cwd,
    env: spawnEnv,
    // Pipe the child's stderr through our own stderr so internal MCP errors
    // surface in the bridge logs without polluting the JSON-RPC stdio channel.
    stderr: "inherit",
  });

  const client = new Client(
    { name: `mcp-bridge[${target.name}]`, version: "1.0.0" },
    { capabilities: {} }
  );

  // Forward child-transport errors to logs (so a crashed stdio child
  // surfaces here, not via an opaque stream close).
  childTransport.onerror = (err: any) => {
    console.error(`[mcp-bridge:${target.name}] child transport error:`, err?.message ?? err);
  };
  childTransport.onclose = () => {
    console.error(`[mcp-bridge:${target.name}] child transport closed`);
  };

  await client.connect(childTransport);
  console.error(`[mcp-bridge:${target.name}] child MCP client connected`);

  // 2. Stand up the SSE server that the aggregator will reach.
  // Same pattern as nebula-mcp/src/sse.ts: GET /sse opens a long-lived
  // stream emitting an `endpoint:` event naming `/messages?sessionId=<id>`,
  // and POST /messages?sessionId=<id> feeds inbound JSON-RPC envelopes
  // back through the SSE transport.
  //
  // To bridge transparently, we instantiate the standard SSE transport
  // and then route inbound `handlePostMessage` payloads through a thin
  // server-side McpServer that proxies every tool discovery + call to
  // the spawned client. Simpler: we register a single `server.tool()`
  // per discovered tool with a handler that forwards via `client.callTool`.
  // Limitation: that variant requires us to first enumerate the child's
  // tools at startup. We do that here, and re-list on each new SSE
  // connection so toolset changes between reconnects don't go stale.
  // We accept the small over-fetch cost (one extra `tools/list` per
  // session open) for simplicity.

  // We use the low-level SDK Server (not McpServer) so we can register
  // generic request handlers for `tools/list`, `tools/call`, `prompts/list`,
  // and `prompts/get` that fan out to the child client without enumerating
  // schemas in code. McpServer.tool() requires a zod schema per registered
  // tool, which would force us to materialize every child tool's inputSchema
  // into a zod object just to passthrough — pointless work for a proxy.
  //
  // Capability advertisement: we declare BOTH tools and prompts here. The
  // bridge proxies tool servers (knowledge/vision/peb/terrain) AND prompt
  // servers (tackle-prompt-bridge). A child that only implements one
  // capability simply won't return prompts the bridge can fan out — the
  // forwarded RPC will error on the child side, which is the correct
  // behavior (no fake "empty list" masking a misconfigured child).
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const server = new Server(
    { name: `mcp-bridge[${target.name}]`, version: "1.0.0" },
    { capabilities: { tools: {}, prompts: {} } }
  );

  // Forward tools/list to the child client verbatim.
  server.setRequestHandler(
    await import("@modelcontextprotocol/sdk/types.js").then((m) => m.ListToolsRequestSchema),
    async () => {
      const r = await client.listTools();
      return { tools: r.tools };
    }
  );

  // Forward tools/call to the child client verbatim. We do NOT validate
  // arguments — the child MCP owns its own schema validation.
  server.setRequestHandler(
    await import("@modelcontextprotocol/sdk/types.js").then((m) => m.CallToolRequestSchema),
    async (req: any) => {
      const r = await client.callTool({ name: req.params.name, arguments: req.params.arguments });
      return r;
    }
  );

  // Forward prompts/list to the child client verbatim. Added for
  // tackle-prompt-bridge (and any future prompt-only child). The child owns
  // the role-scope cursor semantics; we pass the arguments through
  // unchanged so a per-role `prompts/list` works end-to-end.
  server.setRequestHandler(
    await import("@modelcontextprotocol/sdk/types.js").then((m) => m.ListPromptsRequestSchema),
    async (req: any) => {
      const r: any = await (client as any).listPrompts(req?.params || {});
      return { prompts: r.prompts ?? [] };
    }
  );

  // Forward prompts/get to the child client verbatim. We do NOT render
  // {placeholders} — the child (tackle-prompt-bridge) deliberately returns
  // raw body_md + a _tackle metadata block, and parameter substitution is
  // the caller's responsibility (per the prompt-bridge design).
  server.setRequestHandler(
    await import("@modelcontextprotocol/sdk/types.js").then((m) => m.GetPromptRequestSchema),
    async (req: any) => {
      const r: any = await (client as any).getPrompt(req?.params || {});
      return r;
    }
  );

  // Live SSE sessions on this server. The SDK's SSEServerTransport
  // reads/writes the open /sse stream; we map sessionId → transport so
  // the /messages POST route can find the live one.
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      sessions.set(sessionId, transport);
      req.socket.on("close", () => {
        sessions.delete(sessionId);
      });
      try {
        await server.connect(transport);
      } catch (err: any) {
        console.error(`[mcp-bridge:${target.name}] SSE connect error:`, err);
        sessions.delete(sessionId);
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active SSE session for sessionId" }));
        return;
      }
      const transport = sessions.get(sessionId)!;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", async () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        try {
          await transport.handlePostMessage(req, res, body);
        } catch (err: any) {
          console.error(`[mcp-bridge:${target.name}] handle message error:`, err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        service: `mcp-bridge[${target.name}]`,
        target: target.name,
        port: target.port,
        sessions: sessions.size,
        childPid: childTransport.pid,
      }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. Available: GET /sse, POST /messages, GET /health" }));
  });

  httpServer.listen(target.port, "127.0.0.1", () => {
    console.error(`[mcp-bridge:${target.name}] listening on http://127.0.0.1:${target.port}`);
    console.error(`  SSE endpoint:  http://127.0.0.1:${target.port}/sse`);
    console.error(`  Messages:      POST http://127.0.0.1:${target.port}/messages?sessionId=<id>`);
    console.error(`  Health:        http://127.0.0.1:${target.port}/health`);
  });

  // Best-effort session tracking for clean teardown. We don't keep a
  // registry of child transports because each served target owns exactly
  // one child over the lifetime of the bridge process; if the child
  // exits the bridge dies with a logged error and the orchestrator
  // restarts us. Spawning a fresh child per session (the alternative)
  // would defeat the bridge's startup-cost amortization.
  process.on("SIGTERM", async () => {
    httpServer.close();
    await client.close();
    process.exit(0);
  });
}

async function main() {
  const targets = parseTargets();
  if (targets.length === 0) {
    console.error("[mcp-bridge] No bridge targets configured; exiting.");
    process.exit(1);
  }
  // Spawn all targets in parallel. If any fails to start, log it and
  // carry on with the others — a single broken MCP shouldn't kill the
  // bridge for all the rest. The aggregator will mark the failed entry
  // reachable:false; the live ones will be aggregated.
  await Promise.allSettled(targets.map((t) => serveTarget(t)));
  console.error(`[mcp-bridge] All targets served.`);
}

main().catch((err) => {
  console.error("[mcp-bridge] Fatal startup error:", err);
  process.exit(1);
});

// Suppress the unused-import lint warning for the pathToFileURL import
// above — it's reserved for future ssh:// URI target support.
void pathToFileURL;
