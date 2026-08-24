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

// ── Mock Jenkins CI/CD data ──────────────────────────────────────────

export const mockJenkinsJobs: import('../types').JenkinsJob[] = [
  {
    id: 'jenkins-job-01',
    name: 'nexus-console-build',
    url: 'https://jenkins.internal/job/nexus-console-build',
    status: 'success',
    lastBuildNumber: 423,
    lastBuildTimestamp: new Date(Date.now() - 900000).toISOString(),
    lastBuildDuration: 145,
    scmBranch: 'main',
    triggeredBy: 'GitHub webhook (push)',
    description: 'Angular production build + deploy to :4200'
  },
  {
    id: 'jenkins-job-02',
    name: 'nexus-integration-tests',
    url: 'https://jenkins.internal/job/nexus-integration-tests',
    status: 'building',
    lastBuildNumber: 218,
    lastBuildTimestamp: new Date(Date.now() - 300000).toISOString(),
    lastBuildDuration: 342,
    scmBranch: 'feat/sol-gate',
    triggeredBy: 'PR #847 (engineer-ii)',
    description: 'Integration test suite — cascade, conduit, nebula'
  },
  {
    id: 'jenkins-job-03',
    name: 'deploy-to-staging',
    url: 'https://jenkins.internal/job/deploy-to-staging',
    status: 'failure',
    lastBuildNumber: 156,
    lastBuildTimestamp: new Date(Date.now() - 7200000).toISOString(),
    lastBuildDuration: 89,
    scmBranch: 'release/v2.1',
    triggeredBy: 'Manual (devops)',
    description: 'Staging deployment pipeline — failed on migration check'
  },
  {
    id: 'jenkins-job-04',
    name: 'nightly-typecheck',
    url: 'https://jenkins.internal/job/nightly-typecheck',
    status: 'success',
    lastBuildNumber: 512,
    lastBuildTimestamp: new Date(Date.now() - 43200000).toISOString(),
    lastBuildDuration: 56,
    scmBranch: 'main',
    triggeredBy: 'Cron (nightly @ 02:00 UTC)',
    description: 'Full-repo TypeScript typecheck + TypeSpec compile'
  }
];

export const mockJenkinsBuilds: Record<string, import('../types').JenkinsBuild[]> = {
  'jenkins-job-01': [
    { id: 'b423', jobId: 'jenkins-job-01', jobName: 'nexus-console-build', buildNumber: 423, status: 'success', timestamp: new Date(Date.now() - 900000).toISOString(), duration: 145, scmBranch: 'main', commitHash: 'a1b2c3d', triggeredBy: 'GitHub webhook', consoleUrl: 'https://jenkins.internal/job/nexus-console-build/423/console' },
    { id: 'b422', jobId: 'jenkins-job-01', jobName: 'nexus-console-build', buildNumber: 422, status: 'success', timestamp: new Date(Date.now() - 1800000).toISOString(), duration: 132, scmBranch: 'main', commitHash: 'e4f5g6h', triggeredBy: 'GitHub webhook', consoleUrl: 'https://jenkins.internal/job/nexus-console-build/422/console' },
  ],
  'jenkins-job-02': [
    { id: 'b218', jobId: 'jenkins-job-02', jobName: 'nexus-integration-tests', buildNumber: 218, status: 'building', timestamp: new Date(Date.now() - 300000).toISOString(), duration: 342, scmBranch: 'feat/sol-gate', commitHash: 'i7j8k9l', triggeredBy: 'PR #847', consoleUrl: 'https://jenkins.internal/job/nexus-integration-tests/218/console' },
  ],
  'jenkins-job-03': [
    { id: 'b156', jobId: 'jenkins-job-03', jobName: 'deploy-to-staging', buildNumber: 156, status: 'failure', timestamp: new Date(Date.now() - 7200000).toISOString(), duration: 89, scmBranch: 'release/v2.1', commitHash: 'm0n1o2p', triggeredBy: 'Manual (devops)', consoleUrl: 'https://jenkins.internal/job/deploy-to-staging/156/console' },
  ],
  'jenkins-job-04': [
    { id: 'b512', jobId: 'jenkins-job-04', jobName: 'nightly-typecheck', buildNumber: 512, status: 'success', timestamp: new Date(Date.now() - 43200000).toISOString(), duration: 56, scmBranch: 'main', commitHash: 'q3r4s5t', triggeredBy: 'Cron (nightly)', consoleUrl: 'https://jenkins.internal/job/nightly-typecheck/512/console' },
  ]
};

