import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "service-broker-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("service-broker-mcp running on stdio (proxies to service-broker at localhost:8080)");
}

main().catch((err) => {
  console.error("Fatal error starting service-broker-mcp:", err);
  process.exit(1);
});
