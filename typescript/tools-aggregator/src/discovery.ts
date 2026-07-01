import { MCPServiceConfig, ToolRegistry, AggregatedTool, ToolsResponse, MCPToolDefinition } from "./types";

const log = console.error; // Use stderr for logging

// ── Default Service Configuration ───────────────────────────────────

const DEFAULT_SERVICES: MCPServiceConfig[] = [
  {
    name: "conduit-mcp",
    baseUrl: process.env.CONDUIT_MCP_URL || "http://localhost:3100",
    required: true,
  },
  {
    name: "tackle-mcp",
    baseUrl: process.env.TACKLE_MCP_URL || "http://localhost:3101",
    required: true,
  },
  {
    name: "nebula-mcp",
    baseUrl: process.env.NEBULA_MCP_URL || "http://localhost:3102",
    required: false,
  },
  {
    name: "knowledge-mcp",
    baseUrl: process.env.KNOWLEDGE_MCP_URL || "http://localhost:3103",
    required: false,
  },
  {
    name: "terrain-mcp",
    baseUrl: process.env.TERRAIN_MCP_URL || "http://localhost:3104",
    required: false,
  },
  {
    name: "vision-mcp",
    baseUrl: process.env.VISION_MCP_URL || "http://localhost:3105",
    required: false,
  },
  {
    name: "peb-mcp",
    baseUrl: process.env.PEB_MCP_URL || "http://localhost:3106",
    required: false,
  },
  {
    name: "role-memory-srv",
    baseUrl: process.env.ROLE_MEMORY_URL || "http://localhost:3500",
    required: false,
  },
];

// ── Tool Registry Manager ─────────────────────────────────────────

export class ToolDiscovery {
  private registry: ToolRegistry;
  private services: MCPServiceConfig[];

  constructor(services?: MCPServiceConfig[]) {
    this.services = services || DEFAULT_SERVICES;
    this.registry = {
      tools: {},
      services: {},
      lastDiscovery: 0,
      totalTools: 0,
    };
  }

  /**
   * Discover all tools from all configured services
   */
  async discover(): Promise<ToolRegistry> {
    log(`[ToolDiscovery] Starting discovery of ${this.services.length} services...`);

    const results = await Promise.allSettled(
      this.services.map((service) => this.discoverService(service))
    );

    this.registry.tools = {};
    this.registry.services = {};
    this.registry.lastDiscovery = Date.now();

    let toolCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const service = this.services[i];

      if (result.status === "fulfilled") {
        const tools = result.value;
        const serviceKey = service.name;

        this.registry.services[serviceKey] = {
          reachable: true,
          lastUpdated: Date.now(),
          toolCount: tools.length,
        };

        for (const tool of tools) {
          this.registry.tools[tool.name] = tool;
          toolCount++;
        }

        log(`[ToolDiscovery] ${service.name}: ${tools.length} tools discovered`);
      } else {
        const serviceKey = service.name;
        this.registry.services[serviceKey] = {
          reachable: false,
          lastUpdated: Date.now(),
          toolCount: 0,
        };

        const isRequired = service.required || false;
        const level = isRequired ? "ERROR" : "WARN";
        log(
          `[ToolDiscovery] ${level}: ${service.name} unreachable at ${service.baseUrl}: ${result.reason.message}`
        );
      }
    }

    this.registry.totalTools = toolCount;
    log(`[ToolDiscovery] Discovery complete: ${toolCount} tools from ${this.services.length} services`);

    return this.registry;
  }

  /**
   * Discover tools from a single service
   */
  private async discoverService(service: MCPServiceConfig): Promise<AggregatedTool[]> {
    const toolsEndpoint = service.toolsEndpoint || "/tools";
    const url = `${service.baseUrl}${toolsEndpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as ToolsResponse;
      const tools = data.tools || [];

      return tools.map((tool: MCPToolDefinition) => ({
        ...tool,
        service: service.name,
        serviceUrl: service.baseUrl,
      }));
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Get the current tool registry
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): AggregatedTool | undefined {
    return this.registry.tools[name] as AggregatedTool | undefined;
  }

  /**
   * List all available tools
   */
  listTools(): AggregatedTool[] {
    return Object.values(this.registry.tools) as AggregatedTool[];
  }

  /**
   * Get tools grouped by service
   */
  groupByService(): Record<string, AggregatedTool[]> {
    const grouped: Record<string, AggregatedTool[]> = {};

    for (const tool of this.listTools()) {
      if (!grouped[tool.service]) {
        grouped[tool.service] = [];
      }
      grouped[tool.service].push(tool);
    }

    return grouped;
  }

  /**
   * Get service status
   */
  getServiceStatus(): Record<string, { reachable: boolean; toolCount: number }> {
    const status: Record<string, { reachable: boolean; toolCount: number }> = {};

    for (const [service, info] of Object.entries(this.registry.services)) {
      status[service] = {
        reachable: info.reachable,
        toolCount: info.toolCount,
      };
    }

    return status;
  }
}