// ── Mock SonarQube code quality data ─────────────────────────────────────────

export const mockSonarProjects: import('../types').SonarProject[] = [
  {
    id: 'sonar-proj-01',
    key: 'nexus-registry',
    name: 'nexus-registry',
    gate: 'passed',
    reliabilityRating: 'A',
    securityRating: 'A',
    maintainabilityRating: 'A',
    coveragePercent: 92.4,
    duplicationsPercent: 1.8,
    linesOfCode: 18420,
    lastAnalysis: new Date(Date.now() - 5400000).toISOString(),
    url: 'https://sonar.internal/dashboard?id=nexus-registry',
    description: 'Service registry + heartbeats (TypeScript)'
  },
  {
    id: 'sonar-proj-02',
    key: 'cascade-gates',
    name: 'cascade-gates',
    gate: 'passed',
    reliabilityRating: 'B',
    securityRating: 'A',
    maintainabilityRating: 'B',
    coveragePercent: 87.1,
    duplicationsPercent: 3.2,
    linesOfCode: 9240,
    lastAnalysis: new Date(Date.now() - 10800000).toISOString(),
    url: 'https://sonar.internal/dashboard?id=cascade-gates',
    description: 'SOL gate evaluation engine (Python)'
  },
  {
    id: 'sonar-proj-03',
    key: 'sol-gate-engine',
    name: 'sol-gate-engine',
    gate: 'failed',
    reliabilityRating: 'C',
    securityRating: 'B',
    maintainabilityRating: 'C',
    coveragePercent: 61.3,
    duplicationsPercent: 11.4,
    linesOfCode: 5120,
    lastAnalysis: new Date(Date.now() - 21600000).toISOString(),
    url: 'https://sonar.internal/dashboard?id=sol-gate-engine',
    description: 'Promotion + SOL gate verdict engine — uncovered branches in stage-3 parser'
  },
  {
    id: 'sonar-proj-04',
    key: 'peb-kernel',
    name: 'peb-kernel',
    gate: 'passed',
    reliabilityRating: 'A',
    securityRating: 'A',
    maintainabilityRating: 'B',
    coveragePercent: 95.0,
    duplicationsPercent: 0.9,
    linesOfCode: 30110,
    lastAnalysis: new Date(Date.now() - 43200000).toISOString(),
    url: 'https://sonar.internal/dashboard?id=peb-kernel',
    description: 'Persistent Engineering Brain kernel (Java 21 / Quarkus)'
  }
];

