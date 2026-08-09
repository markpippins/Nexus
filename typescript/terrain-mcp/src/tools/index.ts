import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callTerrainJson } from "../db/client.js";

// ── Helper: search across mcp-servers and runnable-services by name ──
async function findServiceByName(name: string): Promise<any> {
  // Try MCP servers first
  try {
    const mcpData = await callTerrainJson<any>(`/mcp-servers`);
    const mcpList = mcpData.data ?? mcpData.mcpServers ?? mcpData;
    const mcpServers = Array.isArray(mcpList) ? mcpList : [];
    const mcpMatch = mcpServers.find((s: any) => s.name === name);
    if (mcpMatch) return { ...mcpMatch, type: "MCP Server" };
  } catch { /* continue */ }

  // Try runnable services
  try {
    const svcData = await callTerrainJson<any>(`/runnable-services`);
    const svcList = svcData.data ?? svcData.services ?? svcData;
    const svcServices = Array.isArray(svcList) ? svcList : [];
    const svcMatch = svcServices.find((s: any) => s.name === name);
    if (svcMatch) return { ...svcMatch, type: "Runnable Service" };
  } catch { /* continue */ }

  // Try servers (hosts)
  try {
    const srvData = await callTerrainJson<any>(`/servers`);
    const srvList = srvData.data ?? srvData.servers ?? srvData;
    const servers = Array.isArray(srvList) ? srvList : [];
    const srvMatch = servers.find((s: any) => s.hostname === name || s.name === name);
    if (srvMatch) return { ...srvMatch, type: "Server" };
  } catch { /* continue */ }

  return null;
}

