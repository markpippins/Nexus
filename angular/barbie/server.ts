import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3010', 10);

// ── Proxy to real Nexus backend ──────────────────────────────────
// When BACKEND_URL is set, forward all /api/ requests to the real
// service-registry backend. Live mode is authoritative: backend
// failures surface as errors (502) instead of silently serving
// embedded mock data. Mock data only serves when BACKEND_URL is
// unset (local dev without a backend).
const BACKEND_URL = process.env.BACKEND_URL || '';

if (BACKEND_URL) {
  console.log(`[barbie] Proxy enabled: /api/* → ${BACKEND_URL}`);

  app.use('/api', async (req, res, next) => {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
      return next();
    }

    try {
      const targetUrl = `${BACKEND_URL}${req.originalUrl}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const fetchOpts: RequestInit & { signal?: AbortSignal } = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      };

      if (['POST', 'PUT'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        fetchOpts.body = JSON.stringify(req.body);
      }

      const backendRes = await fetch(targetUrl, fetchOpts);
      clearTimeout(timeout);

      if (backendRes.ok) {
        // Forward the backend status code
        // Handle 204 No Content (common for DELETE) without trying to parse JSON
        if (backendRes.status === 204) {
          return res.sendStatus(204);
        }
        const data = await backendRes.json();
        return res.status(backendRes.status).json(data);
      }

      // Live mode is authoritative: surface backend errors instead of
      // silently falling through to embedded mock data.
      if (backendRes.status === 404 || backendRes.status === 400) {
        const errText = await backendRes.text().catch(() => "");
        return res.status(backendRes.status).type("application/json").send(errText);
      }
      console.warn(`[barbie] Backend returned ${backendRes.status} for ${req.method} ${req.originalUrl}`);
      return res.status(502).json({ error: `Registry backend returned ${backendRes.status}`, path: req.originalUrl });
    } catch (err: any) {
      console.error(`[barbie] Backend unreachable for ${req.method} ${req.originalUrl}: ${err?.message || err}`);
      return res.status(502).json({ error: "Registry backend unreachable", detail: String(err?.message || err) });
    }
  });
} else {
  console.log('[barbie] BACKEND_URL not set — using embedded mock data');
}

// Pre-seeded operational data
let systems = [
  {
    id: "sys-01",
    name: "Payments & Financial Core",
    description: "Transaction processing, ledger accounting, and billing gateways",
    owner: "FinTech Ops Team",
    environment: "production",
    status: "healthy",
    servicesCount: 3,
    services: ["payment-processor-svc", "billing-ledger-svc", "fraud-detector-svc"],
    tier: "Tier 1 - Critical"
  },
  {
    id: "sys-02",
    name: "Identity & Access Control",
    description: "OAuth2 authentication, JWT tokens, RBAC permissions, and SSO",
    owner: "Security Engineering",
    environment: "production",
    status: "healthy",
    servicesCount: 2,
    services: ["auth-gateway-svc", "user-profile-svc"],
    tier: "Tier 1 - Critical"
  },
  {
    id: "sys-03",
    name: "Customer Experience & Catalog",
    description: "Product catalog search, user storefronts, cart management",
    owner: "Product Platform Team",
    environment: "production",
    status: "degraded",
    servicesCount: 3,
    services: ["catalog-search-svc", "inventory-tracker-svc", "order-fulfillment-svc"],
    tier: "Tier 2 - Important"
  },
  {
    id: "sys-04",
    name: "Data Pipeline & Real-Time Analytics",
    description: "Telemetry ingestion, event streaming, and analytics processing",
    owner: "Data Infra Team",
    environment: "production",
    status: "healthy",
    servicesCount: 2,
    services: ["analytics-stream-svc", "notification-dispatch-svc"],
    tier: "Tier 2 - Important"
  },
  {
    id: "sys-05",
    name: "AI & Machine Learning Engine",
    description: "Personalized recommendation vectors and smart content transcoding",
    owner: "AI/ML Core Group",
    environment: "staging",
    status: "critical",
    servicesCount: 2,
    services: ["recommendation-engine-svc", "media-transcoder-svc"],
    tier: "Tier 3 - Standard"
  }
];

let services = [
  {
    id: "svc-01",
    name: "auth-gateway-svc",
    type: "API Gateway",
    version: "2.4.1",
    status: "healthy",
    systemId: "sys-02",
    systemName: "Identity & Access Control",
    endpoint: "https://auth.platform.example.com/v1",
    environment: "production",
    hostedServicesCount: 2,
    hostedServices: ["jwt-validator-internal", "oauth-session-store"],
    frameworkId: "fw-02",
    frameworkName: "Node.js Express",
    serverId: "srv-01",
    serverHostname: "k8s-node-us-east-01",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 99.98,
    rps: 3420,
    latencyMs: 14,
    errorRate: 0.01,
    description: "Edge authentication gateway proxy with rate limiting"
  },
  {
    id: "svc-02",
    name: "payment-processor-svc",
    type: "Transaction Processing",
    version: "3.1.0",
    status: "healthy",
    systemId: "sys-01",
    systemName: "Payments & Financial Core",
    endpoint: "https://pay.platform.example.com/v1",
    environment: "production",
    hostedServicesCount: 3,
    hostedServices: ["stripe-connector-proxy", "paypal-connector-proxy", "3d-secure-verifier"],
    frameworkId: "fw-01",
    frameworkName: "Spring Boot",
    serverId: "srv-02",
    serverHostname: "db-primary-us-east",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 99.99,
    rps: 1850,
    latencyMs: 42,
    errorRate: 0.02,
    description: "PCI-DSS compliant payment processing orchestration engine"
  },
  {
    id: "svc-03",
    name: "catalog-search-svc",
    type: "Search Engine",
    version: "1.9.8",
    status: "degraded",
    systemId: "sys-03",
    systemName: "Customer Experience & Catalog",
    endpoint: "https://catalog.platform.example.com/v1",
    environment: "production",
    hostedServicesCount: 1,
    hostedServices: ["elasticsearch-indexer-worker"],
    frameworkId: "fw-03",
    frameworkName: "Go Fiber",
    serverId: "srv-03",
    serverHostname: "k8s-node-us-west-01",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 98.45,
    rps: 4200,
    latencyMs: 185,
    errorRate: 2.14,
    description: "High throughput product search engine backed by Elasticsearch"
  },
  {
    id: "svc-04",
    name: "recommendation-engine-svc",
    type: "AI Model Inference",
    version: "0.9.4",
    status: "critical",
    systemId: "sys-05",
    systemName: "AI & Machine Learning Engine",
    endpoint: "https://ai-rec.platform.example.com/v1",
    environment: "staging",
    hostedServicesCount: 2,
    hostedServices: ["vector-embeddings-worker", "ann-index-search"],
    frameworkId: "fw-04",
    frameworkName: "Python FastAPI",
    serverId: "srv-04",
    serverHostname: "gpu-cluster-node-01",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 92.10,
    rps: 480,
    latencyMs: 840,
    errorRate: 12.8,
    description: "GPU accelerated recommendation vector embedding service"
  },
  {
    id: "svc-05",
    name: "inventory-tracker-svc",
    type: "Inventory Management",
    version: "2.0.1",
    status: "healthy",
    systemId: "sys-03",
    systemName: "Customer Experience & Catalog",
    endpoint: "https://inventory.platform.example.com/v1",
    environment: "production",
    hostedServicesCount: 1,
    hostedServices: ["stock-reservation-daemon"],
    frameworkId: "fw-01",
    frameworkName: "Spring Boot",
    serverId: "srv-03",
    serverHostname: "k8s-node-us-west-01",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 99.95,
    rps: 1200,
    latencyMs: 22,
    errorRate: 0.05,
    description: "Real-time stock reservation and warehouse tracking"
  },
  {
    id: "svc-06",
    name: "fraud-detector-svc",
    type: "Security & Risk",
    version: "1.4.0",
    status: "healthy",
    systemId: "sys-01",
    systemName: "Payments & Financial Core",
    endpoint: "https://fraud.platform.example.com/v1",
    environment: "production",
    hostedServicesCount: 2,
    hostedServices: ["rule-evaluator-engine", "risk-score-cache"],
    frameworkId: "fw-05",
    frameworkName: "Rust Axum",
    serverId: "srv-01",
    serverHostname: "k8s-node-us-east-01",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 99.99,
    rps: 2900,
    latencyMs: 8,
    errorRate: 0.001,
    description: "Ultra-low latency risk scoring engine written in Rust"
  },
  {
    id: "svc-07",
    name: "notification-dispatch-svc",
    type: "Messaging Queue",
    version: "3.0.0",
    status: "healthy",
    systemId: "sys-04",
    systemName: "Data Pipeline & Real-Time Analytics",
    endpoint: "https://notify.platform.example.com/v1",
    environment: "production",
    hostedServicesCount: 2,
    hostedServices: ["push-notification-worker", "email-smtp-relay"],
    frameworkId: "fw-02",
    frameworkName: "Node.js Express",
    serverId: "srv-05",
    serverHostname: "redis-cache-cluster-01",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 99.90,
    rps: 850,
    latencyMs: 35,
    errorRate: 0.1,
    description: "Multi-channel async message worker for push, SMS, and email"
  },
  {
    id: "svc-08",
    name: "billing-ledger-svc",
    type: "Database Service",
    version: "2.1.0",
    status: "healthy",
    systemId: "sys-01",
    systemName: "Payments & Financial Core",
    endpoint: "https://ledger.platform.example.com/v1",
    environment: "production",
    hostedServicesCount: 1,
    hostedServices: ["immutable-audit-log"],
    frameworkId: "fw-01",
    frameworkName: "Spring Boot",
    serverId: "srv-02",
    serverHostname: "db-primary-us-east",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 99.99,
    rps: 950,
    latencyMs: 18,
    errorRate: 0.0,
    description: "Double-entry bookkeeping financial ledger persistence service"
  }
];

let servers = [
  {
    id: "srv-01",
    name: "k8s-node-us-east-01",
    hostname: "k8s-node-us-east-01.infra.internal",
    ipAddress: "10.128.0.14",
    serverType: "c6i.2xlarge Compute Optimized",
    operatingSystem: "Ubuntu 22.04 LTS (Kernel 5.15)",
    environment: "production",
    status: "healthy",
    cpuUsage: 48,
    memoryUsage: 62,
    diskUsage: 38,
    datacenterRegion: "us-east-1 (N. Virginia)",
    activePodsCount: 24,
    lastPing: new Date().toISOString()
  },
  {
    id: "srv-02",
    name: "db-primary-us-east",
    hostname: "db-primary-us-east.infra.internal",
    ipAddress: "10.128.0.42",
    serverType: "r6i.4xlarge Memory Optimized",
    operatingSystem: "Debian 12 Bookworm",
    environment: "production",
    status: "healthy",
    cpuUsage: 32,
    memoryUsage: 84,
    diskUsage: 65,
    datacenterRegion: "us-east-1 (N. Virginia)",
    activePodsCount: 6,
    lastPing: new Date().toISOString()
  },
  {
    id: "srv-03",
    name: "k8s-node-us-west-01",
    hostname: "k8s-node-us-west-01.infra.internal",
    ipAddress: "10.140.0.88",
    serverType: "m6i.2xlarge General Purpose",
    operatingSystem: "Ubuntu 22.04 LTS (Kernel 5.15)",
    environment: "production",
    status: "degraded",
    cpuUsage: 89,
    memoryUsage: 91,
    diskUsage: 72,
    datacenterRegion: "us-west-2 (Oregon)",
    activePodsCount: 31,
    lastPing: new Date().toISOString()
  },
  {
    id: "srv-04",
    name: "gpu-cluster-node-01",
    hostname: "gpu-node-01.ai.internal",
    ipAddress: "10.150.4.12",
    serverType: "g5.4xlarge NVIDIA A10G GPU",
    operatingSystem: "Ubuntu 22.04 LTS CUDA 12.1",
    environment: "staging",
    status: "critical",
    cpuUsage: 96,
    memoryUsage: 94,
    diskUsage: 85,
    datacenterRegion: "eu-central-1 (Frankfurt)",
    activePodsCount: 12,
    lastPing: new Date().toISOString()
  },
  {
    id: "srv-05",
    name: "redis-cache-cluster-01",
    hostname: "redis-01.cache.internal",
    ipAddress: "10.128.0.99",
    serverType: "m6g.xlarge AWS Graviton3",
    operatingSystem: "Alpine Linux 3.18",
    environment: "production",
    status: "healthy",
    cpuUsage: 18,
    memoryUsage: 45,
    diskUsage: 22,
    datacenterRegion: "us-east-1 (N. Virginia)",
    activePodsCount: 8,
    lastPing: new Date().toISOString()
  },
  {
    id: "srv-06",
    name: "edge-ingress-gateway-01",
    hostname: "edge-01.global.internal",
    ipAddress: "35.210.11.4",
    serverType: "c6i.xlarge Edge Router",
    operatingSystem: "Rocky Linux 9",
    environment: "production",
    status: "healthy",
    cpuUsage: 25,
    memoryUsage: 38,
    diskUsage: 15,
    datacenterRegion: "ap-southeast-1 (Singapore)",
    activePodsCount: 14,
    lastPing: new Date().toISOString()
  }
];

let deployments = [
  {
    id: "dep-01",
    serviceId: "svc-01",
    serviceName: "auth-gateway-svc",
    environment: "production",
    version: "v2.4.1",
    status: "healthy",
    deployedAt: "2026-07-27T14:30:00Z",
    deployedBy: "ci-cd-bot@platform.com",
    replicasReady: 8,
    replicasTarget: 8,
    commitHash: "7a2f91c",
    clusterName: "us-east-prod-k8s"
  },
  {
    id: "dep-02",
    serviceId: "svc-02",
    serviceName: "payment-processor-svc",
    environment: "production",
    version: "v3.1.0",
    status: "healthy",
    deployedAt: "2026-07-26T09:15:00Z",
    deployedBy: "sarah.dev@platform.com",
    replicasReady: 12,
    replicasTarget: 12,
    commitHash: "e4b9812",
    clusterName: "us-east-prod-k8s"
  },
  {
    id: "dep-03",
    serviceId: "svc-03",
    serviceName: "catalog-search-svc",
    environment: "production",
    version: "v1.9.8",
    status: "degraded",
    deployedAt: "2026-07-28T02:00:00Z",
    deployedBy: "alex.ops@platform.com",
    replicasReady: 4,
    replicasTarget: 6,
    commitHash: "901f4c3",
    clusterName: "us-west-prod-k8s"
  },
  {
    id: "dep-04",
    serviceId: "svc-04",
    serviceName: "recommendation-engine-svc",
    environment: "staging",
    version: "v0.9.4",
    status: "critical",
    deployedAt: "2026-07-28T05:45:00Z",
    deployedBy: "ai-model-deployer",
    replicasReady: 1,
    replicasTarget: 4,
    commitHash: "3f88a21",
    clusterName: "eu-central-staging-k8s"
  },
  {
    id: "dep-05",
    serviceId: "svc-06",
    serviceName: "fraud-detector-svc",
    environment: "production",
    version: "v1.4.0",
    status: "healthy",
    deployedAt: "2026-07-25T11:20:00Z",
    deployedBy: "secops-auto",
    replicasReady: 10,
    replicasTarget: 10,
    commitHash: "11d87a9",
    clusterName: "us-east-prod-k8s"
  }
];

let frameworks = [
  { id: "fw-01", name: "Spring Boot", category: "Backend Framework", language: "Java 21", version: "3.2.2", servicesCount: 3 },
  { id: "fw-02", name: "Node.js Express", category: "Web Framework", language: "TypeScript / Node 20", version: "4.21.2", servicesCount: 2 },
  { id: "fw-03", name: "Go Fiber", category: "High Performance Web", language: "Go 1.22", version: "2.52.0", servicesCount: 1 },
  { id: "fw-04", name: "Python FastAPI", category: "Async Microframework", language: "Python 3.11", version: "0.109.0", servicesCount: 1 },
  { id: "fw-05", name: "Rust Axum", category: "System Microservices", language: "Rust 1.76", version: "0.7.4", servicesCount: 1 }
];

let libraries = [
  { id: "lib-01", name: "Jackson Databind", category: "Serialization", language: "Java", version: "2.16.1", vulnerabilitiesCount: 0 },
  { id: "lib-02", name: "Lodash Utility", category: "Helper Methods", language: "TypeScript", version: "4.17.21", vulnerabilitiesCount: 0 },
  { id: "lib-03", name: "PyTorch Inference Engine", category: "Deep Learning", language: "Python", version: "2.2.0", vulnerabilitiesCount: 1 },
  { id: "lib-04", name: "Tokio Async Runtime", category: "I/O Concurrency", language: "Rust", version: "1.37.0", vulnerabilitiesCount: 0 },
  { id: "lib-05", name: "gRPC Protocol Buffers", category: "RPC Communications", language: "Go / Multi", version: "1.61.0", vulnerabilitiesCount: 0 }
];

let lookupTables: Record<string, any[]> = {
  "server-types": [
    { id: "st-01", key: "c6i.2xlarge", name: "Compute Optimized 8 vCPU 16GB", lookupType: "server-types" },
    { id: "st-02", key: "r6i.4xlarge", name: "Memory Optimized 16 vCPU 128GB", lookupType: "server-types" },
    { id: "st-03", key: "g5.4xlarge", name: "GPU Accelerated NVIDIA A10G", lookupType: "server-types" }
  ],
  "environments": [
    { id: "env-01", key: "production", name: "Production Live Tier", lookupType: "environments" },
    { id: "env-02", key: "staging", name: "Staging Pre-Release", lookupType: "environments" },
    { id: "env-03", key: "development", name: "Dev Local Cluster", lookupType: "environments" }
  ],
  "operating-systems": [
    { id: "os-01", key: "ubuntu-22.04", name: "Ubuntu Linux 22.04 LTS", lookupType: "operating-systems" },
    { id: "os-02", key: "debian-12", name: "Debian 12 Bookworm", lookupType: "operating-systems" },
    { id: "os-03", key: "alpine-3.18", name: "Alpine Linux Container Base", lookupType: "operating-systems" }
  ],
  "service-types": [
    { id: "syt-01", key: "api-gateway", name: "API Gateway & Edge Router", lookupType: "service-types" },
    { id: "syt-02", key: "microservice", name: "Core Business Microservice", lookupType: "service-types" },
    { id: "syt-03", key: "background-worker", name: "Async Queue Worker", lookupType: "service-types" }
  ],
  "framework-categories": [
    { id: "fc-01", key: "web-backend", name: "Web Backend & REST APIs", lookupType: "framework-categories" },
    { id: "fc-02", key: "machine-learning", name: "AI/ML Model Serving", lookupType: "framework-categories" }
  ],
  "framework-languages": [
    { id: "fl-01", key: "typescript", name: "TypeScript / Node.js", lookupType: "framework-languages" },
    { id: "fl-02", key: "java", name: "Java Enterprise Edition", lookupType: "framework-languages" },
    { id: "fl-03", key: "go", name: "Go Golang", lookupType: "framework-languages" },
    { id: "fl-04", key: "rust", name: "Rust Systems Programming", lookupType: "framework-languages" },
    { id: "fl-05", key: "python", name: "Python Data Science & AI", lookupType: "framework-languages" }
  ],
  "library-categories": [
    { id: "lc-01", key: "serialization", name: "Data Mapping & JSON", lookupType: "library-categories" },
    { id: "lc-02", key: "concurrency", name: "Async Concurrency Engine", lookupType: "library-categories" }
  ],
  "library-languages": [
    { id: "ll-01", key: "typescript", name: "TypeScript / JavaScript", lookupType: "library-languages" },
    { id: "ll-02", key: "java", name: "Java Virtual Machine", lookupType: "library-languages" },
    { id: "ll-03", key: "rust", name: "Rust Native", lookupType: "library-languages" }
  ]
};

// Helper for pagination
function paginate<T>(items: T[], page: number = 1, size: number = 10) {
  const pageNum = Math.max(1, Number(page) || 1);
  const sizeNum = Math.max(1, Number(size) || 10);
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / sizeNum) || 1;
  const start = (pageNum - 1) * sizeNum;
  const data = items.slice(start, start + sizeNum);
  return {
    data,
    meta: {
      page: pageNum,
      size: sizeNum,
      totalItems,
      totalPages
    }
  };
}

// REST API Router under /api/v1/registry

// --- SERVICES ENDPOINTS ---
app.get("/api/v1/registry/services/with-hosted", (req, res) => {
  const size = Number(req.query.size) || 1000;
  res.json({
    data: services.slice(0, size),
    meta: { page: 1, size, totalItems: services.length, totalPages: 1 }
  });
});

app.get("/api/v1/registry/services/by-operation/:operation", (req, res) => {
  const op = (req.params.operation || "").toLowerCase();
  const matched = services.filter(
    s =>
      s.name.toLowerCase().includes(op) ||
      s.type.toLowerCase().includes(op) ||
      s.description?.toLowerCase().includes(op)
  );
  res.json({ data: matched, operation: req.params.operation });
});

app.get("/api/v1/registry/services/:serviceName/details", (req, res) => {
  const svc = services.find(
    s => s.name.toLowerCase() === req.params.serviceName.toLowerCase() || s.id === req.params.serviceName
  );
  if (!svc) {
    return res.status(404).json({ error: "Service not found" });
  }
  const relatedDeployments = deployments.filter(d => d.serviceId === svc.id || d.serviceName === svc.name);
  const server = servers.find(srv => srv.id === svc.serverId);
  res.json({ service: svc, deployments: relatedDeployments, server });
});

app.get("/api/v1/registry/services", (req, res) => {
  const { page, size, search, status, system, environment, sortBy, sortOrder } = req.query;
  let result = [...services];

  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.systemName.toLowerCase().includes(q) ||
        s.endpoint.toLowerCase().includes(q)
    );
  }
  if (status && status !== "all") {
    result = result.filter(s => s.status === status);
  }
  if (system && system !== "all") {
    result = result.filter(s => s.systemId === system || s.systemName === system);
  }
  if (environment && environment !== "all") {
    result = result.filter(s => s.environment === environment);
  }

  if (sortBy) {
    const field = String(sortBy);
    const isAsc = sortOrder === "asc";
    result.sort((a: any, b: any) => {
      const valA = a[field] ?? "";
      const valB = b[field] ?? "";
      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });
  }

  res.json(paginate(result, Number(page), Number(size)));
});

app.get("/api/v1/registry/services/:id", (req, res) => {
  const svc = services.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: "Service not found" });
  res.json(svc);
});

app.post("/api/v1/registry/services", (req, res) => {
  const body = req.body;
  const newSvc = {
    id: `svc-${Date.now().toString().slice(-4)}`,
    name: body.name || "new-microservice",
    type: body.type || "Microservice",
    version: body.version || "1.0.0",
    status: body.status || "healthy",
    systemId: body.systemId || "sys-01",
    systemName: body.systemName || "Payments & Financial Core",
    endpoint: body.endpoint || `https://${body.name || "service"}.platform.example.com/v1`,
    environment: body.environment || "production",
    hostedServicesCount: body.hostedServices?.length || 0,
    hostedServices: body.hostedServices || [],
    frameworkId: body.frameworkId,
    frameworkName: body.frameworkName,
    serverId: body.serverId,
    serverHostname: body.serverHostname,
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 100.0,
    rps: body.rps || 100,
    latencyMs: body.latencyMs || 25,
    errorRate: 0.0,
    description: body.description || "Newly created operational service"
  };
  services.unshift(newSvc);
  res.status(201).json(newSvc);
});

