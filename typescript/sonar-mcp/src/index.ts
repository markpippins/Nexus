import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

// Minimal .env loader (conduit env_config.py pattern): reads KEY=VALUE
// pairs from .env next to this module. Needed because bridge-spawned
// children have no caller to export SONAR_TOKEN — the checkout's local
// .env (gitignored) is the credential surface. Never overrides real env.
function loadEnvFile(): void {
  try {
    const path = fileURLToPath(new URL("../.env", import.meta.url));
    const text = readFileSync(path, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const key = line.slice(0, line.indexOf("=")).trim();
      const val = line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* no .env — fine when SONAR_TOKEN comes from the real environment */
  }
}
loadEnvFile();

async function main() {
  const server = new McpServer({
    name: "sonar-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `sonar-mcp running on stdio (SonarQube web API @ ${process.env.SONAR_BASE_URL ?? "http://vanadium:9000"})`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting sonar-mcp:", err);
  process.exit(1);
});
