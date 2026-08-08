import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools/index.js";
import * as http from "http";
import { randomUUID } from "crypto";

const PORT = parseInt(process.env.NEBULA_MCP_PORT || "3102", 10);

process.on('uncaughtException', (err: any) => {
  if (err.code === 'EADDRINUSE') { console.error(`mcp-bridge: port ${PORT} already in use`); process.exit(1); }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') { return; }
  console.error('uncaughtException:', err.message);
});

async function main() {
  const server = new McpServer({
    name: "nebula-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  // Track active transports keyed by session ID
  const sessions = new Map<string, SSEServerTransport>();
  // Streamable HTTP transports (POST /) keyed by mcp-session-id
  const streamTransports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // CORS headers for cross-origin MCP clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      // SSE endpoint — client opens a long-lived connection here
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      sessions.set(sessionId, transport);

      req.socket.on("close", () => {
        sessions.delete(sessionId);
      });

      try {
        await server.connect(transport);
      } catch (err: any) {
        console.error(`[nebula-mcp-sse] Session ${sessionId} error:`, err);
        sessions.delete(sessionId);
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/messages") {
      // Client messages endpoint — the SSE transport reads from here
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active SSE session for sessionId" }));
        return;
      }

      const transport = sessions.get(sessionId)!;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        try {
          await transport.handlePostMessage(req, res, body);
        } catch (err: any) {
          console.error(`[nebula-mcp-sse] Handle message error:`, err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/") {
      // Streamable HTTP transport — single endpoint for all JSON-RPC.
      // Modern MCP clients (opencode remote, Claude Desktop) POST here;
      // responses are JSON (Accept: application/json) or SSE on the same
      // response (Accept: text/event-stream). Sessions via mcp-session-id.
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? streamTransports.get(sessionId) : undefined;

      if (!transport) {
        // One McpServer per session — the SDK's Protocol allows a single
        // connected transport per instance, so each Streamable HTTP session
        // gets its own server (registerTools is cheap). The transport's
        // sessionId is only assigned when the initialize request is processed,
        // so register the session in onsessioninitialized.
        const sessionServer = new McpServer({
          name: "nebula-mcp",
          version: "1.0.0",
        });
        registerTools(sessionServer);
        const created = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid: string) => {
            streamTransports.set(sid, created);
          },
        });
        created.onclose = () => {
          streamTransports.delete(created.sessionId!);
          sessionServer.close();
        };
        await sessionServer.connect(created);
        transport = created;
      }

      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: Invalid JSON" } }));
          return;
        }
        try {
          await transport!.handleRequest(req, res, parsed);
        } catch (err: any) {
          console.error(`[nebula-mcp-stream] Handle message error:`, err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        }
      });
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/") {
      // Terminate a Streamable HTTP session (MCP spec).
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? streamTransports.get(sessionId) : undefined;
      if (!transport) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active session for mcp-session-id" }));
        return;
      }
      await transport.handleRequest(req, res);
      streamTransports.delete(sessionId!);
      return;
    }

    // Health endpoint
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        service: "nebula-mcp",
        sessions: sessions.size,
        port: PORT,
      }));
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. Available: GET /sse, POST /messages, POST / (streamable HTTP), DELETE / (streamable HTTP), GET /health" }));
  });

  httpServer.listen(PORT, () => {
    console.error(`nebula-mcp SSE server listening on http://localhost:${PORT}`);
    console.error(`  SSE endpoint:    http://localhost:${PORT}/sse`);
    console.error(`  Messages:        POST http://localhost:${PORT}/messages?sessionId=<id>`);
    console.error(`  Health:          http://localhost:${PORT}/health`);
    console.error(`  Proxies to:      nebula-srv at localhost:3101`);
  });
}

main().catch((err) => {
  console.error("Fatal error starting nebula-mcp SSE server:", err);
  process.exit(1);
});
