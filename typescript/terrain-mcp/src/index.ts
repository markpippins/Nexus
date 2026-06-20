import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { closePool } from "./db/client.js";

async function main() {
  const server = new McpServer({
    name: "terrain-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("terrain-mcp running on stdio (queries terrain PostgreSQL schema at localhost:5432/nexus)");
}

process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error starting terrain-mcp:", err);
  process.exit(1);
});