app.put("/api/v1/registry/services/:id", (req, res) => {
  const index = services.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Service not found" });
  services[index] = { ...services[index], ...req.body, lastHeartbeat: new Date().toISOString() };
  res.json(services[index]);
});

app.delete("/api/v1/registry/services/:id", (req, res) => {
  const index = services.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Service not found" });
  const deleted = services.splice(index, 1);
  res.json({ message: "Service deleted successfully", service: deleted[0] });
});

// --- FRAMEWORKS ENDPOINTS ---
app.get("/api/v1/registry/frameworks", (req, res) => {
  const { page, size, search } = req.query;
  let result = [...frameworks];
  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || f.language.toLowerCase().includes(q));
  }
  res.json(paginate(result, Number(page), Number(size)));
});

app.post("/api/v1/registry/frameworks", (req, res) => {
  const newFw = {
    id: `fw-${Date.now().toString().slice(-4)}`,
    name: req.body.name || "New Framework",
    category: req.body.category || "General",
    language: req.body.language || "TypeScript",
    version: req.body.version || "1.0.0",
    servicesCount: 0
  };
  frameworks.push(newFw);
  res.status(201).json(newFw);
});

app.put("/api/v1/registry/frameworks/:id", (req, res) => {
  const idx = frameworks.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Framework not found" });
  frameworks[idx] = { ...frameworks[idx], ...req.body };
  res.json(frameworks[idx]);
});

