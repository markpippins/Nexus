/**
 * Platform Operations Dashboard - Core Data Contracts & Interfaces
 */

export type ThemeMode = 'dark' | 'light' | 'steel';

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'offline';

export type Environment = 'production' | 'staging' | 'development' | 'qa';

export interface Service {
  id: string;
  name: string;
  type: string;
  version: string;
  status: HealthStatus;
  systemId: string;
  systemName: string;
  endpoint: string;
  environment: Environment;
  hostedServicesCount: number;
  hostedServices: string[];
  frameworkId?: string;
  frameworkName?: string;
  serverId?: string;
  serverHostname?: string;
  lastHeartbeat: string;
  uptimePercent: number;
  rps: number;
  latencyMs: number;
  errorRate: number;
  description?: string;
}

export interface Server {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  serverType: string;
  operatingSystem: string;
  environment: Environment;
  status: HealthStatus;
  cpuUsage: number; // percentage
  memoryUsage: number; // percentage
  diskUsage: number; // percentage
  datacenterRegion: string;
  activePodsCount: number;
  lastPing: string;
}

export interface Deployment {
  id: string;
  serviceId: string;
  serviceName: string;
  environment: Environment;
  version: string;
  status: HealthStatus;
  deployedAt: string;
  deployedBy: string;
  replicasReady: number;
  replicasTarget: number;
  commitHash: string;
  clusterName: string;
}

export interface Framework {
  id: string;
  name: string;
  category: string;
  language: string;
  version: string;
  servicesCount?: number;
}

export interface Library {
  id: string;
  name: string;
  category: string;
  language: string;
  version: string;
  vulnerabilitiesCount: number;
}

export interface System {
  id: string;
  name: string;
  description: string;
  owner: string;
  environment: Environment;
  status: HealthStatus;
  servicesCount: number;
  services: string[]; // List of service names
  tier: 'Tier 1 - Critical' | 'Tier 2 - Important' | 'Tier 3 - Standard';
}

export type LookupType =
  | 'server-types'
  | 'environments'
  | 'operating-systems'
  | 'service-types'
  | 'framework-categories'
  | 'framework-languages'
  | 'library-categories'
  | 'library-languages';

export interface LookupEntry {
  id: string;
  lookupType: LookupType;
  key: string;
  name: string;
  description?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  serviceName?: string;
  serverId?: string;
  traceId?: string;
}

export interface MetricPoint {
  timestamp: string;
  timeLabel: string;
  cpu: number;
  memory: number;
  latency: number;
  errorRate: number;
  rps: number;
}

export interface EntitySelection {
  type: 'service' | 'server' | 'deployment' | 'system' | 'framework' | 'library';
  id: string;
  name: string;
  data?: any;
}

export interface PaginationMeta {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PlatformAggregateState {
  totalSystems: number;
  totalServices: number;
  totalServers: number;
  totalDeployments: number;
  healthyCount: number;
  degradedCount: number;
  criticalCount: number;
  offlineCount: number;
  overallHealthPercent: number;
  avgLatencyMs: number;
  totalRps: number;
  activeIncidentsCount: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface TopologyNode {
  id: string;
  label: string;
  type: 'system' | 'service' | 'server';
  status: HealthStatus;
  systemName?: string;
  metricsSummary?: string;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  status: HealthStatus;
}
