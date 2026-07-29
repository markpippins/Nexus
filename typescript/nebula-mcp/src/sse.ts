import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerTools } from "./tools/index.js";
import * as http from "http";

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
    res.end(JSON.stringify({ error: "Not found. Available: GET /sse, POST /messages, GET /health" }));
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
