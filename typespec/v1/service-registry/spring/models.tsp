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

  model FrameworkCategory {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
  }

  model Framework {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    vendor: FrameworkVendor;
    category: FrameworkCategory;
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
    activeFlag?: boolean = true;
  }

  model OperatingSystem {
    id: int64;
    name: string;
    @maxLength(1000)
    description?: string;
    activeFlag?: boolean = true;
  }

  model LibraryCategory {
    id: int64;
    name: string;
    activeFlag?: boolean = true;
  }

  model Library {
    id: int64;
    name: string;
    version?: string;
    activeFlag?: boolean = true;
  }

  model ServiceType {
    id: int64;
    name: string;
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
  // Host — maps to JPA Host entity (table: servers)
  // ========================================================================

  model Host {
    id: int64;
    /** Server hostname (maps to JPA hostname field, serialized as "hostname") */
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
    activeFlag?: boolean = true;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

  // ========================================================================
  // Deployment — maps to JPA Deployment entity (table: deployments)
  // Uses object references for FK relationships matching JPA JSON serialization.
  // ========================================================================

  model Deployment {
    id: int64;
    /** FK: target service */
    service: Service;
    /** FK: deployment environment */
    environment: EnvironmentType;
    /** FK: target server/host */
    server: Host;
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

  model ServiceLibrary {
    id: int64;
    name: string;
    version?: string;
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

  model FrameworkCategoryCreate {
    name: string;
    activeFlag?: boolean = true;
  }

  model FrameworkCategoryUpdate {
    id: int64;
    name?: string;
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
