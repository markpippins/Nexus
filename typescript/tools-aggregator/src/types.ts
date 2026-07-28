// ── Tool Definition Types ──────────────────────────────────────────

export interface InputSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: any;
  items?: Record<string, any>;
  properties?: Record<string, InputSchemaProperty>;
  required?: string[];
  [key: string]: any;
}

export interface InputSchema {
  type: "object";
  properties: Record<string, InputSchemaProperty>;
  required?: string[];
  [key: string]: any;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: InputSchema;
}

// ── Service Registration ────────────────────────────────────────────

/**
 * Protocol the underlying MCP service speaks for tool-discovery and tool-calls.
 *
 * - `rest`:    GET /tools returns { tools: [...] }; POST /tools/call with
 *              { name, arguments } invokes a tool. Used by conduit-mcp.
 * - `jsonrpc`: POST / with { "jsonrpc":"2.0","method":"tools/list" } returns
 *              { result: { tools: [...] } }; POST / with
 *              { "method":"tools/call","params":{ "name","arguments" } } invokes.
 *              Used by tackle-mcp.
 * - `sse`:     MCP-over-SSE transport (long-lived `GET /sse` stream + separate
 *              `POST /messages?sessionId=<id>` channel for inbound JSON-RPC).
 *              Responses arrive asynchronously on the open SSE stream as
 *              `event: message / data: {jsonrpc envelope}`. Used by
 *              nebula-mcp-sse (:3102) and service-broker-mcp (:3112) today,
 *              and by the generic stdio→SSE `mcp-bridge` wrapper that fronts
 *              knowledge-mcp / vision-mcp / peb-mcp / terrain-mcp.
 * - `auto`:    Try `rest` first; on 404 or non-JSON response, fall back to
 *              `jsonrpc`. The default; keeps startup resilient when an MCP
 *              migrates protocols under us. Note: `sse` is never tried under
 *              `auto` — it requires explicit opt-in because its persistent
 *              connection cost differs from the stateless REST/JSON-RPC path.
 */
export type MCPProtocol = "rest" | "jsonrpc" | "sse" | "auto";

export interface MCPServiceConfig {
  /** Service name (e.g., "conduit-mcp") */
  name: string;
  /** Service base URL (e.g., "http://localhost:3100") */
  baseUrl: string;
  /** Endpoint to fetch tool list (default: "/tools") — used for `rest` protocol */
  toolsEndpoint?: string;
  /** Endpoint to call a tool (default: "/tools/call") — used for `rest` protocol */
  callEndpoint?: string;
  /** Whether this service is required */
  required?: boolean;
  /** Discovery/call protocol this MCP speaks (default: "auto") */
  protocol?: MCPProtocol;
}

// ── Tool Discovery Response ─────────────────────────────────────────

export interface ToolsResponse {
  tools: MCPToolDefinition[];
}

// ── Aggregated Tool Entry ───────────────────────────────────────────

export interface AggregatedTool extends MCPToolDefinition {
  /** Which service this tool comes from */
  service: string;
  /** Service URL for routing tool calls */
  serviceUrl: string;
  /**
   * Discovery protocol that worked for this service.
   * Stored per-tool so callRemoteTool can route to the same protocol the
   * tool was discovered through, avoiding cross-protocol mismatches if an
   * MCP ever exposed both endpoints.
   */
  protocol: Extract<MCPProtocol, "rest" | "jsonrpc" | "sse">;
}

// ── Tool Registry ───────────────────────────────────────────────────

export interface ToolRegistry {
  /** All discovered tools, keyed by tool name */
  tools: Record<string, AggregatedTool>;
  /** Service status: which ones are reachable */
  services: Record<string, { reachable: boolean; lastUpdated: number; toolCount: number }>;
  /** Timestamp of last discovery */
  lastDiscovery: number;
  /** Total number of tools across all services */
  totalTools: number;
}

// ── Tool Call Request/Response ──────────────────────────────────────

export interface ToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolCallResponse {
  success: boolean;
  result?: any;
  error?: string;
  service?: string;
  tool?: string;
  requestId?: string;
  timestamp?: number;
}

// ── JSON-RPC envelope types (for `jsonrpc` protocol MCPs) ───────────

/**
 * JSON-RPC 2.0 request envelope. Used by the `jsonrpc` protocol adapter
 * when talking to MCPs like tackle-mcp, knowledge-mcp, vision-mcp.
 *
 *   method = "tools/list"  → params = {}                                   → returns { result: { tools: [...] } }
 *   method = "tools/call"  → params = { name, arguments }                  → returns { result: { content: [{ type, text }] } }
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse<T = any> {
  jsonrpc: "2.0";
  id?: number | string;
  result?: T;
  error?: { code: number; message: string; data?: any };
}

/**
 * MCP tool-list result envelope. Returned inside JsonRpcResponse.result.
 */
export interface McpToolsListResult {
  tools: MCPToolDefinition[];
}

/**
 * MCP tool-call result envelope. The server's result wraps an array of
 * `content` blocks; for textual tools the first block is `{ type:"text", text: <string> }`.
 * We surface that text up to the aggregator's REST API so callers don't
 * need to know JSON-RPC was used end-to-end.
 */
export interface McpToolCallResult {
  content: Array<{ type: string; text?: string; [k: string]: any }>;
  isError?: boolean;
}
