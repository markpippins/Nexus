/**
 * Centralized REST API Client for Platform Operations Registry API
 * Targets /api/v1/registry/* endpoints with support for switching between
 * Live REST Backend mode and Client Mock mode.
 *
 * Live mode normalizes the real Nexus service-registry backend shapes into
 * barbie's front-end contracts (see DRIFT_REPORT.md). The backend serves:
 *   - systems / registration / aggregate / logs / metrics under /api/v1/registry/*
 *   - services / frameworks / deployments / servers / libraries / lookups flat under /api/v1/*
 */

import {
  Service,
  Server,
  Deployment,
  Framework,
  Library,
  System,
  LookupEntry,
  LookupType,
  PaginatedResponse,
  LogEntry,
  MetricPoint,
  PlatformAggregateState,
  Environment,
  HealthStatus,
  JenkinsJob,
  JenkinsBuild,
  SonarProject,
  SonarRating,
  QualityGateStatus,
  SonarMetricPoint,
  BallerinaPackage,
  BallerinaService
} from '../types';

import {
  mockServices,
  mockServers,
  mockDeployments,
  mockSystems,
  mockFrameworks,
  mockLibraries,
  mockLookups,
  mockAggregateState,
  mockJenkinsJobs,
  mockJenkinsBuilds,
  mockSonarProjects,
  mockSonarMetrics,
  mockBallerinaPackages,
  mockBallerinaServices
} from './mockData';

// Storage keys
const STORAGE_MODE_KEY = 'platform_api_mode';
const STORAGE_URL_KEY = 'platform_api_base_url';

// Server-injected bootstrap config (see injectConfig in server.ts).
// When present it is AUTHORITATIVE: the express proxy knows a real
// backend is in front of us, so stale localStorage cannot flip the UI
// back into mock mode.
const SERVER_CONFIG = (typeof window !== 'undefined' && (window as any).__BARBIE_CONFIG__) ||
  (undefined as { apiMode?: 'live' | 'mock' } | undefined);

function storedMode(): 'live' | 'mock' | null {
  const v = localStorage.getItem(STORAGE_MODE_KEY);
  return v === 'live' || v === 'mock' ? v : null;
}

let currentMode: 'live' | 'mock' = SERVER_CONFIG?.apiMode ?? storedMode() ?? 'live';
let currentBaseUrl: string = localStorage.getItem(STORAGE_URL_KEY) || '/api/v1/registry';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json();
}

// ── Live-mode normalization layer ───────────────────────────────────

// ── Terrain platform health (barbie-parity #16) ─────────────────────
// Base URL: server-injected bootstrap → localStorage override → console
// default (Spring Boot terrain on :8084).
const TERRAIN_URL: string = SERVER_CONFIG?.terrainUrl
  || localStorage.getItem('platform_terrain_url')
  || 'http://localhost:8084';

export interface TerrainHealthSummary {
  terrainUp: boolean;
  terrainError?: string;
  loadedAt: string;
  mcp: { total: number; online: number; offline: number };
  services: { total: number; online: number; offline: number };
  servers: { total: number; online: number; offline: number };
  // Raw items for the terrain-backed topology view (#11). Loose-typed on
  // purpose — terrain owns these shapes (console terrain.service.ts models).
  mcpItems: Array<Record<string, unknown>>;
  serviceItems: Array<Record<string, unknown>>;
  serverItems: Array<Record<string, unknown>>;
}

function _countBlock(block: any): { total: number; online: number; offline: number } {
  return {
    total: Number(block?.total ?? 0),
    online: Number(block?.online ?? 0),
    offline: Number(block?.offline ?? block?.degraded ?? 0)
  };
}

async function _terrainHealth(): Promise<TerrainHealthSummary> {
  try {
    const raw = await fetchJson<any>(`${TERRAIN_URL}/api/v1/platform/health`);
    return {
      terrainUp: Boolean(raw.terrainUp),
      loadedAt: new Date().toISOString(),
      mcp: _countBlock(raw.mcpServers),
      services: _countBlock(raw.runnableServices),
      servers: _countBlock(raw.hostServers),
      mcpItems: Array.isArray(raw.mcpServers?.items) ? raw.mcpServers.items : [],
      serviceItems: Array.isArray(raw.runnableServices?.items) ? raw.runnableServices.items : [],
      serverItems: Array.isArray(raw.hostServers?.items) ? raw.hostServers.items : []
    };
  } catch (e: any) {
    return {
      terrainUp: false,
      terrainError: `Unable to reach terrain at ${TERRAIN_URL}: ${e?.message ?? e}`,
      loadedAt: new Date().toISOString(),
      mcp: { total: 0, online: 0, offline: 0 },
      services: { total: 0, online: 0, offline: 0 },
      servers: { total: 0, online: 0, offline: 0 },
      mcpItems: [],
      serviceItems: [],
      serverItems: []
    };
  }
}

// currentBaseUrl defaults to /api/v1/registry. Flat entity endpoints live
// directly under /api/v1 (no /registry segment), so derive that base.
// External profiles (http://host:8085) also need /api/v1 appended since
// the service-registry's entity routes live under that prefix.
function flatBaseUrl(): string {
  const stripped = currentBaseUrl.replace(/\/registry\/?$/, '');
  // External registry profile URLs (http(s)://...) that lack /api/v1
  // need the prefix appended — entity endpoints live there.
  if (/^https?:\/\//.test(stripped) && !stripped.includes('/api/v1')) {
    return stripped.replace(/\/$/, '') + '/api/v1';
  }
  return stripped;
}

