/**
 * Nexus Terrain Topology Operations
 *
 * Standard CRUD operations for all terrain entities.
 * Each resource follows the same pattern: list (paginated), get by ID, create, update, delete.
 */
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../../core/main.tsp";
import "./models.tsp";

using Http;
using Rest;

alias Topology = com.aibizarchitect.nexus.v1.topology;

namespace com.aibizarchitect.nexus.v1.topology {

  /** Pagination parameters for list operations */
  model PaginationParameters {
    @query page?: int32 = 0;
    @query size?: int32 = 20;
    @query sort?: string;
  }

  // ========================================================================
  // Service Type Operations
  // ========================================================================

  @route("/api/v1/service-types")
  @tag("Service Types")
  interface ServiceTypes {
    @doc("List all service types")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.ServiceType>;

    @doc("Get a service type by ID")
    @get get(@path id: int64): Topology.ServiceType;

    @doc("Create a new service type")
    @post create(@body resource: Topology.ServiceTypeCreate): Topology.ServiceType;

    @doc("Update a service type")
    @put update(@path id: int64, @body resource: Topology.ServiceTypeUpdate): Topology.ServiceType;

    @doc("Delete a service type")
    @delete delete(@path id: int64): void;
  }

  // ========================================================================
  // Server Operations
  // ========================================================================

  @route("/api/v1/servers")
  @tag("Servers")
  interface Servers {
    @doc("List all servers")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.Server>;

    @doc("Get a server by ID")
    @get get(@path id: int64): Topology.Server;

    @doc("Create a new server")
    @post create(@body resource: Topology.ServerCreate): Topology.Server;

    @doc("Update a server")
    @put update(@path id: int64, @body resource: Topology.ServerUpdate): Topology.Server;

    @doc("Delete a server")
    @delete delete(@path id: int64): void;
  }

  // ========================================================================
  // MCP Server Operations
  // ========================================================================

  @route("/api/v1/mcp-servers")
  @tag("MCP Servers")
  interface McpServers {
    @doc("List all MCP servers")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.McpServer>;

    @doc("Get an MCP server by ID")
    @get get(@path id: int64): Topology.McpServer;

    @doc("Create a new MCP server")
    @post create(@body resource: Topology.McpServerCreate): Topology.McpServer;

    @doc("Update an MCP server")
    @put update(@path id: int64, @body resource: Topology.McpServerUpdate): Topology.McpServer;

    @doc("Delete an MCP server")
    @delete delete(@path id: int64): void;
  }

  // ========================================================================
  // Runnable Service Operations
  // ========================================================================

  @route("/api/v1/runnable-services")
  @tag("Runnable Services")
  interface RunnableServices {
    @doc("List all runnable services")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.RunnableService>;

    @doc("Get a runnable service by ID")
    @get get(@path id: int64): Topology.RunnableService;

    @doc("Create a new runnable service")
    @post create(@body resource: Topology.RunnableServiceCreate): Topology.RunnableService;

    @doc("Update a runnable service")
    @put update(@path id: int64, @body resource: Topology.RunnableServiceUpdate): Topology.RunnableService;

    @doc("Delete a runnable service")
    @delete delete(@path id: int64): void;
  }

  // ========================================================================
  // CLI Tool Operations
  // ========================================================================

  @route("/api/v1/cli-tools")
  @tag("CLI Tools")
  interface CliTools {
    @doc("List all CLI tools")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.CliTool>;

    @doc("Get a CLI tool by ID")
    @get get(@path id: int64): Topology.CliTool;

    @doc("Create a new CLI tool")
    @post create(@body resource: Topology.CliToolCreate): Topology.CliTool;

    @doc("Update a CLI tool")
    @put update(@path id: int64, @body resource: Topology.CliToolUpdate): Topology.CliTool;

    @doc("Delete a CLI tool")
    @delete delete(@path id: int64): void;
  }

  // ========================================================================
  // Service Dependency Operations
  // ========================================================================

  @route("/api/v1/service-dependencies")
  @tag("Service Dependencies")
  interface ServiceDependencies {
    @doc("List all service dependencies")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.ServiceDependency>;

    @doc("Get a service dependency by ID")
    @get get(@path id: int64): Topology.ServiceDependency;

    @doc("List dependencies by source type and ID")
    @route("by-source")
    @get listBySource(
      @query sourceType: string,
      @query sourceId: int64
    ): Topology.ServiceDependency[];

    @doc("List dependencies by target type and ID")
    @route("by-target")
    @get listByTarget(
      @query targetType: string,
      @query targetId: int64
    ): Topology.ServiceDependency[];

    @doc("Create a new service dependency")
    @post create(@body resource: Topology.ServiceDependencyCreate): Topology.ServiceDependency;

    @doc("Update a service dependency")
    @put update(@path id: int64, @body resource: Topology.ServiceDependencyUpdate): Topology.ServiceDependency;

    @doc("Delete a service dependency")
    @delete delete(@path id: int64): void;
  }

  // ========================================================================
  // Broker Profile Operations
  // ========================================================================

  @route("/api/v1/broker-profiles")
  @tag("Broker Profiles")
  interface BrokerProfiles {
    @doc("List all broker profiles")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.BrokerProfile>;

    @doc("Get a broker profile by ID")
    @get get(@path id: int64): Topology.BrokerProfile;

    @doc("Create a new broker profile")
    @post create(@body resource: Topology.BrokerProfileCreate): Topology.BrokerProfile;

    @doc("Update a broker profile")
    @put update(@path id: int64, @body resource: Topology.BrokerProfileUpdate): Topology.BrokerProfile;

    @doc("Delete a broker profile")
    @delete delete(@path id: int64): void;
  }

  // ========================================================================
  // Registry Server Profile Operations
  // ========================================================================

  @route("/api/v1/registry-server-profiles")
  @tag("Registry Server Profiles")
  interface RegistryServerProfiles {
    @doc("List all registry server profiles")
    @get list(...PaginationParameters): com.aibizarchitect.nexus.v1.core.PagedResponse<Topology.RegistryServerProfile>;

    @doc("Get a registry server profile by ID")
    @get get(@path id: int64): Topology.RegistryServerProfile;

    @doc("Create a new registry server profile")
    @post create(@body resource: Topology.RegistryServerProfileCreate): Topology.RegistryServerProfile;

    @doc("Update a registry server profile")
    @put update(@path id: int64, @body resource: Topology.RegistryServerProfileUpdate): Topology.RegistryServerProfile;

    @doc("Delete a registry server profile")
    @delete delete(@path id: int64): void;
  }
}