export const mockSonarMetrics: Record<string, import('../types').SonarMetricPoint[]> = {
  'sonar-proj-01': [
    { id: 'sm-1-1', projectId: 'sonar-proj-01', projectKey: 'nexus-registry', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), coveragePercent: 89.2, duplicationsPercent: 2.1, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'A' },
    { id: 'sm-1-2', projectId: 'sonar-proj-01', projectKey: 'nexus-registry', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), coveragePercent: 90.0, duplicationsPercent: 2.0, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'A' },
    { id: 'sm-1-3', projectId: 'sonar-proj-01', projectKey: 'nexus-registry', timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), coveragePercent: 90.8, duplicationsPercent: 1.9, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'A' },
    { id: 'sm-1-4', projectId: 'sonar-proj-01', projectKey: 'nexus-registry', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), coveragePercent: 91.5, duplicationsPercent: 1.9, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'A' },
    { id: 'sm-1-5', projectId: 'sonar-proj-01', projectKey: 'nexus-registry', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), coveragePercent: 91.9, duplicationsPercent: 1.8, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'A' },
    { id: 'sm-1-6', projectId: 'sonar-proj-01', projectKey: 'nexus-registry', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), coveragePercent: 92.2, duplicationsPercent: 1.8, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'A' },
    { id: 'sm-1-7', projectId: 'sonar-proj-01', projectKey: 'nexus-registry', timestamp: new Date().toISOString(), coveragePercent: 92.4, duplicationsPercent: 1.8, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'A' }
  ],
  'sonar-proj-02': [
    { id: 'sm-2-1', projectId: 'sonar-proj-02', projectKey: 'cascade-gates', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), coveragePercent: 82.0, duplicationsPercent: 3.8, reliabilityRating: 'B', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-2-2', projectId: 'sonar-proj-02', projectKey: 'cascade-gates', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), coveragePercent: 83.5, duplicationsPercent: 3.6, reliabilityRating: 'B', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-2-3', projectId: 'sonar-proj-02', projectKey: 'cascade-gates', timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), coveragePercent: 84.9, duplicationsPercent: 3.4, reliabilityRating: 'B', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-2-4', projectId: 'sonar-proj-02', projectKey: 'cascade-gates', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), coveragePercent: 85.2, duplicationsPercent: 3.3, reliabilityRating: 'B', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-2-5', projectId: 'sonar-proj-02', projectKey: 'cascade-gates', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), coveragePercent: 86.0, duplicationsPercent: 3.2, reliabilityRating: 'B', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-2-6', projectId: 'sonar-proj-02', projectKey: 'cascade-gates', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), coveragePercent: 86.8, duplicationsPercent: 3.2, reliabilityRating: 'B', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-2-7', projectId: 'sonar-proj-02', projectKey: 'cascade-gates', timestamp: new Date().toISOString(), coveragePercent: 87.1, duplicationsPercent: 3.2, reliabilityRating: 'B', securityRating: 'A', maintainabilityRating: 'B' }
  ],
  'sonar-proj-03': [
    { id: 'sm-3-1', projectId: 'sonar-proj-03', projectKey: 'sol-gate-engine', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), coveragePercent: 70.1, duplicationsPercent: 5.9, reliabilityRating: 'B', securityRating: 'B', maintainabilityRating: 'A' },
    { id: 'sm-3-2', projectId: 'sonar-proj-03', projectKey: 'sol-gate-engine', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), coveragePercent: 68.4, duplicationsPercent: 6.2, reliabilityRating: 'C', securityRating: 'B', maintainabilityRating: 'A' },
    { id: 'sm-3-3', projectId: 'sonar-proj-03', projectKey: 'sol-gate-engine', timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), coveragePercent: 66.8, duplicationsPercent: 6.1, reliabilityRating: 'C', securityRating: 'B', maintainabilityRating: 'A' },
    { id: 'sm-3-4', projectId: 'sonar-proj-03', projectKey: 'sol-gate-engine', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), coveragePercent: 64.9, duplicationsPercent: 6.0, reliabilityRating: 'C', securityRating: 'B', maintainabilityRating: 'B' },
    { id: 'sm-3-5', projectId: 'sonar-proj-03', projectKey: 'sol-gate-engine', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), coveragePercent: 63.0, duplicationsPercent: 5.8, reliabilityRating: 'C', securityRating: 'B', maintainabilityRating: 'B' },
    { id: 'sm-3-6', projectId: 'sonar-proj-03', projectKey: 'sol-gate-engine', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), coveragePercent: 61.8, duplicationsPercent: 5.7, reliabilityRating: 'C', securityRating: 'B', maintainabilityRating: 'B' },
    { id: 'sm-3-7', projectId: 'sonar-proj-03', projectKey: 'sol-gate-engine', timestamp: new Date().toISOString(), coveragePercent: 61.3, duplicationsPercent: 6.4, reliabilityRating: 'C', securityRating: 'B', maintainabilityRating: 'C' }
  ],
  'sonar-proj-04': [
    { id: 'sm-4-1', projectId: 'sonar-proj-04', projectKey: 'peb-kernel', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), coveragePercent: 93.0, duplicationsPercent: 1.1, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-4-2', projectId: 'sonar-proj-04', projectKey: 'peb-kernel', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), coveragePercent: 93.5, duplicationsPercent: 1.1, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-4-3', projectId: 'sonar-proj-04', projectKey: 'peb-kernel', timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), coveragePercent: 94.0, duplicationsPercent: 1.0, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-4-4', projectId: 'sonar-proj-04', projectKey: 'peb-kernel', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), coveragePercent: 94.4, duplicationsPercent: 1.0, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-4-5', projectId: 'sonar-proj-04', projectKey: 'peb-kernel', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), coveragePercent: 94.7, duplicationsPercent: 0.9, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-4-6', projectId: 'sonar-proj-04', projectKey: 'peb-kernel', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), coveragePercent: 94.9, duplicationsPercent: 0.9, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'B' },
    { id: 'sm-4-7', projectId: 'sonar-proj-04', projectKey: 'peb-kernel', timestamp: new Date().toISOString(), coveragePercent: 95.0, duplicationsPercent: 0.9, reliabilityRating: 'A', securityRating: 'A', maintainabilityRating: 'B' }
  ]
};