app.delete("/api/v1/registry/frameworks/:id", (req, res) => {
  const idx = frameworks.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Framework not found" });
  const deleted = frameworks.splice(idx, 1);
  res.json({ message: "Framework deleted", framework: deleted[0] });
});

// --- DEPLOYMENTS ENDPOINTS ---
app.get("/api/v1/registry/deployments", (req, res) => {
  const { page, size, search, status, environment } = req.query;
  let result = [...deployments];
  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(d => d.serviceName.toLowerCase().includes(q) || d.clusterName.toLowerCase().includes(q) || d.commitHash.toLowerCase().includes(q));
  }
  if (status && status !== "all") result = result.filter(d => d.status === status);
  if (environment && environment !== "all") result = result.filter(d => d.environment === environment);

  res.json(paginate(result, Number(page), Number(size)));
});

app.post("/api/v1/registry/deployments", (req, res) => {
  const body = req.body;
  const newDep = {
    id: `dep-${Date.now().toString().slice(-4)}`,
    serviceId: body.serviceId || "svc-01",
    serviceName: body.serviceName || "auth-gateway-svc",
    environment: body.environment || "production",
    version: body.version || "v1.0.0",
    status: body.status || "healthy",
    deployedAt: new Date().toISOString(),
    deployedBy: body.deployedBy || "platform-operator",
    replicasReady: body.replicasTarget || 4,
    replicasTarget: body.replicasTarget || 4,
    commitHash: body.commitHash || "a1b2c3d",
    clusterName: body.clusterName || "us-east-prod-k8s"
  };
  deployments.unshift(newDep);
  res.status(201).json(newDep);
});