export function registerTools(server: McpServer) {

  // ── SERVERS (hosts) ────────────────────────────────────────────────

  server.tool(
    "terrain_list_servers",
    "List all registered server hosts with their status, OS, and metadata.",
    {},
    async () => {
      const data = await callTerrainJson(`/servers`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── MCP SERVERS ────────────────────────────────────────────────────

  server.tool(
    "terrain_list_mcp_servers",
    "List all registered MCP servers with ports, transport type, status, and health check URLs.",
    {},
    async () => {
      const data = await callTerrainJson(`/mcp-servers`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "terrain_register_mcp_server",
    "Register or update an MCP server in the terrain topology. Creates if new, updates if name already exists.",
    {
      name: z.string().describe("MCP server name (e.g. 'vision-mcp')"),
      port: z.number().optional(),
      workspace_path: z.string().optional(),
      health_check_url: z.string().optional(),
      status: z.string().optional().describe("Status: ONLINE, OFFLINE, STARTING, ERROR"),
      transport_type: z.string().optional().describe("Transport: stdio, sse, streamable-http"),
      version: z.string().optional(),
      description: z.string().optional(),
      startup: z.string().optional(),
      health: z.string().optional(),
    },
    async (args) => {
      // Upsert: find by name → PUT if exists, POST if new
      const mcpData = await callTerrainJson<any>(`/mcp-servers`);
      const mcpList = mcpData.data ?? mcpData.mcpServers ?? mcpData;
      const mcpServers = Array.isArray(mcpList) ? mcpList : [];
      const existing = mcpServers.find((s: any) => s.name === args.name);

      const method = existing ? "PUT" : "POST";
      const path = existing ? `/mcp-servers/${existing.id}` : `/mcp-servers`;

      const data = await callTerrainJson(path, {
        method,
        body: JSON.stringify(existing ? { ...existing, ...args } : args),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── RUNNABLE SERVICES ──────────────────────────────────────────────

  server.tool(
    "terrain_list_runnable_services",
    "List all registered runnable services (Express, Bun, Spring Boot, UI apps, etc.) with ports, status, and health check URLs.",
    {},
    async () => {
      const data = await callTerrainJson(`/runnable-services`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "terrain_register_runnable_service",
    "Register or update a runnable service (Express, FastAPI, Spring Boot, UI app, etc.) in the terrain topology.",
    {
      name: z.string().describe("Service name (e.g. 'vision-srv')"),
      port: z.number().optional(),
      workspace_path: z.string().optional(),
      health_check_url: z.string().optional(),
      status: z.string().optional(),
      version: z.string().optional(),
      description: z.string().optional(),
      startup: z.string().optional(),
      health: z.string().optional(),
      service_type_id: z.number().optional().describe("Service type ID: 2=Microservice, 3=Express, 12=Python Service (default 3)"),
    },
    async (args) => {
      // Upsert: find by name → PUT if exists, POST if new
      const svcData = await callTerrainJson<any>(`/runnable-services`);
      const svcList = svcData.data ?? svcData.services ?? svcData;
      const svcServices = Array.isArray(svcList) ? svcList : [];
      const existing = svcServices.find((s: any) => s.name === args.name);

      const method = existing ? "PUT" : "POST";
      const path = existing ? `/runnable-services/${existing.id}` : `/runnable-services`;

      const data = await callTerrainJson(path, {
        method,
        body: JSON.stringify(existing ? { ...existing, ...args } : args),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CLI TOOLS ─────────────────────────────────────────────────────

  server.tool(
    "terrain_list_cli_tools",
    "List all registered CLI tools with language, category, invocation, and file path.",
    {},
    async () => {
      const data = await callTerrainJson(`/cli-tools`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "terrain_register_cli_tool",
    "Register or update a CLI tool / runnable script in the terrain topology. Creates if new, updates if name already exists.",
    {
      name: z.string().describe("Tool name (unique identifier, e.g. 'generate_docs')"),
      tool_path: z.string().optional(),
      description: z.string().optional(),
      invocation: z.string().optional(),
      language: z.string().optional(),
      category: z.string().optional(),
      notes: z.string().optional(),
      startup: z.string().optional(),
      health: z.string().optional(),
      startup_script: z.string().optional(),
      build_command: z.string().optional(),
    },
    async (args) => {
      const data = await callTerrainJson(`/cli-tools`, {
        method: "POST",
        body: JSON.stringify(args),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── SERVICE STATUS ─────────────────────────────────────────────────
  // Spring Boot terrain doesn't have a unified service lookup endpoint,
  // so we search across MCP servers, runnable services, and servers.

  server.tool(
    "terrain_get_service_status",
    "Look up the current status and details of any registered service by name. Checks MCP servers, runnable services, and servers tables.",
    {
      name: z.string().describe("Service name to look up (e.g. 'conduit-mcp', 'nebula-srv', 'PostgreSQL')"),
    },
    async (args) => {
      try {
        const match = await findServiceByName(args.name);
        if (!match) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Service "${args.name}" not found in terrain` }, null, 2) }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(match, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err?.message ?? String(err) }, null, 2) }] };
      }
    }
  );

  server.tool(
    "terrain_is_running",
    "Quickly check whether a named service or MCP server has ONLINE status. Returns true/false.",
    {
      name: z.string().describe("Service name (e.g. 'conduit-mcp', 'nebula-srv')"),
    },
    async (args) => {
      try {
        const match = await findServiceByName(args.name);
        const running = match?.status === "ONLINE";
        return { content: [{ type: "text" as const, text: JSON.stringify({ name: args.name, running, status: match?.status ?? "unknown" }, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ name: args.name, running: false, error: err?.message ?? String(err) }, null, 2) }] };
      }
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
      // Find which table the service is in, then update via the appropriate endpoint
      try {
        const mcpData = await callTerrainJson<any>(`/mcp-servers`);
        const mcpList = mcpData.data ?? mcpData.mcpServers ?? mcpData;
        const mcpServers = Array.isArray(mcpList) ? mcpList : [];
        const mcpMatch = mcpServers.find((s: any) => s.name === args.name);
        if (mcpMatch) {
          const data = await callTerrainJson(`/mcp-servers/${mcpMatch.id}`, {
            method: "PUT",
            body: JSON.stringify({ ...mcpMatch, status: args.status }),
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
        }

        const svcData = await callTerrainJson<any>(`/runnable-services`);
        const svcList = svcData.data ?? svcData.services ?? svcData;
        const svcServices = Array.isArray(svcList) ? svcList : [];
        const svcMatch = svcServices.find((s: any) => s.name === args.name);
        if (svcMatch) {
          const data = await callTerrainJson(`/runnable-services/${svcMatch.id}`, {
            method: "PUT",
            body: JSON.stringify({ ...svcMatch, status: args.status }),
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Service "${args.name}" not found in terrain` }, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err?.message ?? String(err) }, null, 2) }] };
      }
    }
  );

  // ── INFRASTRUCTURE SUMMARY ─────────────────────────────────────────

  server.tool(
    "terrain_infrastructure_summary",
    "Get a complete snapshot of all registered infrastructure — servers, MCP servers, runnable services, CLI tools, dependencies, and their status counts.",
    {},
    async () => {
      const data = await callTerrainJson(`/platform/health`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DEPENDENCIES ──────────────────────────────────────────────────

  server.tool(
    "terrain_list_dependencies",
    "List all service dependency relationships (which services depend on which other services).",
    {},
    async () => {
      const data = await callTerrainJson(`/service-dependencies`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
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
      description: z.string().optional(),
    },
    async (args) => {
      const data = await callTerrainJson(`/service-dependencies`, {
        method: "POST",
        body: JSON.stringify(args),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
