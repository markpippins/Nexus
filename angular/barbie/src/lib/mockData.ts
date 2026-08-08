import {
  Service,
  Server,
  Deployment,
  Framework,
  Library,
  System,
  LookupEntry,
  PlatformAggregateState
} from '../types';

export const mockSystems: System[] = [
  {
    id: 'sys-mock-01',
    name: 'Payments & Financial Core (Mock)',
    description: 'Mock payment authorization and ledger processing system.',
    owner: 'Fintech Team',
    tier: 'Tier 1 - Critical',
    environment: 'production',
    status: 'healthy',
    servicesCount: 2,
    services: ['mock-auth-svc', 'mock-payment-gateway']
  },
  {
    id: 'sys-mock-02',
    name: 'User Data & Identity (Mock)',
    description: 'Mock profile management and single sign-on system.',
    owner: 'Identity Squad',
    tier: 'Tier 2 - Important',
    environment: 'production',
    status: 'healthy',
    servicesCount: 1,
    services: ['mock-user-profile']
  }
];

export const mockServices: Service[] = [
  {
    id: 'svc-mock-01',
    name: 'mock-auth-svc',
    type: 'API Gateway',
    version: '2.1.0-mock',
    status: 'healthy',
    systemId: 'sys-mock-01',
    systemName: 'Payments & Financial Core (Mock)',
    endpoint: 'https://mock-auth.internal/v1',
    environment: 'production',
    hostedServicesCount: 2,
    hostedServices: ['OAuth Token Server', 'MFA Verification Engine'],
    frameworkId: 'fw-01',
    frameworkName: 'Spring Boot',
    serverId: 'srv-mock-01',
    serverHostname: 'mock-k8s-node-01',
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 99.98,
    rps: 1250,
    errorRate: 0.01,
    latencyMs: 14,
    description: 'Client-side mock authorization gateway.'
  },
  {
    id: 'svc-mock-02',
    name: 'mock-payment-gateway',
    type: 'Microservice',
    version: '1.4.2-mock',
    status: 'degraded',
    systemId: 'sys-mock-01',
    systemName: 'Payments & Financial Core (Mock)',
    endpoint: 'https://mock-payments.internal/v1',
    environment: 'production',
    hostedServicesCount: 1,
    hostedServices: ['Stripe Settlement Relay'],
    frameworkId: 'fw-02',
    frameworkName: 'Node.js Express',
    serverId: 'srv-mock-02',
    serverHostname: 'mock-k8s-node-02',
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 98.4,
    rps: 840,
    errorRate: 1.2,
    latencyMs: 145,
    description: 'Mock payment processing node.'
  },
  {
    id: 'svc-mock-03',
    name: 'mock-user-profile',
    type: 'Data Service',
    version: '3.0.0-mock',
    status: 'healthy',
    systemId: 'sys-mock-02',
    systemName: 'User Data & Identity (Mock)',
    endpoint: 'https://mock-user.internal/v1',
    environment: 'staging',
    hostedServicesCount: 0,
    hostedServices: [],
    frameworkId: 'fw-03',
    frameworkName: 'Go Gin Framework',
    serverId: 'srv-mock-01',
    serverHostname: 'mock-k8s-node-01',
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 100,
    rps: 310,
    errorRate: 0.0,
    latencyMs: 8,
    description: 'Mock user profile and session service.'
  }
];

export const mockServers: Server[] = [
  {
    id: 'srv-mock-01',
    name: 'mock-k8s-node-01',
    hostname: 'k8s-node-01.internal',
    ipAddress: '192.168.1.101',
    serverType: 'c6i.2xlarge Compute Optimized',
    operatingSystem: 'Ubuntu 22.04 LTS',
    datacenterRegion: 'us-east-1 (N. Virginia)',
    status: 'healthy',
    cpuUsage: 35,
    memoryUsage: 48,
    diskUsage: 22,
    activePodsCount: 12,
    lastPing: new Date().toISOString(),
    environment: 'production'
  },
  {
    id: 'srv-mock-02',
    name: 'mock-k8s-node-02',
    hostname: 'k8s-node-02.internal',
    ipAddress: '192.168.1.102',
    serverType: 'm6i.4xlarge General Purpose',
    operatingSystem: 'RedHat Enterprise Linux 9',
    datacenterRegion: 'eu-west-1 (Ireland)',
    status: 'degraded',
    cpuUsage: 88,
    memoryUsage: 91,
    diskUsage: 64,
    activePodsCount: 8,
    lastPing: new Date().toISOString(),
    environment: 'production'
  }
];