app.put("/api/v1/registry/deployments/:id", (req, res) => {
  const idx = deployments.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Deployment not found" });
  deployments[idx] = { ...deployments[idx], ...req.body };
  res.json(deployments[idx]);
});

app.delete("/api/v1/registry/deployments/:id", (req, res) => {
  const idx = deployments.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Deployment not found" });
  const deleted = deployments.splice(idx, 1);
  res.json({ message: "Deployment deleted", deployment: deleted[0] });
});

// --- SERVERS ENDPOINTS ---
app.get("/api/v1/registry/servers", (req, res) => {
  const { page, size, search, status, environment } = req.query;
  let result = [...servers];
  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(s => s.name.toLowerCase().includes(q) || s.hostname.toLowerCase().includes(q) || s.ipAddress.includes(q) || s.datacenterRegion.toLowerCase().includes(q));
  }
  if (status && status !== "all") result = result.filter(s => s.status === status);
  if (environment && environment !== "all") result = result.filter(s => s.environment === environment);

  res.json(paginate(result, Number(page), Number(size)));
});

app.post("/api/v1/registry/servers", (req, res) => {
  const body = req.body;
  const newServer = {
    id: `srv-${Date.now().toString().slice(-4)}`,
    name: body.name || "k8s-node-new-01",
    hostname: body.hostname || "node.infra.internal",
    ipAddress: body.ipAddress || "10.128.1.100",
    serverType: body.serverType || "c6i.xlarge",
    operatingSystem: body.operatingSystem || "Ubuntu 22.04 LTS",
    environment: body.environment || "production",
    status: body.status || "healthy",
    cpuUsage: Math.floor(Math.random() * 30) + 15,
    memoryUsage: Math.floor(Math.random() * 40) + 30,
    diskUsage: 25,
    datacenterRegion: body.datacenterRegion || "us-east-1 (N. Virginia)",
    activePodsCount: 12,
    lastPing: new Date().toISOString()
  };
  servers.unshift(newServer);
  res.status(201).json(newServer);
});

