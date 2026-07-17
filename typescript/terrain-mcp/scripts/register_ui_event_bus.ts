/**
 * One-shot registration script for ui-event-bus.
 *
 * Spawns terrain-mcp over stdio (its only transport), then invokes
 * `terrain_register_runnable_service` to upsert ui-event-bus into
 * the terrain.runnable_services table. Verifies by listing runnable
 * services afterward.
 *
 * Usage: cd nexus/typescript/terrain-mcp && npx tsx scripts/register_ui_event_bus.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVICE_NAME = "ui-event-bus";
const SERVICE_PORT = 3200;
const WORKSPACE = "/home/codex/dev/nexus/typescript/ui-event-bus";
const TERRAIN_MCP_DIR = "/home/codex/dev/nexus/typescript/terrain-mcp";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
    cwd: TERRAIN_MCP_DIR,
  });

  const client = new Client(
    { name: "register-ui-event-bus", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);

  try {
    console.log("── Calling terrain_register_runnable_service ──");
    const regResult = await client.callTool({
      name: "terrain_register_runnable_service",
      arguments: {
        name: SERVICE_NAME,
        port: SERVICE_PORT,
        workspace_path: WORKSPACE,
        health_check_url: `http://localhost:${SERVICE_PORT}/health`,
        status: "ONLINE",
        version: "1.0.0",
        description:
          "SSE event bus for cross-application UI communication in Nexus",
        startup: "npx tsx watch src/index.ts",
        health: `curl http://localhost:${SERVICE_PORT}/health`,
        service_type_id: 3, // Express
      },
    });
    console.log(JSON.stringify(regResult, null, 2));

    console.log("\n── Listing runnable services for verification ──");
    const listResult = await client.callTool({
      name: "terrain_list_runnable_services",
      arguments: {},
    });
    const parsed = JSON.parse(
      (listResult.content as Array<{ text: string }>)[0].text
    );
    const uiRow = parsed.services.find(
      (s: { name: string }) => s.name === SERVICE_NAME
    );
    console.log(
      uiRow
        ? `✓ ${SERVICE_NAME} registered (id=${uiRow.id}, status=${uiRow.status}, port=${uiRow.port})`
        : `✗ ${SERVICE_NAME} NOT FOUND in runnable_services list`
    );
    console.log(
      `Total runnable services registered: ${parsed.count}`
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