// ── Mock Ballerina integration platform data ──────────────────────────────────

export const mockBallerinaPackages: import('../types').BallerinaPackage[] = [
  {
    id: 'bal-pkg-01',
    org: 'ballerina',
    name: 'http',
    version: '2.11.4',
    platform: 'Ballerina 2201.8.x (Swan Lake)',
    license: 'Apache-2.0',
    description: 'HTTP client / listener module for REST integrations',
    dependencies: [
      { org: 'ballerina', name: 'jballerina.java', version: '0.0.0' },
      { org: 'ballerina', name: 'io', version: '1.6.0' },
      { org: 'ballerina', name: 'log', version: '2.9.0' }
    ],
    lastUpdated: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: 'bal-pkg-02',
    org: 'ballerina',
    name: 'websocket',
    version: '2.2.3',
    platform: 'Ballerina 2201.1.x (Swan Lake)',
    license: 'Apache-2.0',
    description: 'WebSocket client / listener for realtime channels',
    dependencies: [
      { org: 'ballerina', name: 'http', version: '2.11.4' },
      { org: 'ballerina', name: 'io', version: '1.6.0' }
    ],
    lastUpdated: new Date(Date.now() - 12 * 86400000).toISOString()
  },
  {
    id: 'bal-pkg-03',
    org: 'wso2',
    name: 'amqp',
    version: '3.2.1',
    platform: 'Ballerina 2201.6.x+, 2201.8.x',
    license: 'Apache-2.0',
    description: 'AMQP 0-9-1 publisher/consumer connector (broker-gateway bridge)',
    dependencies: [
      { org: 'ballerina', name: 'http', version: '2.11.4' },
      { org: 'ballerina', name: 'log', version: '2.1.0' }
    ],
    lastUpdated: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'bal-pkg-04',
    org: 'nexus',
    name: 'integration-gateway',
    version: '1.4.0',
    platform: 'Ballerina 2201.8.x (Swan Lake)',
    license: 'Apache-2.0',
    description: 'Internal nexus integration gateway (broker fabric ingress)',
    dependencies: [
      { org: 'ballerina', name: 'http', version: '2.11.4' },
      { org: 'wso2', name: 'amqp', version: '3.2.2' }
    ],
    lastUpdated: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

export const mockBallerinaServices: import('../types').BallerinaService[] = [
  {
    id: 'bal-svc-01',
    packageRef: 'nexus/integration-gateway',
    name: 'broker-amqp-bridge',
    endpoint: 'amqp://localhost:5672/nexus.events',
    listenerPort: '5672',
    status: 'healthy'
  },
  {
    id: 'bal-svc-02',
    packageRef: 'nexus/integration-gateway',
    name: 'integration-rest-listener',
    endpoint: 'http://localhost:8081/api/v1/integrations',
    listenerPort: '8081',
    status: 'healthy'
  },
  {
    id: 'bal-svc-03',
    packageRef: 'ballerina/websocket',
    name: 'realtime-event-channel',
    endpoint: 'ws://localhost:3200/ws/events',
    listenerPort: '3200',
    status: 'degraded'
  }
];
