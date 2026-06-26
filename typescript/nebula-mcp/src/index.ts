import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "nebula-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("nebula-mcp running on stdio (proxies to nebula-srv at localhost:3101)");
}

main().catch((err) => {
  console.error("Fatal error starting nebula-mcp:", err);
  process.exit(1);
});
