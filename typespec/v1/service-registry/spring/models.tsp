/**
 * Nexus Lookup Service Models
 *
 * Domain entities for the service registry, reconciled with JVM JPA entities.
 * Each model maps to a JPA @Entity in com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.
 * FK relationships use object references matching @ManyToOne/@OneToMany JSON serialization.
 */

/**
 * Generic base entity fields shared across registries.
 */
namespace com.aibizarchitect.nexus.v1.core.lookups {

  model LookupBase {
    /** Unique identifier (auto-generated) */
    @visibility(Lifecycle.Read)
    id: int64;

    /** Display name — unique within the lookup type */
    @minLength(1)
    @maxLength(255)
    name: string;

    /** Whether this lookup value is active/available */
    activeFlag?: boolean = true;
  }

  model DescribedLookup extends LookupBase {
    /** Detailed description */
    @maxLength(1000)
    description?: string;
  }

  model LinkedLookup extends DescribedLookup {
    /** External URL (documentation, vendor site, etc.) */
    @format("url")
    url?: string;
  }
}

/**
 * Service Registry domain entities.
 * Each model matches the JSON serialization shape of the corresponding JPA entity.
 */
namespace com.aibizarchitect.nexus.v1.serviceregistry {

  // ========================================================================
  // Simple Lookups (id + name + activeFlag + audit fields)
  // ========================================================================

  model FrameworkVendor {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    @format("url")
    url?: string;
    activeFlag?: boolean = true;
  }

  model FrameworkLanguage {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    @format("url")
    url?: string;
    currentVersion?: string;
    ltsVersion?: string;
    activeFlag?: boolean = true;
  }

  model FrameworkType {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  model Framework {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    vendor: FrameworkVendor;
    category: FrameworkType;
    language: FrameworkLanguage;
    currentVersion?: string;
    ltsVersion?: string;
    @format("url")
    url?: string;
    supportsBrokerPattern?: boolean = false;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  model EnvironmentType {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  model ServerType {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  model OperatingSystem {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
  }

  model LibraryType {
    id: int64;
    name: string;
    @maxLength(500)
    description?: string;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  model Library {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    category?: LibraryType;
    language?: FrameworkLanguage;
    currentVersion?: string;
    packageName?: string;
    packageManager?: string;
    @format("url")
    url?: string;
    repositoryUrl?: string;
    license?: string;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  model ServiceType {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
    defaultComponent?: VisualComponent;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  model ServiceBackend {
    id: int64;
    name: string;
    activeFlag?: boolean = true;
  }

  model VisualComponent {
    id: int64;
    name: string;
  }

  // ========================================================================
  // Server — maps to JPA Server entity (table: servers)
  // ========================================================================

  model Server {
    id: int64;
    /** Server hostname */
    hostname: string;
    ipAddress: string;
    type: ServerType;
    environmentType: EnvironmentType;
    operatingSystem: OperatingSystem;
    cpuCores?: int32;
    memory?: string;
    disk?: string;
    status?: string;
    region?: string;
    cloudProvider?: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  // ========================================================================
  // Service — maps to JPA Service entity (table: services)
  // ========================================================================

  model Service {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    framework: Framework;
    type: ServiceType;
    componentOverride?: VisualComponent;
    parentService?: Service;
    defaultPort?: int32;
    apiBasePath?: string;
    @format("url")
    repositoryUrl?: string;
    version?: string;
    status?: string;
    /** Provenance of the catalog row — "seed" (V10 default/backfill) or "register" (runtime registration). T25 1.2 (R-A-2026-08-15-008). */
    origin?: "seed" | "register" = "seed";
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  // ========================================================================
  // Deployment — maps to JPA Deployment entity (table: deployments)
  // ========================================================================

  model Deployment {
    id: int64;
    /** FK: target service */
    service: Service;
    /** FK: deployment environment */
    environment: EnvironmentType;
    /** FK: target server */
    server: Server;
    version?: string;
    deployedAt?: utcDateTime;
    status?: string;
    port?: int32;
    contextPath?: string;
    @format("url")
    healthCheckUrl?: string;
    healthStatus?: string;
    lastHealthCheck?: utcDateTime;
    processId?: string;
    containerName?: string;
    deploymentPath?: string;
    startedAt?: utcDateTime;
    stoppedAt?: utcDateTime;
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  // ========================================================================
  // Supporting entities
  // ========================================================================

  model ServiceConfiguration {
    id: int64;
    key: string;
    value?: string;
  }

  model ServiceDependency {
    id: int64;
    name: string;
  }

  // ========================================================================
  // External Registration — maps to JVM dto.ExternalServiceRegistration
  // (POST /api/v1/registry/register, T25 1.2)
  // ========================================================================

  model HostedServiceInfo {
    serviceName: string;
    operations?: string[];
    framework?: string;
    status?: string;
    type?: string;
    endpoint?: string;
    healthCheck?: string;
  }

  model ExternalServiceRegistration {
    serviceName: string;
    operations?: string[];
    endpoint?: string;
    healthCheck?: string;
    metadata?: Record<unknown>;
    framework?: string;
    version?: string;
    port?: int32;
    dependencies?: string[];
    hostedServices?: HostedServiceInfo[];
    /** Plan 1291 bridge: optional server identity (serverId or hostname) */
    serverId?: int64;
    hostname?: string;
  }

  model RegistrationResponse {
    success: boolean;
    message: string;
    serviceName: string;
    serviceId: int64;
  }

  // ========================================================================
  // Create / Update DTOs
  // ========================================================================

  model FrameworkVendorCreate {
    name: string;
    @maxLength(1000)
    description?: string;
    @format("url")
    url?: string;
    activeFlag?: boolean = true;
  }

  model FrameworkVendorUpdate {
    id: int64;
    name?: string;
    @maxLength(1000)
    description?: string;
    @format("url")
    url?: string;
    activeFlag?: boolean;
  }

  model FrameworkTypeCreate {
    name: string;
    description?: string;
    activeFlag?: boolean = true;
  }

  model FrameworkTypeUpdate {
    id: int64;
    name?: string;
    description?: string;
    activeFlag?: boolean;
  }

  model FrameworkLanguageCreate {
    name: string;
    @maxLength(1000)
    description?: string;
    @format("url")
    url?: string;
    currentVersion?: string;
    ltsVersion?: string;
    activeFlag?: boolean;
  }

  model FrameworkLanguageUpdate {
    name: string;
    @maxLength(1000)
    description?: string;
    @format("url")
    url?: string;
    currentVersion?: string;
    ltsVersion?: string;
    activeFlag?: boolean;
  }
}
