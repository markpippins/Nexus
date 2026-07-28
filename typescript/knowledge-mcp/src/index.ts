import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "knowledge-mcp",
    version: "1.1.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("knowledge-mcp running on stdio (REST proxy of knowledge-srv @ http://localhost:3109)");
}

main().catch((err) => {
  console.error("Fatal error starting knowledge-mcp:", err);
  process.exit(1);
});

// SIGINT/SIGTERM handling removed: knowledge-mcp has no connection pool to close.
// The OS will reap the stdio transport on exit.
