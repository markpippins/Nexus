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
    "Get a complete snapshot of all registered infrastructure — servers, MCP servers, runnable services, CLI tools, dependencies, and their status counts.",
    {},
    async () => {
      const [mcpCount, svcCount, srvCount, toolCount, onlineMcp, onlineSvc, offlineSvc, depCount, depRows] = await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM terrain.mcp_servers"),
        query("SELECT COUNT(*)::int AS count FROM terrain.runnable_services"),
        query("SELECT COUNT(*)::int AS count FROM terrain.servers"),
        query("SELECT COUNT(*)::int AS count FROM terrain.cli_tools"),
        query("SELECT COUNT(*)::int AS count FROM terrain.mcp_servers WHERE status = 'ONLINE'"),
        query("SELECT COUNT(*)::int AS count FROM terrain.runnable_services WHERE status = 'ONLINE'"),
        query("SELECT COUNT(*)::int AS count FROM terrain.runnable_services WHERE status = 'OFFLINE'"),
        query("SELECT COUNT(*)::int AS count FROM terrain.service_dependencies"),
        query(
          `SELECT sd.id, sd.source_type,
                  COALESCE(ms.name, rs_src.name) AS source_name,
                  sd.target_type,
                  COALESCE(rs.name, ms_tgt.name) AS target_name,
                  sd.criticality, sd.description
           FROM terrain.service_dependencies sd
           LEFT JOIN terrain.mcp_servers ms ON sd.source_type = 'mcp_server' AND sd.source_id = ms.id
           LEFT JOIN terrain.runnable_services rs_src ON sd.source_type = 'runnable_service' AND sd.source_id = rs_src.id
           LEFT JOIN terrain.runnable_services rs ON sd.target_type = 'runnable_service' AND sd.target_id = rs.id
           LEFT JOIN terrain.mcp_servers ms_tgt ON sd.target_type = 'mcp_server' AND sd.target_id = ms_tgt.id
           ORDER BY sd.source_type, sd.source_name`
        ),
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            servers: srvCount[0].count,
            mcpServers: { total: mcpCount[0].count, online: onlineMcp[0].count },
            runnableServices: { total: svcCount[0].count, online: onlineSvc[0].count, offline: offlineSvc[0].count },
            cliTools: toolCount[0].count,
            dependencies: { total: depCount[0].count, edges: depRows },
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

  // ════════════════════════════════════════════════════════════════
  //  REGISTRATION TOOLS (write)
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "terrain_register_mcp_server",
    "Register or update an MCP server in the terrain topology. Creates if new, updates if name already exists.",
    {
      name: z.string().describe("MCP server name (e.g. 'vision-mcp')"),
      port: z.number().optional().describe("Port if applicable (stdio MCP servers may omit)"),
      workspace_path: z.string().optional().describe("Filesystem path to the project root"),
      health_check_url: z.string().optional().describe("Health check URL"),
      status: z.string().optional().describe("Status: ONLINE, OFFLINE, STARTING, ERROR"),
      transport_type: z.string().optional().describe("Transport: stdio, sse, streamable-http"),
      version: z.string().optional().describe("Version string"),
      description: z.string().optional().describe("Human-readable description"),
      startup: z.string().optional().describe("Startup command"),
      health: z.string().optional().describe("Health check command or note"),
    },
    async (args) => {
      // Service type ID 1 = MCP
      const existing = await query(
        "SELECT id FROM terrain.mcp_servers WHERE name = $1", [args.name]
      );
      let row: any;
      if (existing.length > 0) {
        const id = existing[0].id;
        const sets: string[] = [];
        const vals: any[] = [];
        let i = 1;
        const fields: (keyof typeof args)[] = ["port", "workspace_path", "health_check_url", "status", "transport_type", "version", "description", "startup", "health"];
        for (const f of fields) {
          if (args[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push(args[f]); }
        }
        if (sets.length > 0) {
          vals.push(id);
          const result = await query(
            `UPDATE terrain.mcp_servers SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
            vals
          );
          row = result[0];
        } else {
          row = existing[0];
        }
      } else {
        const cols = ["name", "service_type_id"];
        const placeholders = ["$1", "$2"];
        const vals: any[] = [args.name, 1];
        let i = 3;
        const fields: (keyof typeof args)[] = ["port", "workspace_path", "health_check_url", "status", "transport_type", "version", "description", "startup", "health"];
        for (const f of fields) {
          if (args[f] !== undefined) { cols.push(f); placeholders.push(`$${i++}`); vals.push(args[f]); }
        }
        const result = await query(
          `INSERT INTO terrain.mcp_servers (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
          vals
        );
        row = result[0];
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ registered: row, action: existing.length > 0 ? "updated" : "created" }, null, 2) }],
      };
    }
  );

  server.tool(
    "terrain_register_runnable_service",
    "Register or update a runnable service (Express, FastAPI, Spring Boot, UI app, etc.) in the terrain topology.",
    {
      name: z.string().describe("Service name (e.g. 'vision-srv')"),
      port: z.number().optional().describe("Port number"),
      workspace_path: z.string().optional().describe("Filesystem path to the project root"),
      health_check_url: z.string().optional().describe("Health check URL"),
      status: z.string().optional().describe("Status: ONLINE, OFFLINE, STARTING, ERROR"),
      version: z.string().optional().describe("Version string"),
      description: z.string().optional().describe("Human-readable description"),
      startup: z.string().optional().describe("Startup command"),
      health: z.string().optional().describe("Health check command or note"),
      service_type_id: z.number().optional().describe("Service type ID: 2=Microservice, 3=Express, 12=Python Service (default 3)"),
    },
    async (args) => {
      const existing = await query(
        "SELECT id FROM terrain.runnable_services WHERE name = $1", [args.name]
      );
      let row: any;
      if (existing.length > 0) {
        const id = existing[0].id;
        const sets: string[] = [];
        const vals: any[] = [];
        let i = 1;
        const fields: (keyof typeof args)[] = ["port", "workspace_path", "health_check_url", "status", "version", "description", "startup", "health", "service_type_id"];
        for (const f of fields) {
          if (args[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push(args[f]); }
        }
        if (sets.length > 0) {
          vals.push(id);
          const result = await query(
            `UPDATE terrain.runnable_services SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
            vals
          );
          row = result[0];
        } else {
          row = existing[0];
        }
      } else {
        const cols = ["name", "service_type_id"];
        const placeholders = ["$1", "$2"];
        const serviceTypeId = args.service_type_id ?? 3; // defaults to Express (3)
        const vals: any[] = [args.name, serviceTypeId];
        let i = 3;
        const fields: (keyof typeof args)[] = ["port", "workspace_path", "health_check_url", "status", "version", "description", "startup", "health"];
        for (const f of fields) {
          if (args[f] !== undefined) { cols.push(f); placeholders.push(`$${i++}`); vals.push(args[f]); }
        }
        const result = await query(
          `INSERT INTO terrain.runnable_services (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
          vals
        );
        row = result[0];
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ registered: row, action: existing.length > 0 ? "updated" : "created" }, null, 2) }],
      };
    }
  );

  server.tool(
    "terrain_register_dependency",
    "Register a dependency relationship between two services (e.g., MCP server depends on a runnable service). Upserts by source+target pair.",
    {
      source_type: z.enum(["mcp_server", "runnable_service"]).describe("Source service type"),
      source_name: z.string().min(1).describe("Source service name (must exist in mcp_servers or runnable_services)"),
      target_type: z.enum(["mcp_server", "runnable_service"]).describe("Target service type"),
      target_name: z.string().min(1).describe("Target service name (must exist in mcp_servers or runnable_services)"),
      criticality: z.string().optional().describe("Dependency criticality: critical, high, medium, low (default 'medium')"),
      description: z.string().optional().describe("Human-readable description of the dependency"),
    },
    async (args) => {
      // Resolve source ID
      const sourceRows = await query(
        args.source_type === "mcp_server"
          ? "SELECT id FROM terrain.mcp_servers WHERE name = $1"
          : "SELECT id FROM terrain.runnable_services WHERE name = $1",
        [args.source_name]
      );
      if (sourceRows.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Source service "${args.source_name}" not found in terrain.${args.source_type === "mcp_server" ? "mcp_servers" : "runnable_services"}` }, null, 2) }] };
      }
      const source_id = sourceRows[0].id;

      // Resolve target ID
      const targetRows = await query(
        args.target_type === "mcp_server"
          ? "SELECT id FROM terrain.mcp_servers WHERE name = $1"
          : "SELECT id FROM terrain.runnable_services WHERE name = $1",
        [args.target_name]
      );
      if (targetRows.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Target service "${args.target_name}" not found in terrain.${args.target_type === "mcp_server" ? "mcp_servers" : "runnable_services"}` }, null, 2) }] };
      }
      const target_id = targetRows[0].id;

      // Upsert: check if dependency already exists
      const existing = await query(
        "SELECT id FROM terrain.service_dependencies WHERE source_type = $1 AND source_id = $2 AND target_type = $3 AND target_id = $4",
        [args.source_type, source_id, args.target_type, target_id]
      );

      let row: any;
      let action: string;
      if (existing.length > 0) {
        const sets: string[] = [];
        const vals: any[] = [];
        let i = 1;
        if (args.criticality !== undefined) { sets.push(`criticality = $${i++}`); vals.push(args.criticality); }
        if (args.description !== undefined) { sets.push(`description = $${i++}`); vals.push(args.description); }
        if (sets.length > 0) {
          vals.push(existing[0].id);
          const result = await query(
            `UPDATE terrain.service_dependencies SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
            vals
          );
          row = result[0];
        } else {
          row = existing[0];
        }
        action = "updated";
      } else {
        const result = await query(
          `INSERT INTO terrain.service_dependencies (source_type, source_id, target_type, target_id, criticality, description)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [args.source_type, source_id, args.target_type, target_id, args.criticality ?? "medium", args.description ?? null]
        );
        row = result[0];
        action = "created";
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            dependency: {
              id: row.id,
              source_type: row.source_type,
              source_name: args.source_name,
              source_id: row.source_id,
              target_type: row.target_type,
              target_name: args.target_name,
              target_id: row.target_id,
              criticality: row.criticality,
              description: row.description,
            },
            action,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "terrain_set_service_status",
    "Update the status of any registered service (MCP server or runnable service) by name.",
    {
      name: z.string().describe("Service name"),
      status: z.string().describe("New status: ONLINE, OFFLINE, STARTING, ERROR"),
    },
    async (args) => {
      let mcp = await query(
        "UPDATE terrain.mcp_servers SET status = $1 WHERE name = $2 RETURNING id, name, status",
        [args.status, args.name]
      );
      if (mcp.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ type: "MCP Server", ...mcp[0] }, null, 2) }] };
      }
      let svc = await query(
        "UPDATE terrain.runnable_services SET status = $1 WHERE name = $2 RETURNING id, name, status",
        [args.status, args.name]
      );
      if (svc.length > 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ type: "Runnable Service", ...svc[0] }, null, 2) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Service "${args.name}" not found in any terrain table` }, null, 2) }] };
    }
  );
}
