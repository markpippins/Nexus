/**
 * Service Mesh Models
 * 
 * Comprehensive interfaces for service mesh visualization and management.
 * Based on the Host Server API data model.
 */

// ============================================================================
// Framework Models
// ============================================================================

export type FrameworkCategory =
  | 'JAVA_SPRING'
  | 'JAVA_QUARKUS'
  | 'JAVA_MICRONAUT'
  | 'JAVA_HELIDON'
  | 'NODE_NESTJS'
  | 'NODE_ADONISJS'
  | 'NODE_MOLECULER'
  | 'NODE_EXPRESS'
  | 'PYTHON_DJANGO'
  | 'PYTHON_FLASK'
  | 'PYTHON_FASTAPI'
  | 'DOTNET_ASPNET'
  | 'GO_GIN'
  | 'GO_FIBER'
  | 'RUST_ACTIX'
  | 'OTHER';

export interface FrameworkLanguage {
  id: string;
  name: string;
  description?: string;
}

export interface FrameworkCategoryEntity {
  id: string;
  name: string; // This corresponds to the FrameworkCategory (string union) values potentially
  description?: string;
}

export interface ServiceTypeEntity {
  id: string;
  name: string; // This corresponds to ServiceType (string union) values potentially
  description?: string;
  defaultComponentId?: number;
}

export interface Framework {
  id: string;
  name: string;
  description?: string;
  category: FrameworkCategoryEntity;
  language: FrameworkLanguage;
  currentVersion?: string;
  ltsVersion?: string;
  url?: string;
  // Keep legacy fields optional to avoid breaking other parts potentially
  latestVersion?: string;
  documentationUrl?: string;
  supportsBrokerPattern?: boolean;
}

// ============================================================================
// Service Models
// ============================================================================

export type ServiceType =
  | 'REST_API'
  | 'GRAPHQL_API'
  | 'GRPC_SERVICE'
  | 'MESSAGE_QUEUE'
  | 'DATABASE'
  | 'CACHE'
  | 'GATEWAY'
  | 'PROXY'
  | 'WEB_APP'
  | 'BACKGROUND_JOB';

export type ServiceStatus = 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED' | 'PLANNED';

export interface ServiceInstance {
  id: string;
  name: string;
  description?: string;
  framework: Framework;
  type: ServiceTypeEntity;
  defaultPort: number;
  healthCheckPath?: string;
  apiBasePath?: string;
  status: ServiceStatus;
  version?: string;
  repositoryUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  componentOverrideId?: number;
  parentServiceId?: number;
  // componentOverride?: VisualComponent; // If we want the full object
}

/**
 * Represents a service hosted/embedded within a parent gateway service.
 * These are services that run inside the same JVM as the gateway.
 */
export interface HostedService {
  serviceName: string;
  operations: string[];
  framework?: string;
  status?: string;
  type?: 'embedded' | 'standalone';
  endpoint?: string;
  healthCheck?: string;
}

/**
 * Extended service interface that includes hosted/embedded services.
 * Used for displaying the service mesh hierarchy.
 */
export interface ServiceWithHosted {
  id: number;
  name: string;
  description?: string;
  status: string;
  endpoint?: string;
  defaultPort?: number;
  version?: string;
  framework?: string;
  operations?: string;
  lastHeartbeat?: string;
  hostedServices?: HostedService[];
}

// ============================================================================
// Server Models
// ============================================================================

export type ServerType = 'PHYSICAL' | 'VIRTUAL' | 'CONTAINER' | 'CLOUD';

export type ServerEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'TEST';

export type ServerStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';

export interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  type: ServerType;
  environment: ServerEnvironment;
  operatingSystem?: string;
  cpuCores?: number;
  memoryMb?: number;
  diskGb?: number;
  region?: string;
  cloudProvider?: string;
  status: ServerStatus;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// Deployment Models
// ============================================================================

export type DeploymentStatus =
  | 'RUNNING'
  | 'STOPPED'
  | 'STARTING'
  | 'STOPPING'
  | 'FAILED'
  | 'UNKNOWN';

export type HealthStatus = 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'UNKNOWN';