app.put("/api/v1/registry/servers/:id", (req, res) => {
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Server not found" });
  servers[idx] = { ...servers[idx], ...req.body, lastPing: new Date().toISOString() };
  res.json(servers[idx]);
});

app.delete("/api/v1/registry/servers/:id", (req, res) => {
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Server not found" });
  const deleted = servers.splice(idx, 1);
  res.json({ message: "Server deleted", server: deleted[0] });
});

// --- LIBRARIES ENDPOINTS ---
app.get("/api/v1/registry/libraries", (req, res) => {
  const { page, size, search } = req.query;
  let result = [...libraries];
  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(l => l.name.toLowerCase().includes(q) || l.category.toLowerCase().includes(q) || l.language.toLowerCase().includes(q));
  }
  res.json(paginate(result, Number(page), Number(size)));
});

app.post("/api/v1/registry/libraries", (req, res) => {
  const newLib = {
    id: `lib-${Date.now().toString().slice(-4)}`,
    name: req.body.name || "New Library",
    category: req.body.category || "Utility",
    language: req.body.language || "TypeScript",
    version: req.body.version || "1.0.0",
    vulnerabilitiesCount: 0
  };
  libraries.push(newLib);
  res.status(201).json(newLib);
});

app.put("/api/v1/registry/libraries/:id", (req, res) => {
  const idx = libraries.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Library not found" });
  libraries[idx] = { ...libraries[idx], ...req.body };
  res.json(libraries[idx]);
});

