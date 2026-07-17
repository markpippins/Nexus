import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerTools } from "./tools/index.js";
import * as http from "http";

const PORT = parseInt(process.env.SERVICE_BROKER_MCP_PORT || "3108", 10);

async function main() {
  const server = new McpServer({
    name: "service-broker-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      await server.connect(transport);
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "service-broker-mcp", port: PORT }));
    }
  });

  httpServer.listen(PORT, () => {
    console.error(`service-broker-mcp SSE server listening on http://localhost:${PORT}`);
    console.error(`  SSE endpoint:    http://localhost:${PORT}/sse`);
    console.error(`  Messages:        POST http://localhost:${PORT}/messages?sessionId=<id>`);
    console.error(`  Health:          http://localhost:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error("Fatal error starting service-broker-mcp:", err);
  process.exit(1);
});