// Map backend uppercase enums → barbie lowercase HealthStatus.
function toHealthStatus(raw: unknown): HealthStatus {
  const s = String(raw ?? '').toUpperCase();
  if (['ACTIVE', 'HEALTHY', 'RUNNING', 'UP'].includes(s)) return 'healthy';
  if (['DEGRADED', 'DEPRECATED', 'WARNING'].includes(s)) return 'degraded';
  if (['UNHEALTHY', 'CRITICAL', 'FAILED', 'DOWN'].includes(s)) return 'critical';
  return 'offline'; // ARCHIVED, INACTIVE, STOPPED, DECOMMISSIONED, unknown
}

// Convert backend paged envelope { data, meta: { page, per_page, total, last_page } }
// → barbie { data, meta: { page, size, totalItems, totalPages } }. Handles raw arrays.
function normalizePaged<T>(raw: any, mapper: (item: any) => T): PaginatedResponse<T> {
  const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : []);
  const meta = (raw && raw.meta) || {};
  const total = Number(meta.total ?? items.length);
  const perPage = Number(meta.per_page ?? items.length);
  const lastPage = Number(meta.last_page ?? (perPage > 0 ? Math.ceil(total / perPage) : 0));
  return {
    data: items.map(mapper),
    meta: {
      // Backend is 0-indexed; barbie UI is 1-indexed.
    page: Number(meta.page ?? 0) + 1,
      size: perPage,
      totalItems: total,
      totalPages: lastPage,
    },
  };
}

function mapService(s: any): Service {
  return {
    id: String(s.id ?? ''),
    name: s.name ?? '',
    type: s.type?.name ?? 'Unknown',
    version: s.version ?? 'n/a',
    status: toHealthStatus(s.status),
    systemId: s.systemId != null ? String(s.systemId) : '',
    systemName: s.systemName ?? '',
    endpoint: s.apiBasePath ?? s.endpoint ?? '',
    environment: (s.environment as Environment) ?? 'production',
    hostedServicesCount: Number(s.hostedServicesCount ?? 0),
    hostedServices: Array.isArray(s.hostedServices) ? s.hostedServices : [],
    frameworkId: s.frameworkId != null ? String(s.frameworkId) : undefined,
    frameworkName: s.framework?.name ?? '',
    serverId: s.serverId != null ? String(s.serverId) : undefined,
    serverHostname: s.serverHostname ?? undefined,
    lastHeartbeat: s.updatedAt ?? s.lastHeartbeat ?? '',
    uptimePercent: Number(s.uptimePercent ?? 0),
    rps: Number(s.rps ?? 0),
    latencyMs: Number(s.latencyMs ?? 0),
    errorRate: Number(s.errorRate ?? 0),
    description: s.description ?? '',
  };
}

function mapServer(s: any): Server {
  return {
    id: String(s.id ?? ''),
    name: s.name ?? s.hostname ?? '',
    hostname: s.hostname ?? '',
    ipAddress: s.ipAddress ?? '',
    serverType: s.type?.name ?? s.serverType ?? '',
    operatingSystem: s.operatingSystem?.name ?? s.operatingSystem ?? '',
    environment: (s.environmentType?.name?.toLowerCase() as Environment) ?? (s.environment as Environment) ?? 'production',
    status: toHealthStatus(s.status),
    cpuUsage: Number(s.cpuUsage ?? 0),
    memoryUsage: Number(s.memoryUsage ?? 0),
    diskUsage: Number(s.diskUsage ?? 0),
    datacenterRegion: s.region ?? s.datacenterRegion ?? '',
    activePodsCount: Number(s.activePodsCount ?? 0),
    lastPing: s.updatedAt ?? s.lastPing ?? '',
  };
}

function mapDeployment(d: any): Deployment {
  return {
    id: String(d.id ?? ''),
    serviceId: d.serviceId != null ? String(d.serviceId) : '',
    serviceName: d.service?.name ?? d.serviceName ?? '',
    environment: (d.environment as Environment) ?? 'production',
    version: d.version ?? '',
    status: toHealthStatus(d.healthStatus ?? d.status),
    deployedAt: d.deployedAt ?? d.updatedAt ?? '',
    deployedBy: d.deployedBy ?? '',
    replicasReady: Number(d.replicasReady ?? 0),
    replicasTarget: Number(d.replicasTarget ?? 0),
    commitHash: d.commitHash ?? '',
    clusterName: d.clusterName ?? '',
  };
}

function mapFramework(f: any): Framework {
  return {
    id: String(f.id ?? ''),
    name: f.name ?? '',
    category: f.category?.name ?? f.category ?? '',
    language: f.language?.name ?? f.language ?? '',
    version: f.currentVersion ?? f.latestVersion ?? f.version ?? '',
    servicesCount: f.servicesCount != null ? Number(f.servicesCount) : undefined,
  };
}

