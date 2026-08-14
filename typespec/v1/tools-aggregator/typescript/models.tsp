/**
 * tools-aggregator — TypeSpec Models
 *
 * Reverse-engineered from typescript/tools-aggregator/src/index.ts.
 * Domain models for the unified tool-discovery + invocation surface. No route
 * or verb decorators live here; the reconciler scans this file and must find
 * none.
 */
namespace org.nexus.toolsaggregator {

  /** Wire protocol a tool is served over. */
  enum MCPProtocol {
    /** REST `/tools/call` surface. */
    rest,
    /** JSON-RPC `POST /` `tools/call` method. */
    jsonrpc,
    /** Server-Sent Events (stateful). */
    sse,
  }

  /** JSON-schema input specification for a tool. */
  model InputSchema {
    /** Schema type. */
    type: string;
    /** Schema properties. */
    properties: Record<unknown>;
    /** Required property names. */
    required?: string[];
  }

  /** A discovered tool's definition as listed by the aggregator. */
  model ToolEntry {
    /** Tool name. */
    name: string;
    /** Tool description. */
    description: string;
    /** Owning service name. */
    service: string;
    /** Input JSON schema. */
    inputSchema: InputSchema;
    /** Wire protocol. */
    protocol: MCPProtocol;
  }

  /** A tool definition including its service URL (GET /tools/{name}). */
  model ToolDetail {
    /** Tool name. */
    name: string;
    /** Tool description. */
    description: string;
    /** Owning service name. */
    service: string;
    /** Owning service base URL. */
    serviceUrl: string;
    /** Input JSON schema. */
    inputSchema: InputSchema;
    /** Wire protocol. */
    protocol: MCPProtocol;
  }

  // ── POST /init ──────────────────────────────────────────────────────

  /** Response body for POST /init. */
  model InitResponse {
    /** Always "initialized" on success. */
    status: string;
    /** Epoch millis at completion. */
    timestamp: int64;
    /** Registry summary. */
    registry: InitRegistrySummary;
  }

  /** Registry summary in the /init response. */
  model InitRegistrySummary {
    /** Total discovered tools. */
    totalTools: int32;
    /** Discovered services. */
    services: Record<unknown>;
    /** Tool count per service. */
    toolsByService: Record<int32>;
  }

  // ── GET /tools ──────────────────────────────────────────────────────

  /** Response body for GET /tools. */
  model ToolListResponse {
    /** Discovered tools. */
    tools: ToolEntry[];
    /** Total discovered tools. */
    total: int32;
  }

  // ── GET /tools/by-service/{service} ─────────────────────────────────

  /** Response body for GET /tools/by-service/{service}. */
  model ServiceToolsResponse {
    /** Service name. */
    service: string;
    /** Tools served by that service. */
    tools: ToolEntry[];
    /** Number of tools. */
    total: int32;
  }

  // ── POST /tools/call ────────────────────────────────────────────────

  /** Request body for POST /tools/call. */
  model ToolCallRequest {
    /** Tool name to invoke. */
    name: string;
    /** Tool arguments. */
    arguments: Record<unknown>;
  }

  /** Response body for POST /tools/call. */
  model ToolCallResponse {
    /** True when the tool call succeeded. */
    success: boolean;
    /** Normalized result payload (on success). */
    result?: unknown;
    /** Error message (on failure). */
    error?: string;
    /** Owning service name. */
    service: string;
    /** Tool name. */
    tool: string;
    /** Correlation request id. */
    requestId: string;
    /** Epoch millis. */
    timestamp: int64;
  }

  // ── GET /registry ───────────────────────────────────────────────────

  /** Response body for GET /registry. */
  model RegistryResponse {
    /** Last discovery epoch millis. */
    timestamp: int64;
    /** Total discovered tools. */
    totalTools: int32;
    /** Discovered services. */
    services: Record<unknown>;
    /** Tools grouped by service (name → { count, tools }). */
    toolsByService: Record<unknown>;
  }

  // ── GET /health ─────────────────────────────────────────────────────

  /** Response body for GET /health. */
  model HealthResponse {
    /** Discovery state: "ready" or "initializing". */
    status: string;
    /** Epoch millis. */
    timestamp: int64;
    /** Service reachability summary. */
    services: HealthServices;
    /** Tool count summary. */
    tools: HealthTools;
  }

  /** Service reachability summary in the /health response. */
  model HealthServices {
    /** Total known services. */
    total: int32;
    /** Reachable service count. */
    reachable: int32;
    /** Per-service status. */
    status: Record<unknown>;
  }

  /** Tool count summary in the /health response. */
  model HealthTools {
    /** Total discovered tools. */
    total: int32;
  }

  // ── Errors ──────────────────────────────────────────────────────────

  /** Error body returned for malformed requests or unknown tools/services. */
  model ErrorResponse {
    /** Human-readable error message. */
    error: string;
    /** Error code (e.g. TOOL_NOT_FOUND, SERVICE_NOT_FOUND, INVALID_REQUEST). */
    code?: string;
    /** Correlation request id (when known). */
    requestId?: string;
  }
}
