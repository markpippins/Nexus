import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { ToolDiscovery } from "./discovery";
import { ToolCallRequest, ToolCallResponse, AggregatedTool, JsonRpcRequest, JsonRpcResponse, McpToolCallResult, MCPProtocol } from "./types";
import { commandToolDefinitions, handleCommandToolCall, type CommandDispatch } from "./command-router";
import { listCommands, searchCommands } from "./command-registry";

const PORT = process.env.TOOLS_AGGREGATOR_PORT || 3210;
const HOST = process.env.TOOLS_AGGREGATOR_HOST || "127.0.0.1";

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`tools-aggregator: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[tools-aggregator] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[tools-aggregator] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

const app = express();
app.use(cors());
app.use(express.json());

// Global tool discovery instance
const discovery = new ToolDiscovery();
let isInitialized = false;

// Command-router namespace (folded in from slash-command-mcp, D-2026-08-16-002):
// the 3 DSL tools are served natively — registered in the registry under the
// synthetic service "command-router" and dispatched in-process via the
// aggregator's own registry (single hop, no :3220).
const COMMAND_ROUTER_SERVICE = "command-router";

function registerCommandRouter(): void {
  for (const tool of commandToolDefinitions) {
    discovery.registerNativeTool({
      ...tool,
      service: COMMAND_ROUTER_SERVICE,
      serviceUrl: "local://command-router",
      protocol: "local" as const,
    } as unknown as AggregatedTool);
  }
}

// Dispatch a resolved command through the aggregator's own registry — the
// same single-hop path /tools/call uses, so a DSL execution never opens a
// second client connection.
const commandDispatch: CommandDispatch = async (command, args) => {
  const tool = discovery.getTool(command);
  if (!tool) {
    return { success: false, error: `Tool not found: ${command}` };
  }
  try {
    const result = await callRemoteTool(tool, command, args);
    return { success: true, result, service: tool.service, tool: command };
  } catch (error: any) {
    return { success: false, error: error.message || "Tool execution failed" };
  }
};

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
      protocol: t.protocol,
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
    protocol: (tool as any).protocol,
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

  // Native command-router tools are dispatched in-process (no remote hop).
  if (tool.protocol === "local") {
    try {
      const result = await handleCommandToolCall(name, toolArgs || {}, commandDispatch);
      return res.json({
        success: true,
        result,
        service: COMMAND_ROUTER_SERVICE,
        tool: name,
        requestId,
        timestamp: Date.now(),
      } as ToolCallResponse);
    } catch (error: any) {
      console.error(`[${requestId}] Command-router call failed for ${name}:`, error.message);
      return res.status(500).json({
        success: false,
        error: error.message || "Tool execution failed",
        service: COMMAND_ROUTER_SERVICE,
        tool: name,
        requestId,
        timestamp: Date.now(),
      } as ToolCallResponse);
    }
  }

  try {
    const response = await callRemoteTool(tool, name, toolArgs || {});

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

// ── Command-router REST namespace (/commands/*) ────────────────────
//
// Direct clients (slash bars, CLIs) may use this namespace instead of the
// native MCP tools. Each route mirrors one of the command_* tools:
//   GET  /commands/services        → list services (mirrors completions stage=service)
//   GET  /commands/:service/commands   → list commands for a service
//   GET  /commands/:service/:command   → describe one command
//   POST /commands/execute         → parse + coerce + dispatch a DSL line
//   GET  /commands/completions     → completions for a partial DSL string

app.get("/commands/services", async (_req: Request, res: Response) => {
  try {
    const r = await handleCommandToolCall("command_completions", { partial: "" }, commandDispatch);
    res.json({ services: r.result?.services || [], total: (r.result?.services || []).length });
  } catch (error: any) {
    res.status(500).json({ error: error.message, code: "REGISTRY_ERROR" });
  }
});

app.get("/commands/search/:prefix", async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const matches = await searchCommands(String(req.params.prefix), limit);
    res.json({ commands: matches, total: matches.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message, code: "REGISTRY_ERROR" });
  }
});

app.get("/commands/resolve/:command", async (req: Request, res: Response) => {
  const r = await handleCommandToolCall(
    "command_lookup",
    { command: String(req.params.command) },
    commandDispatch
  );
  if (r.isError) {
    const code = r.result?.code;
    if (code === "AMBIGUOUS_COMMAND") {
      const m = String(r.result?.error || "").match(/exists on multiple services: (.+)\./);
      return res.json({ matches: m ? m[1].split(", ") : [] });
    }
    return res.json({ row: null, matches: [] });
  }
  res.json({ row: r.result?.command || null, matches: [] });
});

app.get("/commands/:service/commands", async (req: Request, res: Response) => {
  try {
    const rows = await listCommands(String(req.params.service));
    res.json({ service: req.params.service, commands: rows, total: rows.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message, code: "REGISTRY_ERROR" });
  }
});

app.get("/commands/:service/:command", async (req: Request, res: Response) => {
  const r = await handleCommandToolCall(
    "command_lookup",
    { command: `${req.params.service} ${req.params.command}` },
    commandDispatch
  );
  if (r.isError) {
    return res.status(404).json({ error: r.result?.error, code: r.result?.code });
  }
  res.json({ command: r.result?.command });
});

app.post("/commands/execute", async (req: Request, res: Response) => {
  // Two shapes accepted:
  //   { command: "<raw DSL line>" }                          → parsed + coerced here
  //   { command: "<tool name>", args: {...} }                → pre-parsed/coerced (slash adapter)
  const { command, args, allowExtra } = req.body || {};
  let r;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    // Pre-parsed path: dispatch the tool directly through the registry.
    const resp = await commandDispatch(String(command), args);
    r = {
      isError: !resp.success,
      result: resp.success
        ? { dispatch: { success: true, service: resp.service, tool: resp.tool }, result: resp.result }
        : { error: resp.error },
    };
  } else {
    r = await handleCommandToolCall(
      "command_execute",
      { command, allowExtra },
      commandDispatch
    );
  }
  if (r.isError) {
    return res.status(400).json({ error: r.result?.error, code: r.result?.code });
  }
  res.json(r.result);
});

app.get("/commands/completions", async (req: Request, res: Response) => {
  const partial = String(req.query.partial || "");
  const limit = Number(req.query.limit) || 20;
  const r = await handleCommandToolCall("command_completions", { partial, limit }, commandDispatch);
  if (r.isError) {
    return res.status(400).json({ error: r.result?.error, code: r.result?.code });
  }
  res.json(r.result);
});

// ── Remote Tool Call Helper ─────────────────────────────────────────

/**
 * Call a tool on a remote MCP service. Dispatches by the protocol the
 * tool was discovered with — REST (`/tools/call`) vs JSON-RPC (`POST /`,
 * `tools/call` method). The protocol is stored per-tool in the registry,
 * so the caller doesn't have to know.
 *
 * Both protocols surface a normalized `result` payload so callers above
 * (the aggregator's REST API for downstream clients, the python
 * tools_aggregator_client, the operator-svc dispatcher) don't need to
 * care which underlying transport was used.
 */
async function callRemoteTool(
  tool: AggregatedTool,
  toolName: string,
  toolArgs: Record<string, any>
): Promise<any> {
  const protocol: MCPProtocol = tool.protocol;

  if (protocol === "local") {
    // Native command-router tools are intercepted in the /tools/call
    // handler before reaching here; this branch is defensive only.
    throw new Error(`Tool ${toolName} is a native command-router tool; call it via /tools/call directly`);
  }
  if (protocol === "rest") {
    return callRemoteToolRest(tool.serviceUrl, toolName, toolArgs);
  }
  if (protocol === "sse") {
    // SSE is stateful — delegate to the discovery class which owns the
    // persistent session pool keyed by service name. We reconstruct a
    // minimal service config from the tool record so lookup-by-name works
    // even when DEFAULT_SERVICES has been overridden at construction time.
    return discovery.sseCallTool(
      { name: tool.service, baseUrl: tool.serviceUrl, protocol: "sse" },
      toolName,
      toolArgs
    );
  }
  return callRemoteToolJsonRpc(tool.serviceUrl, toolName, toolArgs);
}

/**
 * REST-shaped MCP call. conduit-mcp exposes this surface.
 *
 *   POST <baseUrl>/tools/call with body { name, arguments }
 *   → 200 with { success, result, ... } OR { error, ... }
 */
async function callRemoteToolRest(
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

  // Handle both error-shaped and success-shaped responses.
  if (data.error) {
    throw new Error(typeof data.error === "string" ? data.error : (data.error.message ?? JSON.stringify(data.error)));
  }

  // Some MCP-REST adapters wrap results in { result, success }; others
  // return the raw envelope. Surface the meaningful payload either way.
  if (data.result !== undefined) return data.result;
  return data;
}

/**
 * JSON-RPC MCP call. tackle-mcp (and knowledge-mcp / vision-mcp when
 * brought up) expose this surface.
 *
 *   POST <baseUrl>/ with body
 *     { "jsonrpc":"2.0","id":<n>,"method":"tools/call","params":{ "name", "arguments" } }
 *   → 200 with JsonRpcResponse<McpToolCallResult>
 *
 * The MCP tool-call result is `{ content: [{ type:"text", text: <string> }] }`.
 * We unwrap that: if there's one text block (the common case), return the
 * text. If there are multiple blocks or non-text content, return the raw
 * content array so callers can format downstream.
 */
let _rpcCallIdCounter = 1;

async function callRemoteToolJsonRpc(
  serviceUrl: string,
  toolName: string,
  toolArgs: Record<string, any>
): Promise<any> {
  const url = `${serviceUrl}/`;
  const id = _rpcCallIdCounter++;
  const envelope: JsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: toolName, arguments: toolArgs },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Remote service ${response.status}: ${text}`);
  }

  const data = (await response.json()) as JsonRpcResponse<McpToolCallResult>;

  if (data.error) {
    throw new Error(`JSON-RPC error ${data.error.code}: ${data.error.message}`);
  }

  const result = data.result;
  if (!result) return null;

  // isError:true is the MCP signal for "tool returned an error result"
  // (server-level success but the tool itself errored — e.g. bad args).
  if (result.isError) {
    const text = result.content?.find((c) => c.type === "text")?.text ?? "Tool call returned an error";
    throw new Error(text);
  }

  const blocks = result.content || [];
  if (blocks.length === 1 && blocks[0].type === "text") {
    const text = blocks[0].text ?? "";
    // Try to pass parsed JSON through if the tool returned JSON-as-text
    // (the common MCP convention) — fall back to the raw string.
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  // Mixed content (image + text, multiple blocks, etc.) — return as-is so
  // the caller can format it for its consumer.
  return blocks;
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

  registerCommandRouter();

  const server = app.listen(Number(PORT), HOST, () => {
    console.error(`[Tools Aggregator] Server running at http://${HOST}:${PORT}`);
    console.error(`[Tools Aggregator] Tools discovered: ${discovery.getRegistry().totalTools}`);
    console.error(`[Tools Aggregator] Command-router namespace registered: ${commandToolDefinitions.length} native tools (${COMMAND_ROUTER_SERVICE})`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`tools-aggregator: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('tools-aggregator: listen error:', err.message);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("[Tools Aggregator] Startup failed:", err);
  process.exit(1);
});