app.delete("/api/v1/registry/libraries/:id", (req, res) => {
  const idx = libraries.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Library not found" });
  const deleted = libraries.splice(idx, 1);
  res.json({ message: "Library deleted", library: deleted[0] });
});

// --- SYSTEMS ENDPOINTS ---
app.get("/api/v1/registry/systems", (req, res) => {
  const { page, size, search } = req.query;
  let result = [...systems];
  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.owner.toLowerCase().includes(q));
  }
  res.json(paginate(result, Number(page), Number(size)));
});

app.post("/api/v1/registry/systems", (req, res) => {
  const newSys = {
    id: `sys-${Date.now().toString().slice(-4)}`,
    name: req.body.name || "New System Platform",
    description: req.body.description || "System platform architecture domain",
    owner: req.body.owner || "Platform DevOps",
    environment: req.body.environment || "production",
    status: "healthy",
    servicesCount: 0,
    services: [],
    tier: req.body.tier || "Tier 2 - Important"
  };
  systems.push(newSys);
  res.status(201).json(newSys);
});

app.put("/api/v1/registry/systems/:id", (req, res) => {
  const idx = systems.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "System not found" });
  systems[idx] = { ...systems[idx], ...req.body };
  res.json(systems[idx]);
});

app.delete("/api/v1/registry/systems/:id", (req, res) => {
  const idx = systems.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "System not found" });
  const deleted = systems.splice(idx, 1);
  res.json({ message: "System deleted", system: deleted[0] });
});

