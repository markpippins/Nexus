/**
 * Nexus Terrain Topology Models
 *
 * Domain entities for infrastructure topology management.
 * Each model maps to a JPA @Entity in com.aibizarchitect.nexus.v1.spring.topology.entity.
 */
namespace com.aibizarchitect.nexus.v1.topology {

  // ========================================================================
  // ServiceType — maps to JPA ServiceType entity (table: service_types)
  // ========================================================================

  model ServiceType {
    /** Unique identifier (auto-generated) */
    id: int64;
    /** Display name — unique within this type */
    name: string;
  }

  model ServiceTypeCreate {
    name: string;
  }

  model ServiceTypeUpdate {
    name?: string;
  }

  // ========================================================================
  // Server — maps to JPA Server entity (table: servers)
  // ========================================================================

  model Server {
    id: int64;
    /** Server hostname — unique, not null */
    hostname: string;
    ipAddress?: string;
    /** Operating system identifier */
    os?: string;
    status?: string;
    activeFlag?: boolean = true;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    /** Whether this is an internal/private server */
    isInternal?: boolean = true;
  }

  model ServerCreate {
    hostname: string;
    ipAddress?: string;
    os?: string;
    status?: string;
    activeFlag?: boolean = true;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean = true;
  }

  model ServerUpdate {
    hostname?: string;
    ipAddress?: string;
    os?: string;
    status?: string;
    activeFlag?: boolean;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean;
  }

  // ========================================================================
  // McpServer — maps to JPA McpServer entity (table: mcp_servers)
  // ========================================================================

  model McpServer {
    id: int64;
    name: string;
    port?: int32;
    workspacePath?: string;
    /** FK to ServiceType */
    serviceTypeId?: int64;
    /** Resolved service type (read-only) */
    serviceType?: ServiceType;
    healthCheckUrl?: string;
    status?: string;
    transportType?: string;
    version?: string;
    @maxLength(1000)
    description?: string;
    repositoryUrl?: string;
    activeFlag?: boolean = true;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean = true;
  }

  model McpServerCreate {
    name: string;
    port?: int32;
    workspacePath?: string;
    serviceTypeId?: int64;
    healthCheckUrl?: string;
    status?: string;
    transportType?: string;
    version?: string;
    @maxLength(1000)
    description?: string;
    repositoryUrl?: string;
    activeFlag?: boolean = true;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean = true;
  }

  model McpServerUpdate {
    name?: string;
    port?: int32;
    workspacePath?: string;
    serviceTypeId?: int64;
    healthCheckUrl?: string;
    status?: string;
    transportType?: string;
    version?: string;
    @maxLength(1000)
    description?: string;
    repositoryUrl?: string;
    activeFlag?: boolean;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean;
  }

  // ========================================================================
  // RunnableService — maps to JPA RunnableService entity (table: runnable_services)
  // ========================================================================

  model RunnableService {
    id: int64;
    name: string;
    port?: int32;
    workspacePath?: string;
    /** FK to ServiceType */
    serviceTypeId?: int64;
    /** Resolved service type (read-only) */
    serviceType?: ServiceType;
    healthCheckUrl?: string;
    status?: string;
    version?: string;
    @maxLength(1000)
    description?: string;
    repositoryUrl?: string;
    activeFlag?: boolean = true;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean = true;
  }

  model RunnableServiceCreate {
    name: string;
    port?: int32;
    workspacePath?: string;
    serviceTypeId?: int64;
    healthCheckUrl?: string;
    status?: string;
    version?: string;
    @maxLength(1000)
    description?: string;
    repositoryUrl?: string;
    activeFlag?: boolean = true;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean = true;
  }

  model RunnableServiceUpdate {
    name?: string;
    port?: int32;
    workspacePath?: string;
    serviceTypeId?: int64;
    healthCheckUrl?: string;
    status?: string;
    version?: string;
    @maxLength(1000)
    description?: string;
    repositoryUrl?: string;
    activeFlag?: boolean;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean;
  }