export const mockDeployments: Deployment[] = [
  {
    id: 'dep-mock-01',
    serviceId: 'svc-mock-01',
    serviceName: 'mock-auth-svc',
    version: '2.1.0-mock',
    clusterName: 'mock-us-east-k8s',
    replicasReady: 4,
    replicasTarget: 4,
    commitHash: 'm0ck111',
    deployedBy: 'CI/CD Automation (Mock)',
    deployedAt: new Date().toISOString(),
    environment: 'production',
    status: 'healthy'
  },
  {
    id: 'dep-mock-02',
    serviceId: 'svc-mock-02',
    serviceName: 'mock-payment-gateway',
    version: '1.4.2-mock',
    clusterName: 'mock-eu-west-k8s',
    replicasReady: 2,
    replicasTarget: 3,
    commitHash: 'm0ck222',
    deployedBy: 'DevOps Lead (Mock)',
    deployedAt: new Date(Date.now() - 3600000).toISOString(),
    environment: 'production',
    status: 'degraded'
  }
];

export const mockFrameworks: Framework[] = [
  { id: 'fw-m1', name: 'Spring Boot (Mock)', category: 'Backend Framework', language: 'Java 21', version: '3.2.0', servicesCount: 1 },
  { id: 'fw-m2', name: 'Express.js (Mock)', category: 'Node Web Server', language: 'TypeScript', version: '4.18.2', servicesCount: 1 }
];

export const mockLibraries: Library[] = [
  { id: 'lib-m1', name: 'jsonwebtoken (Mock)', category: 'Security / Auth', language: 'TypeScript', version: '9.0.2', vulnerabilitiesCount: 0 },
  { id: 'lib-m2', name: 'pg (Mock)', category: 'Database Client', language: 'Node.js', version: '8.11.3', vulnerabilitiesCount: 0 }
];

export const mockLookups: Record<string, LookupEntry[]> = {
  'server-types': [
    { id: 'lk-s1', lookupType: 'server-types', key: 'c6i.2xlarge', name: 'Mock Compute Optimized (8 vCPU)' },
    { id: 'lk-s2', lookupType: 'server-types', key: 'm6i.4xlarge', name: 'Mock Memory Optimized (16 vCPU)' }
  ],
  'environments': [
    { id: 'lk-e1', lookupType: 'environments', key: 'production', name: 'Production Cloud' },
    { id: 'lk-e2', lookupType: 'environments', key: 'staging', name: 'Staging Sandbox' }
  ]
};

export const mockAggregateState: PlatformAggregateState = {
  totalSystems: 2,
  totalServices: 3,
  totalServers: 2,
  totalDeployments: 2,
  healthyCount: 2,
  degradedCount: 1,
  criticalCount: 0,
  offlineCount: 0,
  overallHealthPercent: 96.5,
  avgLatencyMs: 24,
  totalRps: 2400,
  activeIncidentsCount: 1,
  nodes: [
    { id: 'n1', label: 'mock-auth-svc', type: 'service', status: 'healthy', systemName: 'Payments & Financial Core (Mock)', metricsSummary: '1250 RPS | 14ms' },
    { id: 'n2', label: 'mock-payment-gateway', type: 'service', status: 'degraded', systemName: 'Payments & Financial Core (Mock)', metricsSummary: '840 RPS | 145ms' }
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', label: 'Auth Check', status: 'healthy' }
  ]
};