app.post("/api/v1/registry/systems/:systemName/services/:serviceName", (req, res) => {
  const { systemName, serviceName } = req.params;
  const sys = systems.find(s => s.name.toLowerCase() === systemName.toLowerCase() || s.id === systemName);
  const svc = services.find(s => s.name.toLowerCase() === serviceName.toLowerCase() || s.id === serviceName);

  if (!sys) return res.status(404).json({ error: "System not found" });
  if (!svc) return res.status(404).json({ error: "Service not found" });

  if (!sys.services.includes(svc.name)) {
    sys.services.push(svc.name);
    sys.servicesCount = sys.services.length;
  }
  svc.systemId = sys.id;
  svc.systemName = sys.name;

  res.json({ message: `Linked service ${svc.name} to system ${sys.name}`, system: sys, service: svc });
});

// --- LOOKUP TABLES ENDPOINTS ---
app.get("/api/v1/registry/:lookupType", (req, res, next) => {
  const { lookupType } = req.params;
  if (!lookupTables[lookupType]) {
    return next(); // Fallthrough to next route if not a valid lookup type
  }
  const { page, size } = req.query;
  res.json(paginate(lookupTables[lookupType], Number(page), Number(size)));
});

app.post("/api/v1/registry/:lookupType", (req, res, next) => {
  const { lookupType } = req.params;
  if (!lookupTables[lookupType]) return next();

  const newEntry = {
    id: `lk-${Date.now().toString().slice(-4)}`,
    key: req.body.key || "key-entry",
    name: req.body.name || "Lookup Entry Name",
    lookupType
  };
  lookupTables[lookupType].push(newEntry);
  res.status(201).json(newEntry);
});

app.put("/api/v1/registry/:lookupType/:id", (req, res, next) => {
  const { lookupType, id } = req.params;
  if (!lookupTables[lookupType]) return next();

  const idx = lookupTables[lookupType].findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Entry not found" });
  lookupTables[lookupType][idx] = { ...lookupTables[lookupType][idx], ...req.body };
  res.json(lookupTables[lookupType][idx]);
});

app.delete("/api/v1/registry/:lookupType/:id", (req, res, next) => {
  const { lookupType, id } = req.params;
  if (!lookupTables[lookupType]) return next();

  const idx = lookupTables[lookupType].findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Entry not found" });
  const deleted = lookupTables[lookupType].splice(idx, 1);
  res.json({ message: "Entry deleted", entry: deleted[0] });
});

// --- HEARTBEAT & SERVICE REGISTRATION ---
app.post("/api/v1/registry/register", (req, res) => {
  const { name, endpoint, version, systemName, environment } = req.body;
  const existing = services.find(s => s.name === name);
  if (existing) {
    existing.lastHeartbeat = new Date().toISOString();
    existing.status = "healthy";
    existing.version = version || existing.version;
    return res.json({ message: "Service re-registered & refreshed", service: existing });
  }

  const newSvc = {
    id: `svc-${Date.now().toString().slice(-4)}`,
    name: name || "registered-service",
    type: "Registered Microservice",
    version: version || "1.0.0",
    status: "healthy" as const,
    systemId: "sys-01",
    systemName: systemName || "Payments & Financial Core",
    endpoint: endpoint || "https://api.platform.example.com",
    environment: environment || "production",
    hostedServicesCount: 0,
    hostedServices: [],
    frameworkId: "fw-02",
    frameworkName: "Node.js Express",
    serverId: "srv-01",
    serverHostname: "k8s-node-us-east-01",
    lastHeartbeat: new Date().toISOString(),
    uptimePercent: 100.0,
    rps: 50,
    latencyMs: 15,
    errorRate: 0.0,
    description: "Self-registered heartbeat service"
  };
  services.unshift(newSvc);
  res.status(201).json({ message: "Service registered successfully", service: newSvc });
});

app.post("/api/v1/registry/heartbeat/:serviceName", (req, res) => {
  const { serviceName } = req.params;
  const svc = services.find(s => s.name.toLowerCase() === serviceName.toLowerCase() || s.id === serviceName);

  if (!svc) return res.status(404).json({ error: "Service not found for heartbeat" });

  svc.lastHeartbeat = new Date().toISOString();
  if (svc.status === "offline") {
    svc.status = "healthy";
  }
  res.json({
    message: `Heartbeat received for ${svc.name}`,
    serviceName: svc.name,
    status: svc.status,
    timestamp: svc.lastHeartbeat
  });
});

app.post("/api/v1/registry/deregister/:serviceName/graceful", (req, res) => {
  const { serviceName } = req.params;
  const svc = services.find(s => s.name.toLowerCase() === serviceName.toLowerCase() || s.id === serviceName);

  if (!svc) return res.status(404).json({ error: "Service not found" });

  svc.status = "offline";
  svc.lastHeartbeat = new Date().toISOString();
  res.json({ message: `Service ${svc.name} gracefully deregistered`, service: svc });
});