function mapLibrary(l: any): Library {
  return {
    id: String(l.id ?? ''),
    name: l.name ?? '',
    category: l.category?.name ?? l.category ?? '',
    language: l.language?.name ?? l.language ?? '',
    version: l.currentVersion ?? l.version ?? '',
    vulnerabilitiesCount: Number(l.vulnerabilitiesCount ?? 0),
  };
}

function mapSystem(s: any): System {
  return {
    id: String(s.id ?? ''),
    name: s.name ?? '',
    description: s.description ?? '',
    owner: s.owner ?? '',
    environment: (s.environment as Environment) ?? 'production',
    status: s.activeFlag === false ? 'offline' : 'healthy',
    servicesCount: Number(s.servicesCount ?? 0),
    services: Array.isArray(s.services) ? s.services : [],
    tier: (s.tier as System['tier']) ?? 'Tier 3 - Standard',
  };
}

function mapLookup(type: LookupType, l: any): LookupEntry {
  return {
    id: String(l.id ?? ''),
    lookupType: type,
    key: l.key ?? l.name ?? '',
    name: l.name ?? '',
    description: l.description,
  };
}

function mapAggregate(raw: any): PlatformAggregateState {
  return {
    totalSystems: Number(raw.totalSystems ?? 0),
    totalServices: Number(raw.totalServices ?? 0),
    totalServers: Number(raw.totalServers ?? 0),
    totalDeployments: Number(raw.totalDeployments ?? 0),
    healthyCount: Number(raw.healthyCount ?? 0),
    degradedCount: Number(raw.degradedCount ?? 0),
    criticalCount: Number(raw.criticalCount ?? 0),
    offlineCount: Number(raw.offlineCount ?? 0),
    overallHealthPercent: Number(raw.overallHealthPercent ?? 0),
    avgLatencyMs: Number(raw.avgLatencyMs ?? 0),
    totalRps: Number(raw.totalRps ?? 0),
    activeIncidentsCount: Number(raw.activeIncidentsCount ?? 0),
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
}

// ── CI-gateway (ballerina :9095 via /gateway passthrough) ──────────
async function gatewayJson<T>(path: string): Promise<T> {
  const env = await fetchJson<{ data: T }>(`/gateway${path}`);
  return env.data;
}

function jenkinsColorToStatus(color: string | undefined): JenkinsJobStatus {
  const c = (color ?? '').toLowerCase();
  if (c.includes('anime')) return 'building';
  if (c.startsWith('blue')) return 'success';
  if (c.startsWith('red')) return 'failure';
  if (c.startsWith('yellow')) return 'unstable';
  if (c.startsWith('aborted') || c.startsWith('disabled')) return 'aborted';
  if (c.startsWith('notbuilt') || c === '') return 'not_built';
  return 'not_built';
}

// ── Registry / Broker-Gateway profiles (barbie-parity #13/#14) ──────
// Barbie-local address book persisted in localStorage. A 'registry'
// profile can be set ACTIVE — that repoints every DataView via the
// existing platform_api_base_url storage key.
export interface BarbieProfile {
  id: string;
  name: string;
  baseUrl: string;
  kind: 'registry' | 'broker';
}

const PROFILES_KEY = 'platform_profiles';

export function getProfiles(): BarbieProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveProfiles(list: BarbieProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}

export async function testProfileConnection(
  profile: Pick<BarbieProfile, 'kind' | 'baseUrl'>
): Promise<{ ok: boolean; detail: string }> {
  const base = profile.baseUrl.replace(/\/$/, '');
  // Try primary path first; fall back to Spring Boot actuator for registries.
  const paths = profile.kind === 'broker'
    ? ['/actuator/health']
    : ['/health', '/actuator/health'];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const started = Date.now();
  try {
    for (const path of paths) {
      const res = await fetch(`${base}${path}`, { signal: controller.signal });
      const ms = Date.now() - started;
      if (res.ok) return { ok: true, detail: `reachable (${ms}ms, HTTP ${res.status} via ${path})` };
    }
    const ms = Date.now() - started;
    return { ok: false, detail: `unreachable (tried ${paths.join(', ')}, ${ms}ms)` };
  } catch (e: any) {
    const ms = Date.now() - started;
    if (e?.name === 'AbortError') return { ok: false, detail: `timeout after ${Date.now() - started}ms` };
    return { ok: false, detail: `${e?.message ?? e} (${ms}ms)` };
  } finally {
    clearTimeout(timer);
  }
}

export const registryApi = {
  // Mode & Configuration Controls
  getApiMode: (): 'live' | 'mock' => currentMode,
  setApiMode: (mode: 'live' | 'mock') => {
    if (SERVER_CONFIG?.apiMode) return; // server-authoritative — ignore toggle
    currentMode = mode;
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  },
  getApiBaseUrl: (): string => currentBaseUrl,
  setApiBaseUrl: (url: string) => {
    currentBaseUrl = url || '/api/v1/registry';
    localStorage.setItem(STORAGE_URL_KEY, currentBaseUrl);
  },

  // --- SERVICES ---
  getServices: async (params?: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    system?: string;
    environment?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Service>> => {
    if (currentMode === 'mock') {
      let items = [...mockServices];
      if (params?.search) {
        const s = params.search.toLowerCase();
        items = items.filter(x => x.name.toLowerCase().includes(s) || x.type.toLowerCase().includes(s));
      }
      return {
        data: items,
        meta: { page: 1, size: items.length, totalItems: items.length, totalPages: 1 }
      };
    }

    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.system) query.append('system', params.system);
    if (params?.environment) query.append('environment', params.environment);
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);

    const raw = await fetchJson<any>(`${flatBaseUrl()}/services?${query.toString()}`);
    return normalizePaged(raw, mapService);
  },

  getServicesWithHosted: async (size = 1000): Promise<PaginatedResponse<Service>> => {
    if (currentMode === 'mock') {
      return {
        data: mockServices,
        meta: { page: 1, size: mockServices.length, totalItems: mockServices.length, totalPages: 1 }
      };
    }
    const raw = await fetchJson<any>(`${currentBaseUrl}/services/with-hosted?size=${size}`);
    return normalizePaged(raw, mapService);
  },

  getServiceById: async (id: string): Promise<Service> => {
    if (currentMode === 'mock') {
      const found = mockServices.find(s => s.id === id) || mockServices[0];
      return found;
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${id}`);
    return mapService(raw);
  },

  getServiceDetails: async (serviceName: string): Promise<{ service: Service; deployments: Deployment[]; server?: Server }> => {
    if (currentMode === 'mock') {
      const svc = mockServices.find(s => s.name === serviceName) || mockServices[0];
      const deps = mockDeployments.filter(d => d.serviceName === serviceName);
      const srv = mockServers.find(s => s.id === svc.serverId);
      return { service: svc, deployments: deps, server: srv };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${encodeURIComponent(serviceName)}/details`);
    return {
      service: raw.service ? mapService(raw.service) : mapService(raw),
      deployments: Array.isArray(raw.deployments) ? raw.deployments.map(mapDeployment) : [],
      server: raw.server ? mapServer(raw.server) : undefined,
    };
  },

  getServicesByOperation: async (operation: string): Promise<{ data: Service[]; operation: string }> => {
    if (currentMode === 'mock') {
      return { data: mockServices, operation };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/by-operation/${encodeURIComponent(operation)}`);
    const items = Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : []);
    return { data: items.map(mapService), operation };
  },

  getServiceSubModules: async (id: string): Promise<Array<Record<string, unknown>>> => {
    // Parity with console manage-services node: browse declared sub-modules
    // of a service (backend route GET /api/v1/services/{id}/sub-modules).
    if (currentMode === 'mock') {
      const svc = mockServices.find(s => s.id === id);
      return [
        { name: `${svc?.name ?? 'mock'}-core`, version: svc?.version ?? '1.0.0', status: 'active' },
        { name: `${svc?.name ?? 'mock'}-admin`, version: svc?.version ?? '1.0.0', status: 'active' }
      ];
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${id}/sub-modules`);
    return Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : []);
  },

  createService: async (data: Partial<Service>): Promise<Service> => {
    if (currentMode === 'mock') {
      const newSvc: Service = {
        id: `svc-mock-${Date.now()}`,
        name: data.name || 'new-mock-svc',
        type: data.type || 'Microservice',
        version: data.version || '1.0.0',
        status: (data.status as HealthStatus) || 'healthy',
        systemId: data.systemId || 'sys-mock-01',
        systemName: data.systemName || 'Payments & Financial Core (Mock)',
        endpoint: data.endpoint || 'https://mock.internal/v1',
        environment: (data.environment as Environment) || 'production',
        hostedServicesCount: 0,
        hostedServices: [],
        frameworkId: 'fw-01',
        frameworkName: 'Node.js Express',
        serverId: 'srv-mock-01',
        serverHostname: 'mock-node-01',
        lastHeartbeat: new Date().toISOString(),
        uptimePercent: 100,
        rps: 10,
        errorRate: 0,
        latencyMs: 12,
        description: data.description || 'Mock created service'
      };
      mockServices.push(newSvc);
      return newSvc;
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapService(raw);
  },

  updateService: async (id: string, data: Partial<Service>): Promise<Service> => {
    if (currentMode === 'mock') {
      const index = mockServices.findIndex(s => s.id === id);
      if (index !== -1) {
        mockServices[index] = { ...mockServices[index], ...data };
        return mockServices[index];
      }
      return mockServices[0];
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapService(raw);
  },

  deleteService: async (id: string): Promise<{ message: string; service: Service }> => {
    if (currentMode === 'mock') {
      const idx = mockServices.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockServices.splice(idx, 1)[0] : mockServices[0];
      return { message: 'Mock deleted', service: removed };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', service: mapService(raw?.service ?? raw) };
  },

  // --- SERVERS ---
  getServers: async (params?: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    environment?: string;
  }): Promise<PaginatedResponse<Server>> => {
    if (currentMode === 'mock') {
      return {
        data: mockServers,
        meta: { page: 1, size: mockServers.length, totalItems: mockServers.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.environment) query.append('environment', params.environment);

    const raw = await fetchJson<any>(`${flatBaseUrl()}/servers?${query.toString()}`);
    return normalizePaged(raw, mapServer);
  },

  createServer: async (data: Partial<Server>): Promise<Server> => {
    if (currentMode === 'mock') {
      const srv: Server = {
        id: `srv-mock-${Date.now()}`,
        name: data.name || 'mock-server',
        hostname: data.hostname || 'mock-node.internal',
        ipAddress: data.ipAddress || '10.0.0.1',
        serverType: data.serverType || 'c6i.2xlarge',
        operatingSystem: 'Ubuntu 22.04 LTS',
        datacenterRegion: 'us-east-1',
        status: 'healthy',
        cpuUsage: 20,
        memoryUsage: 30,
        diskUsage: 15,
        activePodsCount: 5,
        lastPing: new Date().toISOString(),
        environment: 'production'
      };
      mockServers.push(srv);
      return srv;
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/servers`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapServer(raw);
  },

  updateServer: async (id: string, data: Partial<Server>): Promise<Server> => {
    if (currentMode === 'mock') {
      const idx = mockServers.findIndex(s => s.id === id);
      if (idx !== -1) mockServers[idx] = { ...mockServers[idx], ...data };
      return mockServers[0];
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapServer(raw);
  },

  deleteServer: async (id: string): Promise<{ message: string; server: Server }> => {
    if (currentMode === 'mock') {
      const idx = mockServers.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockServers.splice(idx, 1)[0] : mockServers[0];
      return { message: 'Mock server deleted', server: removed };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/servers/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', server: mapServer(raw?.server ?? raw) };
  },

  // --- DEPLOYMENTS ---
  getDeployments: async (params?: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    environment?: string;
  }): Promise<PaginatedResponse<Deployment>> => {
    if (currentMode === 'mock') {
      return {
        data: mockDeployments,
        meta: { page: 1, size: mockDeployments.length, totalItems: mockDeployments.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.environment) query.append('environment', params.environment);

    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments?${query.toString()}`);
    return normalizePaged(raw, mapDeployment);
  },

  createDeployment: async (data: Partial<Deployment>): Promise<Deployment> => {
    if (currentMode === 'mock') {
      const dep: Deployment = {
        id: `dep-mock-${Date.now()}`,
        serviceId: data.serviceId || 'svc-mock-01',
        serviceName: data.serviceName || 'mock-service',
        version: data.version || '1.0.0',
        clusterName: 'mock-k8s',
        replicasReady: 3,
        replicasTarget: 3,
        commitHash: 'm0ck999',
        deployedBy: 'Operator (Mock)',
        deployedAt: new Date().toISOString(),
        environment: 'production',
        status: 'healthy'
      };
      mockDeployments.push(dep);
      return dep;
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapDeployment(raw);
  },

  updateDeployment: async (id: string, data: Partial<Deployment>): Promise<Deployment> => {
    if (currentMode === 'mock') {
      const idx = mockDeployments.findIndex(d => d.id === id);
      if (idx !== -1) mockDeployments[idx] = { ...mockDeployments[idx], ...data };
      return mockDeployments[0];
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapDeployment(raw);
  },

  deleteDeployment: async (id: string): Promise<{ message: string; deployment: Deployment }> => {
    if (currentMode === 'mock') {
      const idx = mockDeployments.findIndex(d => d.id === id);
      const removed = idx !== -1 ? mockDeployments.splice(idx, 1)[0] : mockDeployments[0];
      return { message: 'Mock deployment deleted', deployment: removed };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', deployment: mapDeployment(raw?.deployment ?? raw) };
  },

  // --- FRAMEWORKS ---
  getFrameworks: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<Framework>> => {
    if (currentMode === 'mock') {
      return {
        data: mockFrameworks,
        meta: { page: 1, size: mockFrameworks.length, totalItems: mockFrameworks.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);

    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks?${query.toString()}`);
    return normalizePaged(raw, mapFramework);
  },

  createFramework: async (data: Partial<Framework>): Promise<Framework> => {
    if (currentMode === 'mock') {
      const fw: Framework = {
        id: `fw-m-${Date.now()}`,
        name: data.name || 'Mock Framework',
        category: data.category || 'Backend',
        language: data.language || 'TypeScript',
        version: data.version || '1.0.0',
        servicesCount: 0
      };
      mockFrameworks.push(fw);
      return fw;
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapFramework(raw);
  },

  updateFramework: async (id: string, data: Partial<Framework>): Promise<Framework> => {
    if (currentMode === 'mock') return mockFrameworks[0];
    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapFramework(raw);
  },

  deleteFramework: async (id: string): Promise<{ message: string; framework: Framework }> => {
    if (currentMode === 'mock') {
      const idx = mockFrameworks.findIndex(f => f.id === id);
      const removed = idx !== -1 ? mockFrameworks.splice(idx, 1)[0] : mockFrameworks[0];
      return { message: 'Mock framework deleted', framework: removed };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', framework: mapFramework(raw?.framework ?? raw) };
  },

  // --- LIBRARIES ---
  getLibraries: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<Library>> => {
    if (currentMode === 'mock') {
      return {
        data: mockLibraries,
        meta: { page: 1, size: mockLibraries.length, totalItems: mockLibraries.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);

    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries?${query.toString()}`);
    return normalizePaged(raw, mapLibrary);
  },

  createLibrary: async (data: Partial<Library>): Promise<Library> => {
    if (currentMode === 'mock') {
      const lib: Library = {
        id: `lib-m-${Date.now()}`,
        name: data.name || 'Mock Library',
        category: data.category || 'Utility',
        language: data.language || 'TypeScript',
        version: data.version || '1.0.0',
        vulnerabilitiesCount: 0
      };
      mockLibraries.push(lib);
      return lib;
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapLibrary(raw);
  },

  updateLibrary: async (id: string, data: Partial<Library>): Promise<Library> => {
    if (currentMode === 'mock') return mockLibraries[0];
    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapLibrary(raw);
  },

  deleteLibrary: async (id: string): Promise<{ message: string; library: Library }> => {
    if (currentMode === 'mock') {
      const idx = mockLibraries.findIndex(l => l.id === id);
      const removed = idx !== -1 ? mockLibraries.splice(idx, 1)[0] : mockLibraries[0];
      return { message: 'Mock library deleted', library: removed };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', library: mapLibrary(raw?.library ?? raw) };
  },

  // --- SYSTEMS ---
  getSystems: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<System>> => {
    if (currentMode === 'mock') {
      return {
        data: mockSystems,
        meta: { page: 1, size: mockSystems.length, totalItems: mockSystems.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);

    // NOTE: backend returns a raw array (no paged envelope) for /registry/systems.
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems?${query.toString()}`);
    return normalizePaged(raw, mapSystem);
  },

  createSystem: async (data: Partial<System>): Promise<System> => {
    if (currentMode === 'mock') {
      const sys: System = {
        id: `sys-mock-${Date.now()}`,
        name: data.name || 'Mock System Domain',
        description: data.description || 'Mock architecture domain',
        owner: data.owner || 'DevOps',
        tier: 'Tier 2 - Important',
        environment: 'production',
        status: 'healthy',
        servicesCount: 0,
        services: []
      };
      mockSystems.push(sys);
      return sys;
    }
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapSystem(raw);
  },

  updateSystem: async (id: string, data: Partial<System>): Promise<System> => {
    if (currentMode === 'mock') return mockSystems[0];
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapSystem(raw);
  },

  deleteSystem: async (id: string): Promise<{ message: string; system: System }> => {
    if (currentMode === 'mock') {
      const idx = mockSystems.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockSystems.splice(idx, 1)[0] : mockSystems[0];
      return { message: 'Mock system deleted', system: removed };
    }
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', system: mapSystem(raw?.system ?? raw) };
  },

  linkServiceToSystem: async (systemName: string, serviceName: string): Promise<any> => {
    if (currentMode === 'mock') {
      const sys = mockSystems.find(s => s.name === systemName);
      if (sys && !sys.services.includes(serviceName)) sys.services.push(serviceName);
      return { message: 'Mock service linked to system' };
    }
    return fetchJson(`${currentBaseUrl}/systems/${encodeURIComponent(systemName)}/services/${encodeURIComponent(serviceName)}`, {
      method: 'POST'
    });
  },

  // --- LOOKUP TABLES ---
  getLookupEntries: async (type: LookupType, params?: { page?: number; size?: number }): Promise<PaginatedResponse<LookupEntry>> => {
    if (currentMode === 'mock') {
      const list = mockLookups[type] || [];
      return {
        data: list,
        meta: { page: 1, size: list.length, totalItems: list.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));

    const raw = await fetchJson<any>(`${flatBaseUrl()}/${type}?${query.toString()}`);
    return normalizePaged(raw, (item) => mapLookup(type, item));
  },

  createLookupEntry: async (type: LookupType, data: { key: string; name: string }): Promise<LookupEntry> => {
    if (currentMode === 'mock') {
      const entry: LookupEntry = { id: `lk-${Date.now()}`, lookupType: type, key: data.key, name: data.name };
      if (!mockLookups[type]) mockLookups[type] = [];
      mockLookups[type].push(entry);
      return entry;
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/${type}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapLookup(type, raw);
  },

  deleteLookupEntry: async (type: LookupType, id: string): Promise<{ message: string }> => {
    if (currentMode === 'mock') {
      if (mockLookups[type]) {
        mockLookups[type] = mockLookups[type].filter(x => x.id !== id);
      }
      return { message: 'Mock lookup deleted' };
    }
    const raw = await fetchJson<any>(`${flatBaseUrl()}/${type}/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted' };
  },

  // --- REGISTRATION & HEARTBEAT ---
  registerService: async (data: {
    name: string;
    endpoint?: string;
    version?: string;
    systemName?: string;
    environment?: string;
  }): Promise<{ message: string; service: Service }> => {
    if (currentMode === 'mock') {
      const svc: Service = {
        id: `svc-reg-${Date.now()}`,
        name: data.name,
        type: 'Registered Microservice',
        version: data.version || '1.0.0',
        status: 'healthy',
        systemId: 'sys-mock-01',
        systemName: data.systemName || 'Payments & Financial Core (Mock)',
        endpoint: data.endpoint || 'https://api.internal/v1',
        environment: (data.environment as Environment) || 'production',
        hostedServicesCount: 0,
        hostedServices: [],
        frameworkId: 'fw-01',
        frameworkName: 'Node.js Express',
        serverId: 'srv-mock-01',
        serverHostname: 'mock-k8s-node-01',
        lastHeartbeat: new Date().toISOString(),
        uptimePercent: 100,
        rps: 0,
        errorRate: 0,
        latencyMs: 10,
        description: 'Mock registered service'
      };
      mockServices.push(svc);
      return { message: 'Mock registered', service: svc };
    }
    const raw = await fetchJson<any>(`${currentBaseUrl}/register`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return { message: raw?.message ?? 'Registered', service: mapService(raw?.service ?? raw) };
  },

  sendHeartbeat: async (serviceName: string): Promise<{ message: string; timestamp: string; status: string }> => {
    if (currentMode === 'mock') {
      return { message: 'Mock heartbeat acknowledged', timestamp: new Date().toISOString(), status: 'healthy' };
    }
    return fetchJson(`${currentBaseUrl}/heartbeat/${encodeURIComponent(serviceName)}`, {
      method: 'POST'
    });
  },

  deregisterServiceGraceful: async (serviceName: string): Promise<{ message: string; service: Service }> => {
    if (currentMode === 'mock') {
      const idx = mockServices.findIndex(s => s.name === serviceName);
      const removed = idx !== -1 ? mockServices.splice(idx, 1)[0] : mockServices[0];
      return { message: 'Mock deregistered', service: removed };
    }
    const raw = await fetchJson<any>(`${currentBaseUrl}/deregister/${encodeURIComponent(serviceName)}/graceful`, {
      method: 'POST'
    });
    return { message: raw?.message ?? 'Deregistered', service: mapService(raw?.service ?? raw) };
  },

  // --- AGGREGATE PLATFORM STATE ---
  getTerrainHealth: async (): Promise<TerrainHealthSummary> => {
    if (currentMode === 'mock') {
      return {
        terrainUp: true,
        loadedAt: new Date().toISOString(),
        mcp: { total: 6, online: 6, offline: 0 },
        services: { total: 40, online: 38, offline: 2 },
        servers: { total: 3, online: 3, offline: 0 },
        mcpItems: [
          { id: 'm1', name: 'conduit-mcp', port: 3100, status: 'ON' },
          { id: 'm2', name: 'nebula-mcp', port: 3102, status: 'ON' },
          { id: 'm3', name: 'terrain-mcp', port: 3130, status: 'ON' }
        ],
        serviceItems: [
          { id: 's1', name: 'assembly-srv', port: 3107, status: 'ON' },
          { id: 's2', name: 'nebula-srv', port: 3101, status: 'ON' },
          { id: 's3', name: 'cascade-srv', port: 3106, status: 'DEGRADED' },
          { id: 's4', name: 'wind-srv', port: 3300, status: 'ON' }
        ],
        serverItems: [
          { id: 'h1', hostname: 'titanium', ipAddress: '127.0.0.1', os: 'linux', status: 'ONLINE' },
          { id: 'h2', hostname: 'vanadium', ipAddress: '192.168.1.209', os: 'linux', status: 'ONLINE' }
        ]
      };
    }
    return _terrainHealth();
  },

  getServiceStatus: async (serviceName: string): Promise<Record<string, unknown>> => {
    // Real backend route (D-BP-1 verified): ServiceStatusController
    // GET /api/v1/status/{serviceName} — flat under /api/v1.
    if (currentMode === 'mock') {
      return { serviceName, status: 'healthy', lastHeartbeat: new Date().toISOString(), uptimeSeconds: 86400 };
    }
    return fetchJson<Record<string, unknown>>(`${flatBaseUrl()}/status/${encodeURIComponent(serviceName)}`);
  },

  getPlatformAggregate: async (): Promise<PlatformAggregateState> => {
    if (currentMode === 'mock') {
      return {
        ...mockAggregateState,
        totalServices: mockServices.length,
        totalServers: mockServers.length,
        totalDeployments: mockDeployments.length
      };
    }
    const raw = await fetchJson<any>(`${currentBaseUrl}/aggregate`);
    return mapAggregate(raw);
  },

  // --- LOGS & METRICS ---
  getLogs: async (entityType: string, entityId: string): Promise<{ logs: LogEntry[] }> => {
    if (currentMode === 'mock') {
      return {
        logs: [
          { id: 'l1', timestamp: new Date().toISOString(), level: 'info', message: `[MOCK LOG] Service ${entityId} initialized cleanly.` },
          { id: 'l2', timestamp: new Date(Date.now() - 5000).toISOString(), level: 'info', message: `[MOCK LOG] Database connection pool established.` },
          { id: 'l3', timestamp: new Date(Date.now() - 15000).toISOString(), level: 'debug', message: `[MOCK LOG] Handling inbound heartbeat ACK.` }
        ]
      };
    }
    return fetchJson(`${currentBaseUrl}/logs/${entityType}/${encodeURIComponent(entityId)}`);
  },

  getMetrics: async (entityType: string, entityId: string): Promise<{ metrics: MetricPoint[] }> => {
    if (currentMode === 'mock') {
      const now = Date.now();
      return {
        metrics: Array.from({ length: 10 }, (_, i) => {
          const time = new Date(now - (9 - i) * 10000);
          return {
            timestamp: time.toISOString(),
            timeLabel: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: Math.floor(Math.random() * 30 + 20),
            memory: Math.floor(Math.random() * 20 + 50),
            rps: Math.floor(Math.random() * 200 + 400),
            latency: Math.floor(Math.random() * 10 + 15),
            errorRate: 0.1
          };
        })
      };
    }
    return fetchJson(`${currentBaseUrl}/metrics/${entityType}/${encodeURIComponent(entityId)}`);
  },

  


// --- JENKINS CI/CD ---
  getJenkinsJobs: async (params?: {
    search?: string;
    status?: string;
  }): Promise<JenkinsJob[]> => {
    if (currentMode === 'mock') {
      let items = [...mockJenkinsJobs];
      if (params?.search) {
        const s = params.search.toLowerCase();
        items = items.filter(j => j.name.toLowerCase().includes(s));
      }
      if (params?.status && params.status !== 'all') {
        items = items.filter(j => j.status === params.status);
      }
      return items;
    }
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    // Live path rides the ballerina ci-gateway (registry has no CI data).
    type GhJob = { name?: string; color?: string; url?: string };
    const raw = await gatewayJson<GhJob[]>('/jenkins/jobs');
    let jobs: JenkinsJob[] = (raw ?? []).map((j, i) => ({
      id: encodeURIComponent(j.name ?? String(i)),
      name: j.name ?? `job-${i}`,
      url: j.url ?? '',
      status: jenkinsColorToStatus(j.color),
      lastBuildNumber: 0,
      lastBuildTimestamp: '',
      lastBuildDuration: 0,
      scmBranch: '',
      triggeredBy: 'ci',
    }));
    if (params?.search) {
      const q = params.search.toLowerCase();
      jobs = jobs.filter((j) => j.name.toLowerCase().includes(q));
    }
    if (params?.status && params.status !== 'all') {
      jobs = jobs.filter((j) => j.status === params.status);
    }
    return jobs;
  },

  getJenkinsBuilds: async (jobId: string): Promise<JenkinsBuild[]> => {
    if (currentMode === 'mock') {
      return mockJenkinsBuilds[jobId] || [];
    }
    // Build history needs per-job depth the read-only gateway doesn't
    // expose yet — return empty rather than erroring the table.
    return [];
  },

  // --- SONARQUBE CODE QUALITY ---
  getSonarProjects: async (params?: {
    search?: string;
    gate?: string;
  }): Promise<SonarProject[]> => {
    if (currentMode === 'mock') {
      let items = [...mockSonarProjects];
      if (params?.search) {
        const s = params.search.toLowerCase();
        items = items.filter(p => p.name.toLowerCase().includes(s) || p.key.toLowerCase().includes(s));
      }
      if (params?.gate && params.gate !== 'all') {
        items = items.filter(p => p.gate === params.gate);
      }
      return items;
    }
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.gate) query.append('gate', params.gate);
    // Live path rides the ballerina ci-gateway.
    type SonarComp = { key?: string; name?: string; qualifier?: string };
    const raw = await gatewayJson<{ paging?: unknown; components?: SonarComp[] }>('/sonar/projects');
    let projects: SonarProject[] = (raw.components ?? [])
      .filter((c) => (c.qualifier ?? 'TRK') === 'TRK')
      .map((c, i) => ({
        id: c.key ?? String(i),
        key: c.key ?? String(i),
        name: c.name ?? c.key ?? `project-${i}`,
        gate: 'none' as QualityGateStatus,
        reliabilityRating: 'A' as SonarRating,
        securityRating: 'A' as SonarRating,
        maintainabilityRating: 'A' as SonarRating,
        coveragePercent: 0,
        duplicationsPercent: 0,
        linesOfCode: 0,
        lastAnalysis: '',
        url: '',
      }));
    if (params?.search) {
      const q = params.search.toLowerCase();
      projects = projects.filter((p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q));
    }
    if (params?.gate && params.gate !== 'all') {
      projects = projects.filter((p) => p.gate === params.gate);
    }
    return projects;
  },

  getSonarMetrics: async (projectId: string): Promise<SonarMetricPoint[]> => {
    if (currentMode === 'mock') {
      return mockSonarMetrics[projectId] || [];
    }
    // No metrics endpoint on the read-only gateway yet.
    return [];
  },

  // --- BALLERINA INTEGRATION PLATFORM ---
  getBallerinaPackages: async (params?: {
    search?: string;
  }): Promise<BallerinaPackage[]> => {
    if (currentMode === 'mock') {
      let items = [...mockBallerinaPackages];
      if (params?.search) {
        const s = params.search.toLowerCase();
        items = items.filter(p =>
          p.name.toLowerCase().includes(s) ||
          p.org.toLowerCase().includes(s) ||
          `${p.org}/${p.name}`.toLowerCase().includes(s)
        );
      }
      return items;
    }
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    return fetchJson<BallerinaPackage[]>(`${flatBaseUrl()}/ballerina/packages?${query.toString()}`);
  },

  getBallerinaServices: async (params?: {
    search?: string;
    status?: string;
  }): Promise<BallerinaService[]> => {
    if (currentMode === 'mock') {
      let items = [...mockBallerinaServices];
      if (params?.search) {
        const s = params.search.toLowerCase();
        items = items.filter(svc => svc.name.toLowerCase().includes(s) || svc.endpoint.toLowerCase().includes(s));
      }
      if (params?.status && params.status !== 'all') {
        items = items.filter(svc => svc.status === params.status);
      }
      return items;
    }
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    return fetchJson<BallerinaService[]>(`${flatBaseUrl()}/ballerina/services?${query.toString()}`);
  }
};
