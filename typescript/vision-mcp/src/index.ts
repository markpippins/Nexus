import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "vision-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("vision-mcp running on stdio (proxies to vision-srv at localhost:3103)");
}

main().catch((err) => {
  console.error("Fatal error starting vision-mcp:", err);
  process.exit(1);
});
