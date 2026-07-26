import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "terrain-mcp",
    version: "1.1.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("terrain-mcp running on stdio (REST proxy of terrain-srv @ http://localhost:3111)");
}

main().catch((err) => {
  console.error("Fatal error starting terrain-mcp:", err);
  process.exit(1);
});

// SIGINT/SIGTERM handlers removed: terrain-mcp owns no connection pool.
// The OS reaps the stdio transport on exit.
