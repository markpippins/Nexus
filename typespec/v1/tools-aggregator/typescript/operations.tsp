/**
 * tools-aggregator — TypeSpec Operations
 *
 * Reverse-engineered from typescript/tools-aggregator/src/index.ts.
 * Discovers MCP tools across services and exposes a unified REST surface for
 * listing and calling them. Dispatches to the underlying service by the
 * per-tool protocol (REST `/tools/call`, JSON-RPC `POST /`, or SSE).
 *
 * Convention (see typespec/v1/typescript-conventions.md):
 *   - one op per route
 *   - flat full-path `@route` decorators
 *   - Express `:param` mapped to TypeSpec `{param}`
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.toolsaggregator {

  // ========================================================================
  // Discovery lifecycle
  // ========================================================================

  @route("/init")
  @post
  @doc("Synchronously discover all MCP services and (re)build the tool registry.")
  op initialize(): InitResponse | ErrorResponse;

  @route("/registry")
  @get
  @doc("Return the full tool registry (services + tools grouped by service).")
  op registry(): RegistryResponse;

  // ========================================================================
  // Tool listing
  // ========================================================================

  @route("/tools")
  @get
  @doc("List all discovered tools across services.")
  op listTools(): ToolListResponse;

  @route("/tools/{name}")
  @get
  @doc("Get a specific tool definition by name.")
  op getTool(@path name: string): ToolDetail | ErrorResponse;

  @route("/tools/by-service/{service}")
  @get
  @doc("List all tools discovered from a specific service.")
  op toolsByService(@path service: string): ServiceToolsResponse | ErrorResponse;

  // ========================================================================
  // Tool invocation
  // ========================================================================

  @route("/tools/call")
  @post
  @doc("Call a tool on its underlying service, dispatching by the tool's discovered protocol.")
  op callTool(@body body: ToolCallRequest): ToolCallResponse;

  // ========================================================================
  // Health
  // ========================================================================

  @route("/health")
  @get
  @doc("Health check; reports discovery state and reachable service counts.")
  op health(): HealthResponse;
}