  // ========================================================================
  // CliTool — maps to JPA CliTool entity (table: cli_tools)
  // ========================================================================

  model CliTool {
    id: int64;
    name: string;
    toolPath?: string;
    @maxLength(1000)
    description?: string;
    invocation?: string;
    language?: string;
    category?: string;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean = true;
    activeFlag?: boolean = true;
  }

  model CliToolCreate {
    name: string;
    toolPath?: string;
    @maxLength(1000)
    description?: string;
    invocation?: string;
    language?: string;
    category?: string;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean = true;
    activeFlag?: boolean = true;
  }

  model CliToolUpdate {
    name?: string;
    toolPath?: string;
    @maxLength(1000)
    description?: string;
    invocation?: string;
    language?: string;
    category?: string;
    startup?: string;
    startupScript?: string;
    buildCommand?: string;
    health?: string;
    sysUser?: string;
    sysPass?: string;
    @maxLength(1000)
    notes?: string;
    isInternal?: boolean;
    activeFlag?: boolean;
  }

  // ========================================================================
  // ServiceDependency — maps to JPA ServiceDependency entity (table: service_dependencies)
  // ========================================================================

  model ServiceDependency {
    id: int64;
    /** Polymorphic source type (e.g. "MCP_SERVER", "RUNNABLE_SERVICE") */
    sourceType: string;
    /** FK to the source entity */
    sourceId: int64;
    /** Polymorphic target type (e.g. "MCP_SERVER", "RUNNABLE_SERVICE") */
    targetType: string;
    /** FK to the target entity */
    targetId: int64;
    criticality?: string;
    @maxLength(1000)
    description?: string;
  }

  model ServiceDependencyCreate {
    sourceType: string;
    sourceId: int64;
    targetType: string;
    targetId: int64;
    criticality?: string;
    @maxLength(1000)
    description?: string;
  }

  model ServiceDependencyUpdate {
    sourceType?: string;
    sourceId?: int64;
    targetType?: string;
    targetId?: int64;
    criticality?: string;
    @maxLength(1000)
    description?: string;
  }

  // ========================================================================
  // BrokerProfile — maps to JPA BrokerProfile entity (table: broker_profiles)
  // ========================================================================

  model BrokerProfile {
    id: int64;
    /** External profile identifier — unique */
    profileId: string;
    name: string;
    brokerUrl?: string;
    imageUrl?: string;
    /** Whether to auto-connect on startup */
    autoConnect?: boolean = false;
    /** Health check interval in minutes */
    healthCheckDelayMinutes?: int32;
  }

  model BrokerProfileCreate {
    profileId: string;
    name: string;
    brokerUrl?: string;
    imageUrl?: string;
    autoConnect?: boolean = false;
    healthCheckDelayMinutes?: int32;
  }

  model BrokerProfileUpdate {
    profileId?: string;
    name?: string;
    brokerUrl?: string;
    imageUrl?: string;
    autoConnect?: boolean;
    healthCheckDelayMinutes?: int32;
  }

  // ========================================================================
  // RegistryServerProfile — maps to JPA RegistryServerProfile entity
  // (table: registry_server_profiles)
  // ========================================================================

  model RegistryServerProfile {
    id: int64;
    /** External profile identifier — unique */
    profileId: string;
    name: string;
    registryServerUrl?: string;
    imageUrl?: string;
    isActive?: boolean = false;
    /** Free-text description */
    description?: string;
  }

  model RegistryServerProfileCreate {
    profileId: string;
    name: string;
    registryServerUrl?: string;
    imageUrl?: string;
    isActive?: boolean = false;
    description?: string;
  }

  model RegistryServerProfileUpdate {
    profileId?: string;
    name?: string;
    registryServerUrl?: string;
    imageUrl?: string;
    isActive?: boolean;
    description?: string;
  }
}
