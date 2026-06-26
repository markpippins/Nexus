import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const server = new McpServer({
    name: "peb-mcp",
    version: "1.0.0"
  });

  registerResources(server);
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("PEB MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting PEB MCP Server", err);
  process.exit(1);
});
