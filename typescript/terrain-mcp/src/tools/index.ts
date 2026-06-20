import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db/client.js";

export function registerTools(server: McpServer) {

  // ════════════════════════════════════════════════════════════════
  //  SERVERS (hosts)
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_list_servers",
    "List all registered server hosts with their status, OS, and metadata.",
    {},
    async () => {
      const rows = await query("SELECT id, hostname, ip_address, os, status, startup, notes, is_internal, active_flag FROM terrain.servers ORDER BY hostname");
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ servers: rows, count: rows.length }, null, 2) }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  MCP SERVERS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_list_mcp_servers",
    "List all registered MCP servers with ports, transport type, status, and health check URLs.",
    {},
    async () => {
      const rows = await query("SELECT id, name, port, workspace_path, health_check_url, status, transport_type, version, description, startup, health, is_internal FROM terrain.mcp_servers ORDER BY name");
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ mcpServers: rows, count: rows.length }, null, 2) }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  RUNNABLE SERVICES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_list_runnable_services",
    "List all registered runnable services (Express, Bun, Spring Boot, UI apps, etc.) with ports, status, and health check URLs.",
    {},
    async () => {
      const rows = await query(
        `SELECT rs.id, rs.name, rs.port, rs.workspace_path, rs.health_check_url, rs.status,
                rs.version, rs.description, rs.repository_url, rs.startup, rs.health, rs.is_internal,
                st.name AS service_type
         FROM terrain.runnable_services rs
         LEFT JOIN terrain.service_types st ON st.id = rs.service_type_id
         ORDER BY rs.name`
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ services: rows, count: rows.length }, null, 2) }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  CLI TOOLS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_list_cli_tools",
    "List all registered CLI tools with language, category, invocation, and file path.",
    {},
    async () => {
      const rows = await query(
        "SELECT id, name, tool_path, description, invocation, language, category, notes, is_internal FROM terrain.cli_tools ORDER BY name"
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ cliTools: rows, count: rows.length }, null, 2) }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  SERVICE STATUS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_get_service_status",
    "Look up the current status and details of any registered service by name. Checks MCP servers, runnable services, and servers tables.",
    {
      name: z.string().describe("Service name to look up (e.g. 'conduit-mcp', 'nebula-srv', 'PostgreSQL')"),
    },
    async (args) => {
      const mcp = await query(
        "SELECT id, name, port, status, health_check_url, startup, description FROM terrain.mcp_servers WHERE name = $1",
        [args.name]
      );
      if (mcp.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ type: "MCP Server", ...mcp[0] }, null, 2) }] };
      }

      const svc = await query(
        `SELECT rs.id, rs.name, rs.port, rs.status, rs.health_check_url, rs.startup, rs.description, st.name AS service_type
         FROM terrain.runnable_services rs
         LEFT JOIN terrain.service_types st ON st.id = rs.service_type_id
         WHERE rs.name = $1`,
        [args.name]
      );
      if (svc.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ type: "Runnable Service", ...svc[0] }, null, 2) }] };
      }

      const host = await query(
        "SELECT id, hostname AS name, ip_address, os, status, notes FROM terrain.servers WHERE hostname = $1",
        [args.name]
      );
      if (host.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ type: "Server", ...host[0] }, null, 2) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Service "${args.name}" not found in any terrain table` }, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  IS RUNNING (quick boolean check)
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_is_running",
    "Quickly check whether a named service or MCP server has ONLINE status. Returns true/false.",
    {
      name: z.string().describe("Service name (e.g. 'conduit-mcp', 'nebula-srv')"),
    },
    async (args) => {
      const mcp = await query(
        "SELECT status FROM terrain.mcp_servers WHERE name = $1 AND status = 'ONLINE'",
        [args.name]
      );
      if (mcp.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ name: args.name, running: true, source: "MCP Server" }, null, 2) }] };
      }

      const svc = await query(
        "SELECT status FROM terrain.runnable_services WHERE name = $1 AND status = 'ONLINE'",
        [args.name]
      );
      if (svc.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ name: args.name, running: true, source: "Runnable Service" }, null, 2) }] };
      }

      // Check if it exists but is offline
      const exists = await query(
        `SELECT id, name, 'MCP Server' AS source, status FROM terrain.mcp_servers WHERE name = $1
         UNION ALL
         SELECT id, name, 'Runnable Service' AS source, status FROM terrain.runnable_services WHERE name = $1`,
        [args.name]
      );
      if (exists.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ name: args.name, running: false, status: exists[0].status, source: exists[0].source }, null, 2) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ name: args.name, running: false, error: "not found in terrain" }, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  INFRASTRUCTURE SUMMARY
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_infrastructure_summary",
    "Get a complete snapshot of all registered infrastructure — servers, MCP servers, runnable services, CLI tools, and their status counts.",
    {},
    async () => {
      const [mcpCount, svcCount, srvCount, toolCount, onlineMcp, onlineSvc, offlineSvc] = await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM terrain.mcp_servers"),
        query("SELECT COUNT(*)::int AS count FROM terrain.runnable_services"),
        query("SELECT COUNT(*)::int AS count FROM terrain.servers"),
        query("SELECT COUNT(*)::int AS count FROM terrain.cli_tools"),
        query("SELECT COUNT(*)::int AS count FROM terrain.mcp_servers WHERE status = 'ONLINE'"),
        query("SELECT COUNT(*)::int AS count FROM terrain.runnable_services WHERE status = 'ONLINE'"),
        query("SELECT COUNT(*)::int AS count FROM terrain.runnable_services WHERE status = 'OFFLINE'"),
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            servers: srvCount[0].count,
            mcpServers: { total: mcpCount[0].count, online: onlineMcp[0].count },
            runnableServices: { total: svcCount[0].count, online: onlineSvc[0].count, offline: offlineSvc[0].count },
            cliTools: toolCount[0].count,
          }, null, 2),
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  SERVICE DEPENDENCIES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_list_dependencies",
    "List all service dependency relationships (which services depend on which other services).",
    {},
    async () => {
      const rows = await query(
        "SELECT id, source_type, source_id, target_type, target_id, criticality, description FROM terrain.service_dependencies ORDER BY source_type, source_id"
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ dependencies: rows, count: rows.length }, null, 2) }],
      };
    }
  );
}
