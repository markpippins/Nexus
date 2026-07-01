import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { ToolDiscovery } from "./discovery";
import { ToolCallRequest, ToolCallResponse } from "./types";

const PORT = process.env.TOOLS_AGGREGATOR_PORT || 3200;
const HOST = process.env.TOOLS_AGGREGATOR_HOST || "0.0.0.0";

const app = express();
app.use(cors());
app.use(express.json());

// Global tool discovery instance
const discovery = new ToolDiscovery();
let isInitialized = false;

// ── Middleware ──────────────────────────────────────────────────────

/**
 * Add request ID to all requests for tracing
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = String(req.headers["x-request-id"] || "") || uuidv4();
  res.setHeader("x-request-id", requestId);
  (req as any).requestId = requestId;
  next();
});

/**
 * Error handler
 */
interface ErrorWithStatus extends Error {
  status?: number;
  code?: string;
}

app.use((err: ErrorWithStatus, _req: Request, res: Response, _next: NextFunction) => {
  const headerVal = _req.headers["x-request-id"];
  const requestId = Array.isArray(headerVal) ? headerVal[0] : headerVal || "unknown";
  console.error(`[${requestId}] Error:`, err.message);

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    code: err.code || "INTERNAL_ERROR",
    requestId,
  });
});

// ── Endpoints ───────────────────────────────────────────────────────

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (_req: Request, res: Response) => {
  const serviceStatus = discovery.getServiceStatus();
  const reachableCount = Object.values(serviceStatus).filter((s) => s.reachable).length;
  const totalServices = Object.keys(serviceStatus).length;

  res.json({
    status: isInitialized ? "ready" : "initializing",
    timestamp: Date.now(),
    services: {
      total: totalServices,
      reachable: reachableCount,
      status: serviceStatus,
    },
    tools: {
      total: discovery.getRegistry().totalTools,
    },
  });
});

/**
 * POST /init
 * Initialize tool discovery (synchronously discover all services)
 */
app.post("/init", async (_req: Request, res: Response) => {
  console.error("[Tools Aggregator] Initializing tool discovery...");

  try {
    await discovery.discover();
    isInitialized = true;

    const registry = discovery.getRegistry();
    console.error(
      `[Tools Aggregator] Initialization complete: ${registry.totalTools} tools discovered`
    );

    res.json({
      status: "initialized",
      timestamp: Date.now(),
      registry: {
        totalTools: registry.totalTools,
        services: registry.services,
        toolsByService: Object.fromEntries(
          Object.entries(discovery.groupByService()).map(([service, tools]) => [
            service,
            tools.length,
          ])
        ),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: "initialization_failed",
      error: error.message,
    });
  }
});

/**
 * GET /tools
 * List all available tools
 */
app.get("/tools", (_req: Request, res: Response) => {
  const tools = discovery.listTools();

  res.json({
    tools: tools.map((t: any) => ({
      name: t.name,
      description: t.description,
      service: t.service,
      inputSchema: t.inputSchema,
    })),
    total: tools.length,
  });
});

/**
 * GET /tools/:name
 * Get a specific tool definition
 */
app.get("/tools/:name", (req: Request, res: Response) => {
  const tool = discovery.getTool(String(req.params.name));

  if (!tool) {
    return res.status(404).json({
      error: `Tool not found: ${req.params.name}`,
      code: "TOOL_NOT_FOUND",
    });
  }

  res.json({
    name: tool.name,
    description: tool.description,
    service: tool.service,
    serviceUrl: tool.serviceUrl,
    inputSchema: tool.inputSchema,
  });
});

/**
 * GET /tools/by-service/:service
 * Get all tools from a specific service
 */
app.get("/tools/by-service/:service", (req: Request, res: Response) => {
  const grouped = discovery.groupByService();
  const tools = grouped[String(req.params.service)];

  if (!tools) {
    return res.status(404).json({
      error: `Service not found: ${req.params.service}`,
      code: "SERVICE_NOT_FOUND",
    });
  }

  res.json({
    service: req.params.service,
    tools: tools.map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    total: tools.length,
  });
});

/**
 * POST /tools/call
 * Call a tool on its underlying service
 */
app.post("/tools/call", async (req: Request, res: Response) => {
  const requestId = (req as any).requestId;
  const { name, arguments: toolArgs } = req.body as ToolCallRequest;

  if (!name) {
    return res.status(400).json({
      error: "Tool name is required",
      code: "INVALID_REQUEST",
      requestId,
    });
  }

  const tool = discovery.getTool(name);

  if (!tool) {
    return res.status(404).json({
      error: `Tool not found: ${name}`,
      code: "TOOL_NOT_FOUND",
      requestId,
    });
  }

  try {
    const response = await callRemoteTool(tool.serviceUrl, name, toolArgs || {});

    res.json({
      success: true,
      result: response,
      service: tool.service,
      tool: name,
      requestId,
      timestamp: Date.now(),
    } as ToolCallResponse);
  } catch (error: any) {
    console.error(`[${requestId}] Tool call failed for ${name}:`, error.message);

    res.status(500).json({
      success: false,
      error: error.message || "Tool execution failed",
      service: tool.service,
      tool: name,
      requestId,
      timestamp: Date.now(),
    } as ToolCallResponse);
  }
});

/**
 * GET /registry
 * Get the full tool registry
 */
app.get("/registry", (_req: Request, res: Response) => {
  const registry = discovery.getRegistry();

  res.json({
    timestamp: registry.lastDiscovery,
    totalTools: registry.totalTools,
    services: registry.services,
    toolsByService: Object.fromEntries(
      Object.entries(discovery.groupByService()).map(([service, tools]: [string, any[]]) => [
        service,
        {
          count: tools.length,
          tools: tools.map((t: any) => t.name),
        },
      ])
    ),
  });
});

// ── Remote Tool Call Helper ─────────────────────────────────────────

/**
 * Call a tool on a remote MCP service
 */
async function callRemoteTool(
  serviceUrl: string,
  toolName: string,
  toolArgs: Record<string, any>
): Promise<any> {
  const endpoint = `${serviceUrl}/tools/call`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: toolName,
      arguments: toolArgs,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Remote service ${response.status}: ${text}`);
  }

  const data: any = await response.json();

  // Handle both error and success responses
  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

// ── Startup ─────────────────────────────────────────────────────────

async function start() {
  // Initial discovery on startup
  console.error("[Tools Aggregator] Starting up...");

  try {
    await discovery.discover();
    isInitialized = true;
  } catch (error: any) {
    console.error("[Tools Aggregator] Initial discovery failed (will retry on request):", error.message);
    // Continue anyway - will retry on /init or on-demand
  }

  app.listen(Number(PORT), HOST, () => {
    console.error(`[Tools Aggregator] Server running at http://${HOST}:${PORT}`);
    console.error(`[Tools Aggregator] Tools discovered: ${discovery.getRegistry().totalTools}`);
  });
}

start().catch((err) => {
  console.error("[Tools Aggregator] Startup failed:", err);
  process.exit(1);
});