// --- AGGREGATE PLATFORM STATE ---
app.get("/api/v1/registry/aggregate", (req, res) => {
  const healthyCount = services.filter(s => s.status === "healthy").length + servers.filter(s => s.status === "healthy").length;
  const degradedCount = services.filter(s => s.status === "degraded").length + servers.filter(s => s.status === "degraded").length;
  const criticalCount = services.filter(s => s.status === "critical").length + servers.filter(s => s.status === "critical").length;
  const offlineCount = services.filter(s => s.status === "offline").length + servers.filter(s => s.status === "offline").length;

  const totalEntities = services.length + servers.length;
  const overallHealthPercent = Math.round((healthyCount / totalEntities) * 100) || 98;

  const totalRps = services.reduce((acc, curr) => acc + (curr.rps || 0), 0);
  const avgLatencyMs = Math.round(services.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0) / services.length) || 24;

  // Build graph nodes
  const nodes = [
    ...systems.map(sys => ({
      id: sys.id,
      label: sys.name,
      type: "system" as const,
      status: sys.status as any,
      systemName: sys.name,
      metricsSummary: `${sys.servicesCount} Services`
    })),
    ...services.map(svc => ({
      id: svc.id,
      label: svc.name,
      type: "service" as const,
      status: svc.status as any,
      systemName: svc.systemName,
      metricsSummary: `${svc.rps} RPS | ${svc.latencyMs}ms`
    })),
    ...servers.map(srv => ({
      id: srv.id,
      label: srv.name,
      type: "server" as const,
      status: srv.status as any,
      systemName: srv.datacenterRegion,
      metricsSummary: `CPU ${srv.cpuUsage}% | RAM ${srv.memoryUsage}%`
    }))
  ];

  // Build edges
  const edges: any[] = [];
  services.forEach(svc => {
    if (svc.systemId) {
      edges.push({
        id: `e-${svc.systemId}-${svc.id}`,
        source: svc.systemId,
        target: svc.id,
        label: "contains",
        status: svc.status
      });
    }
    if (svc.serverId) {
      edges.push({
        id: `e-${svc.id}-${svc.serverId}`,
        source: svc.id,
        target: svc.serverId,
        label: "hosted-on",
        status: svc.status
      });
    }
  });

  res.json({
    totalSystems: systems.length,
    totalServices: services.length,
    totalServers: servers.length,
    totalDeployments: deployments.length,
    healthyCount,
    degradedCount,
    criticalCount,
    offlineCount,
    overallHealthPercent,
    avgLatencyMs,
    totalRps,
    activeIncidentsCount: degradedCount + criticalCount,
    nodes,
    edges
  });
});

// --- LOGS & METRICS ENDPOINTS ---
app.get("/api/v1/registry/logs/:entityType/:entityId", (req, res) => {
  const { entityType, entityId } = req.params;
  const count = 30;
  const levels = ["info", "info", "info", "warn", "error", "debug"];
  const messages = [
    "Received HTTP GET /v1/healthcheck 200 OK - 2ms",
    "Database connection pool active: 12 connections",
    "Processing batch payload (248 records) from queue",
    "Cache hit ratio: 94.2% on Redis key namespace",
    "Slow query detected: SELECT * FROM transaction_ledger WHERE status = 'pending' (124ms)",
    "Failed to authenticate JWT token: Expired signature from 10.128.0.14",
    "Heartbeat ping broadcast acknowledged by registry server",
    "GC pause duration: 18ms (young generation collection)",
    "Rate limiter bucket consumed: 12 tokens remaining for key ip_35.210",
    "Outbound HTTP call to Stripe API completed with status 200 (42ms)"
  ];

  const now = Date.now();
  const logs = [];
  for (let i = 0; i < count; i++) {
    const time = new Date(now - (count - i) * 3000).toISOString();
    const lvl = levels[Math.floor(Math.random() * levels.length)];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    logs.push({
      id: `log-${i}-${Date.now()}`,
      timestamp: time,
      level: lvl,
      message: `[${entityType.toUpperCase()}:${entityId}] ${msg}`,
      serviceName: entityId,
      traceId: `tr-${Math.random().toString(36).substring(2, 9)}`
    });
  }

  res.json({ logs });
});

app.get("/api/v1/registry/metrics/:entityType/:entityId", (req, res) => {
  const now = Date.now();
  const points = [];
  for (let i = 15; i >= 0; i--) {
    const t = new Date(now - i * 60 * 1000);
    const timeLabel = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    points.push({
      timestamp: t.toISOString(),
      timeLabel,
      cpu: Math.min(100, Math.max(10, Math.floor(40 + Math.sin(i) * 20 + Math.random() * 15))),
      memory: Math.min(100, Math.max(20, Math.floor(60 + Math.cos(i) * 15 + Math.random() * 10))),
      latency: Math.max(5, Math.floor(20 + Math.sin(i * 0.5) * 15 + Math.random() * 25)),
      errorRate: Math.max(0, Number((Math.random() * 0.5).toFixed(2))),
      rps: Math.floor(1200 + Math.sin(i) * 400 + Math.random() * 200)
    });
  }
  res.json({ metrics: points });
});

// --- VITE MIDDLEWARE & SERVE INTEGRATION ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Platform Operations Registry Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