export interface Deployment {
  id: string;
  service: ServiceInstance;
  server: Server;
  port: number;
  version: string;
  status: DeploymentStatus;
  environment: ServerEnvironment;
  healthCheckUrl?: string;
  healthStatus: HealthStatus;
  deploymentPath?: string;
  startedAt?: string;
  lastHealthCheck?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// Configuration Models
// ============================================================================

export type ConfigEnvironment = 'ALL' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'TEST';

export type ConfigType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'JSON'
  | 'URL'
  | 'DATABASE_URL'
  | 'API_KEY';

export interface ServiceConfiguration {
  id: string;
  service: { id: string };
  configKey: string;
  configValue: string;
  environment: ConfigEnvironment;
  type: ConfigType;
  isSecret: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// Dependency Models
// ============================================================================

export interface ServiceDependency {
  sourceServiceId: string;
  targetServiceId: string;
  sourceService: ServiceInstance;
  targetService: ServiceInstance;
  dependencyType?: 'REQUIRED' | 'OPTIONAL';
}

// ============================================================================
// Library Models (Compile-Time Dependencies)
// ============================================================================

export interface LibraryCategory {
  id: number;
  name: string;
  description?: string;
  activeFlag?: boolean;
}

export interface Library {
  id: number;
  name: string;
  description?: string;
  category?: LibraryCategory;
  language?: FrameworkLanguage;
  currentVersion?: string;
  packageName?: string;
  packageManager?: string;
  url?: string;
  repositoryUrl?: string;
  license?: string;
  activeFlag?: boolean;
}

export type DependencyScope = 'COMPILE' | 'RUNTIME' | 'TEST' | 'PROVIDED' | 'OPTIONAL';

export interface ServiceLibrary {
  id: number;
  serviceId: number;
  libraryId: number;
  service?: ServiceInstance;
  library?: Library;
  version: string;
  versionConstraint?: string;
  scope?: DependencyScope;
  isDirect?: boolean;
  isDevDependency?: boolean;
  notes?: string;
  activeFlag?: boolean;
}

// ============================================================================
// Metrics & Monitoring Models
// ============================================================================

export interface ServiceMetrics {
  serviceId: string;
  timestamp: Date;
  requestsPerSecond?: number;
  averageResponseTimeMs?: number;
  errorRate?: number;
  activeConnections?: number;
  memoryUsageMb?: number;
  cpuUsagePercent?: number;
}

export interface ServiceUpdate {
  type: 'STATUS_CHANGE' | 'HEALTH_CHANGE' | 'DEPLOYMENT_CHANGE' | 'CONFIG_CHANGE';
  hostProfileId: string;
  serviceId: string;
  deploymentId?: string;
  previousValue?: string;
  newValue: string;
  timestamp: Date;
  metrics?: ServiceMetrics;
}

// ============================================================================
// View Models (for UI components)
// ============================================================================

export interface ServiceMeshSummary {
  totalServices: number;
  activeServices: number;
  healthyDeployments: number;
  unhealthyDeployments: number;
  totalServers: number;
  activeServers: number;
  frameworkBreakdown: { framework: string; count: number }[];
  environmentBreakdown: { environment: ServerEnvironment; count: number }[];
}

export interface FrameworkGroup {
  framework: Framework;
  services: ServiceInstance[];
  deployments: Deployment[];
  healthySummary: { healthy: number; unhealthy: number; unknown: number };
}

export interface ServiceTreeNode {
  id: string;
  name: string;
  type: 'framework' | 'service' | 'deployment' | 'server';
  icon: string;
  status?: HealthStatus | DeploymentStatus | ServiceStatus | ServerStatus;
  children?: ServiceTreeNode[];
  metadata: Record<string, unknown>;
  isExpanded?: boolean;
}

// ============================================================================
// Operation Models
// ============================================================================

export type ServiceOperation =
  | 'start'
  | 'stop'
  | 'restart'
  | 'health-check'
  | 'view-logs'
  | 'view-config';

export interface OperationRequest {
  deploymentId: string;
  operation: ServiceOperation;
  params?: Record<string, unknown>;
}

export interface OperationResult {
  success: boolean;
  operation: ServiceOperation;
  deploymentId: string;
  message?: string;
  data?: unknown;
  timestamp: Date;
}

// ============================================================================
// Graph Visualization Models (for D3.js)
// ============================================================================

export interface GraphNode {
  id: string;
  name: string;
  type: 'service' | 'server' | 'framework';
  status: HealthStatus;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: GraphNode | string;
  target: GraphNode | string;
  type: 'dependency' | 'deployment';
}

export interface ServiceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ============================================================================
// Utility Types
// ============================================================================

export function getHealthStatusColor(status: HealthStatus): string {
  switch (status) {
    case 'HEALTHY': return 'var(--color-success, #22c55e)';
    case 'UNHEALTHY': return 'var(--color-error, #ef4444)';
    case 'DEGRADED': return 'var(--color-warning, #f59e0b)';
    case 'UNKNOWN': return 'var(--color-muted, #6b7280)';
  }
}

export function getDeploymentStatusColor(status: DeploymentStatus): string {
  switch (status) {
    case 'RUNNING': return 'var(--color-success, #22c55e)';
    case 'STOPPED': return 'var(--color-muted, #6b7280)';
    case 'STARTING':
    case 'STOPPING': return 'var(--color-warning, #f59e0b)';
    case 'FAILED': return 'var(--color-error, #ef4444)';
    case 'UNKNOWN': return 'var(--color-muted, #6b7280)';
  }
}

export function getFrameworkIcon(category: FrameworkCategory | string): string {
  switch (category) {
    case 'JAVA_SPRING':
    case 'JAVA_QUARKUS':
    case 'JAVA_MICRONAUT':
    case 'JAVA_HELIDON':
      return 'coffee';
    case 'NODE_NESTJS':
    case 'NODE_ADONISJS':
    case 'NODE_MOLECULER':
    case 'NODE_EXPRESS':
      return 'hexagon';
    case 'PYTHON_DJANGO':
    case 'PYTHON_FLASK':
    case 'PYTHON_FASTAPI':
      return 'code';
    case 'DOTNET_ASPNET':
      return 'window';
    case 'GO_GIN':
    case 'GO_FIBER':
      return 'zap';
    case 'RUST_ACTIX':
      return 'settings';
    default:
      return 'box';
  }
}
