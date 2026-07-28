import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "terrain-mcp",
    version: "1.2.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("terrain-mcp running on stdio (proxy of Spring Boot terrain @ http://localhost:8084/api/v1)");
}

main().catch((err) => {
  console.error("Fatal error starting terrain-mcp:", err);
  process.exit(1);
});

// SIGINT/SIGTERM handlers removed: terrain-mcp owns no connection pool.
// The OS reaps the stdio transport on exit.
