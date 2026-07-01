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

export interface MCPServiceConfig {
  /** Service name (e.g., "conduit-mcp") */
  name: string;
  /** Service base URL (e.g., "http://localhost:3100") */
  baseUrl: string;
  /** Endpoint to fetch tool list (default: "/tools") */
  toolsEndpoint?: string;
  /** Endpoint to call a tool (default: "/tools/call") */
  callEndpoint?: string;
  /** Whether this service is required */
  required?: boolean;
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
  timestamp?: number;
}
