/**
 * Type contracts for the tools-aggregator.
 *
 * Single source of truth: `mcp-types` (nexus/typescript/mcp-types).
 * This file is a re-export shim so existing imports (`from "./types"`)
 * keep working after the extraction. Add aggregator-specific types below.
 */

export {
  InputSchemaProperty,
  InputSchema,
  MCPToolDefinition,
  MCPProtocol,
  MCPServiceConfig,
  ToolsResponse,
  AggregatedTool,
  ToolRegistry,
  ToolCallRequest,
  ToolCallResponse,
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolsListResult,
  McpToolCallResult,
} from "mcp-types";
