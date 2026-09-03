/**
 * Centralized REST API Client for Platform Operations Registry API
 *
 * Live-only. All reads/writes target the real Nexus backend (proxied by the
 * barbie express server via BACKEND_URL) and the Ballerina CI-gateway moat
 * (Jenkins / SonarQube / Ballerina Central via /gateway). There is no mock
 * fallback: a feature either returns real data or surfaces the backend error.
 *
 * Live normalization maps the real service-registry backend shapes into
 * barbie's front-end contracts (see DRIFT_REPORT.md). The backend serves:
 *   - systems / registration / aggregate / logs / metrics under /api/v1/registry/*
 *   - services / frameworks / deployments / servers / libraries / lookups flat under /api/v1/*
 *   - Jenkins / SonarQube / Ballerina through the CI-gateway (/gateway/*)
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

// Storage keys
const STORAGE_URL_KEY = 'platform_api_base_url';

// Server-injected bootstrap config (see injectConfig in server.ts). Present
// only when a real backend is proxied. Live-only: apiMode is always 'live'.
const SERVER_CONFIG = (typeof window !== 'undefined' && (window as any).__BARBIE_CONFIG__) ||
  (undefined as { terrainUrl?: string } | undefined);

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
// The ci-gateway moat fronts external systems (Jenkins/SonarQube on vanadium,
// Ballerina Central). Those upstreams may be offline (e.g. running barbie on a
// laptop without vanadium). We surface a structured, typed error so the views
// can render an explicit "unavailable" state instead of a fake-empty table.

export class GatewayUpstreamError extends Error {
  status: number;
  upstream?: string;
  detail?: string;
  constructor(status: number, message: string, upstream?: string, detail?: string) {
    super(message);
    this.name = 'GatewayUpstreamError';
    this.status = status;
    this.upstream = upstream;
    this.detail = detail;
  }
}

// ── sonar-sync reads (canonical `sonar` schema mirror) ────────────
// browser -> :3010 /sonar-sync/* -> loopback ballerina sonar-sync :9096.
// Read-only surface; review writeback happens agent-side.
const SONAR_SYNC_BASE = '/sonar-sync';

export interface SonarIssueRow {
  key: string;
  sonar_type?: string | null;
  severity?: string | null;
  status?: string | null;
  resolution?: string | null;
  component_key?: string | null;
  line?: number | null;
  rule_key?: string | null;
  message?: string | null;
  review_status?: string | null;
  review_owner?: string | null;
  first_seen_at?: string | null;
  updated_at?: string | null;
}

export interface SonarHotspotRow {
  key: string;
  security_category?: string | null;
  vulnerability_probability?: string | null;
  status?: string | null;
  resolution?: string | null;
  component_key?: string | null;
  line?: number | null;
  rule_key?: string | null;
  message?: string | null;
  review_status?: string | null;
  review_owner?: string | null;
  first_seen_at?: string | null;
  updated_at?: string | null;
}

export interface SonarListEnvelope<T> {
  items: T[];
  count: number;
}

async function sonarSyncJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const q = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
  }
  const qs = q.toString();
  let res: Response;
  try {
    res = await fetch(`${SONAR_SYNC_BASE}${path}${qs ? `?${qs}` : ''}`, { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    throw new GatewayUpstreamError(0, `sonar-sync unreachable: ${e?.message ?? e}`, 'sonar-sync', e?.message ?? String(e));
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new GatewayUpstreamError(res.status, `sonar-sync error ${res.status}: ${text.slice(0, 200) || res.statusText}`, 'sonar-sync', text.slice(0, 200));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GatewayUpstreamError(0, 'sonar-sync returned non-JSON response', 'sonar-sync', text.slice(0, 200));
  }
}

// Review writeback — POSTs against the sonar-sync moat (hotspot review /
// issue transition). Both the upstream action and the local review_status
// update happen server-side; the UI just refreshes its list after.
async function sonarSyncPost<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const q = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
  }
  const qs = q.toString();
  let res: Response;
  try {
    res = await fetch(`${SONAR_SYNC_BASE}${path}${qs ? `?${qs}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    throw new GatewayUpstreamError(0, `sonar-sync unreachable: ${e?.message ?? e}`, 'sonar-sync', e?.message ?? String(e));
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new GatewayUpstreamError(res.status, `sonar-sync writeback error ${res.status}: ${text.slice(0, 200)}`, 'sonar-sync', text.slice(0, 200));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GatewayUpstreamError(0, 'sonar-sync returned non-JSON response', 'sonar-sync', text.slice(0, 200));
  }
}

async function gatewayJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/gateway${path}`, { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    // ci-gateway itself unreachable (barbie proxy -> :9095).
    throw new GatewayUpstreamError(0, `CI gateway unreachable: ${e?.message ?? e}`, 'ci-gateway', e?.message ?? String(e));
  }

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    // ci-gateway returns 502 {status:"upstream-failure", upstream, detail}
    // when the upstream (vanadium's Jenkins/Sonar, or Ballerina Central) is down.
    let upstream: string | undefined;
    let detail: string | undefined;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.upstream === 'string') upstream = parsed.upstream;
      if (typeof parsed?.detail === 'string') detail = parsed.detail;
    } catch { /* not JSON — fall through */ }
    throw new GatewayUpstreamError(res.status, `Gateway error ${res.status}: ${text || res.statusText}`, upstream, detail);
  }

  let env: { data: T };
  try {
    env = JSON.parse(text);
  } catch {
    throw new GatewayUpstreamError(0, 'Gateway returned non-JSON response', undefined, text.slice(0, 200));
  }
  return env.data;
}

function jenkinsColorToStatus(color: string | undefined): JenkinsJob['status'] {
  const c = (color ?? '').toLowerCase();
  if (c.includes('anime')) return 'building';
  if (c.startsWith('blue')) return 'success';
  if (c.startsWith('red')) return 'failure';
  if (c.startsWith('yellow')) return 'unstable';
  if (c.startsWith('aborted') || c.startsWith('disabled')) return 'aborted';
  if (c.startsWith('notbuilt') || c === '') return 'not_built';
  return 'not_built';
}

function jenkinsResultToStatus(result: string | undefined): JenkinsBuild['status'] {
  const r = (result ?? '').toUpperCase();
  if (r === 'SUCCESS') return 'success';
  if (r === 'FAILURE' || r === 'ABORTED') return 'failure';
  if (r === 'UNSTABLE') return 'unstable';
  if (r === 'NOT_BUILT') return 'not_built';
  return 'success';
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
  // Base URL config (live-only; no mock mode exists any longer)
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
    const raw = await fetchJson<any>(`${currentBaseUrl}/services/with-hosted?size=${size}`);
    return normalizePaged(raw, mapService);
  },

  getServiceById: async (id: string): Promise<Service> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${id}`);
    return mapService(raw);
  },

  getServiceDetails: async (serviceName: string): Promise<{ service: Service; deployments: Deployment[]; server?: Server }> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${encodeURIComponent(serviceName)}/details`);
    return {
      service: raw.service ? mapService(raw.service) : mapService(raw),
      deployments: Array.isArray(raw.deployments) ? raw.deployments.map(mapDeployment) : [],
      server: raw.server ? mapServer(raw.server) : undefined,
    };
  },

  getServicesByOperation: async (operation: string): Promise<{ data: Service[]; operation: string }> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/by-operation/${encodeURIComponent(operation)}`);
    const items = Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : []);
    return { data: items.map(mapService), operation };
  },

  getServiceSubModules: async (id: string): Promise<Array<Record<string, unknown>>> => {
    // Parity with console manage-services node: browse declared sub-modules
    // of a service (backend route GET /api/v1/services/{id}/sub-modules).
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${id}/sub-modules`);
    return Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : []);
  },

  createService: async (data: Partial<Service>): Promise<Service> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapService(raw);
  },

  updateService: async (id: string, data: Partial<Service>): Promise<Service> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapService(raw);
  },

  deleteService: async (id: string): Promise<{ message: string; service: Service }> => {
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
    const raw = await fetchJson<any>(`${flatBaseUrl()}/servers`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapServer(raw);
  },

  updateServer: async (id: string, data: Partial<Server>): Promise<Server> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapServer(raw);
  },

  deleteServer: async (id: string): Promise<{ message: string; server: Server }> => {
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
    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapDeployment(raw);
  },

  updateDeployment: async (id: string, data: Partial<Deployment>): Promise<Deployment> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapDeployment(raw);
  },

  deleteDeployment: async (id: string): Promise<{ message: string; deployment: Deployment }> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', deployment: mapDeployment(raw?.deployment ?? raw) };
  },

  // Deployment lifecycle ops (D-BP-1): POST /deployments/{id}/start|stop|restart.
  // Idempotent server-side; a 409 invalid-transition surfaces as an error message.
  deploymentLifecycle: async (id: string, op: 'start' | 'stop' | 'restart'): Promise<{ changed: boolean; status: string; message: string }> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/deployments/${id}/${op}`, {
      method: 'POST'
    });
    return {
      changed: Boolean(raw?.changed),
      status: raw?.status ?? 'unknown',
      message: raw?.message ?? `${op} acknowledged`
    };
  },

  // View logs: reuse the existing registry logs surface (GET /registry/logs/deployment/{id}).
  viewDeploymentLogs: async (id: string): Promise<unknown> => {
    return fetchJson<any>(`${flatBaseUrl()}/registry/logs/deployment/${id}`);
  },

  // View config: compose the existing config route via the deployment's service id.
  viewDeploymentConfig: async (serviceId: string): Promise<unknown> => {
    return fetchJson<any>(`${flatBaseUrl()}/configurations/service/${serviceId}`);
  },

  // --- FRAMEWORKS ---
  getFrameworks: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<Framework>> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);

    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks?${query.toString()}`);
    return normalizePaged(raw, mapFramework);
  },

  createFramework: async (data: Partial<Framework>): Promise<Framework> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapFramework(raw);
  },

  updateFramework: async (id: string, data: Partial<Framework>): Promise<Framework> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapFramework(raw);
  },

  deleteFramework: async (id: string): Promise<{ message: string; framework: Framework }> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/frameworks/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', framework: mapFramework(raw?.framework ?? raw) };
  },

  // --- LIBRARIES ---
  getLibraries: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<Library>> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);

    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries?${query.toString()}`);
    return normalizePaged(raw, mapLibrary);
  },

  createLibrary: async (data: Partial<Library>): Promise<Library> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapLibrary(raw);
  },

  updateLibrary: async (id: string, data: Partial<Library>): Promise<Library> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapLibrary(raw);
  },

  deleteLibrary: async (id: string): Promise<{ message: string; library: Library }> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/libraries/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', library: mapLibrary(raw?.library ?? raw) };
  },

  // --- SYSTEMS ---
  getSystems: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<System>> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));
    if (params?.search) query.append('search', params.search);

    // NOTE: backend returns a raw array (no paged envelope) for /registry/systems.
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems?${query.toString()}`);
    return normalizePaged(raw, mapSystem);
  },

  createSystem: async (data: Partial<System>): Promise<System> => {
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapSystem(raw);
  },

  updateSystem: async (id: string, data: Partial<System>): Promise<System> => {
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return mapSystem(raw);
  },

  deleteSystem: async (id: string): Promise<{ message: string; system: System }> => {
    const raw = await fetchJson<any>(`${currentBaseUrl}/systems/${id}`, {
      method: 'DELETE'
    });
    return { message: raw?.message ?? 'Deleted', system: mapSystem(raw?.system ?? raw) };
  },

  linkServiceToSystem: async (systemName: string, serviceName: string): Promise<any> => {
    return fetchJson(`${currentBaseUrl}/systems/${encodeURIComponent(systemName)}/services/${encodeURIComponent(serviceName)}`, {
      method: 'POST'
    });
  },

  // --- LOOKUP TABLES ---
  getLookupEntries: async (type: LookupType, params?: { page?: number; size?: number }): Promise<PaginatedResponse<LookupEntry>> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page - 1)); // backend 0-indexed
    if (params?.size) query.append('per_page', String(params.size));

    const raw = await fetchJson<any>(`${flatBaseUrl()}/${type}?${query.toString()}`);
    return normalizePaged(raw, (item) => mapLookup(type, item));
  },

  createLookupEntry: async (type: LookupType, data: { key: string; name: string }): Promise<LookupEntry> => {
    const raw = await fetchJson<any>(`${flatBaseUrl()}/${type}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return mapLookup(type, raw);
  },

  deleteLookupEntry: async (type: LookupType, id: string): Promise<{ message: string }> => {
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
    const raw = await fetchJson<any>(`${currentBaseUrl}/register`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return { message: raw?.message ?? 'Registered', service: mapService(raw?.service ?? raw) };
  },

  sendHeartbeat: async (serviceName: string): Promise<{ message: string; timestamp: string; status: string }> => {
    return fetchJson(`${currentBaseUrl}/heartbeat/${encodeURIComponent(serviceName)}`, {
      method: 'POST'
    });
  },

  deregisterServiceGraceful: async (serviceName: string): Promise<{ message: string; service: Service }> => {
    const raw = await fetchJson<any>(`${currentBaseUrl}/deregister/${encodeURIComponent(serviceName)}/graceful`, {
      method: 'POST'
    });
    return { message: raw?.message ?? 'Deregistered', service: mapService(raw?.service ?? raw) };
  },

  // --- AGGREGATE PLATFORM STATE ---
  getTerrainHealth: async (): Promise<TerrainHealthSummary> => {
    return _terrainHealth();
  },

  getServiceStatus: async (serviceName: string): Promise<Record<string, unknown>> => {
    // Real backend route (D-BP-1 verified): ServiceStatusController
    // GET /api/v1/status/{serviceName} — flat under /api/v1.
    return fetchJson<Record<string, unknown>>(`${flatBaseUrl()}/status/${encodeURIComponent(serviceName)}`);
  },

  getPlatformAggregate: async (): Promise<PlatformAggregateState> => {
    const raw = await fetchJson<any>(`${currentBaseUrl}/aggregate`);
    return mapAggregate(raw);
  },

  // --- LOGS & METRICS ---
  getLogs: async (entityType: string, entityId: string): Promise<{ logs: LogEntry[] }> => {
    return fetchJson(`${currentBaseUrl}/logs/${entityType}/${encodeURIComponent(entityId)}`);
  },

  getMetrics: async (entityType: string, entityId: string): Promise<{ metrics: MetricPoint[] }> => {
    return fetchJson(`${currentBaseUrl}/metrics/${entityType}/${encodeURIComponent(entityId)}`);
  },

// --- JENKINS CI/CD ---
  getJenkinsJobs: async (params?: {
    search?: string;
    status?: string;
  }): Promise<JenkinsJob[]> => {
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
    // Live build history from the ci-gateway moat (per-job Jenkins API).
    const raw = await gatewayJson<{
      builds?: Array<{
        number?: number;
        result?: string;
        timestamp?: number;
        duration?: number;
        url?: string;
        changeSet?: { items?: Array<{ commitId?: string }> };
      }>;
    }>(`/jenkins/jobs/${jobId}/builds`);
    return (raw?.builds ?? []).map((b, i) => ({
      id: `${jobId}-${b.number ?? i}`,
      jobId,
      jobName: decodeURIComponent(jobId),
      buildNumber: b.number ?? 0,
      status: jenkinsResultToStatus(b.result),
      timestamp: b.timestamp ? new Date(b.timestamp).toISOString() : '',
      duration: Math.round((b.duration ?? 0) / 1000), // ms → seconds
      scmBranch: '',
      commitHash: b.changeSet?.items?.[0]?.commitId ?? '',
      triggeredBy: 'ci',
      consoleUrl: b.url ? `${b.url}console` : '',
    }));
  },

  // --- SONARQUBE CODE QUALITY ---
  getSonarProjects: async (params?: {
    search?: string;
    gate?: string;
  }): Promise<SonarListEnvelope<SonarProject>> => {
    // Live path rides the ballerina ci-gateway, which loops ALL pages of
    // SonarQube's /api/components/search so the list is never silently
    // truncated as the TRK count grows; the count is the filtered total.
    type SonarComp = { key?: string; name?: string; qualifier?: string };
    const raw = await gatewayJson<{ paging?: { total?: number }; components?: SonarComp[] }>('/sonar/projects');
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
    return { items: projects, count: projects.length };
  },

  getSonarMetrics: async (projectId: string): Promise<SonarMetricPoint[]> => {
    // Live coverage/quality measures per project via the ci-gateway moat.
    const raw = await gatewayJson<{
      measures?: Array<{ metric?: string; value?: string }>;
    }>(`/sonar/measures?component=${encodeURIComponent(projectId)}`);

    const get = (k: string): number => {
      const m = (raw.measures ?? []).find((x) => x.metric === k);
      return Number(m?.value ?? 0);
    };
    const rating = (k: string): SonarRating => {
      const v = get(k);
      const map: Record<number, SonarRating> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };
      return map[Math.round(v)] ?? 'A';
    };

    return [{
      id: `${projectId}-live`,
      projectId,
      projectKey: projectId,
      timestamp: new Date().toISOString(),
      coveragePercent: get('coverage'),
      duplicationsPercent: get('duplicated_lines_density'),
      reliabilityRating: rating('reliability_rating'),
      securityRating: rating('security_rating'),
      maintainabilityRating: rating('sqale_rating'),
    }];
  },

  // --- BALLERINA INTEGRATION PLATFORM ---
  getBallerinaPackages: async (params?: {
    search?: string;
  }): Promise<BallerinaPackage[]> => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    // Live Ballerina Central search via the ci-gateway moat. The gateway
    // returns the raw registry envelope { packages: [...] } under data.
    const raw = await gatewayJson<{ packages?: any[] }>(`/ballerina/packages?${query.toString()}`);
    // Map Central's registry shape → barbie's BallerinaPackage contract.
    return (raw?.packages ?? []).map((p) => ({
      id: String(p.id ?? `${p.organization}/${p.name}`),
      org: p.organization ?? p.org ?? '',
      name: p.name ?? '',
      version: p.version ?? '',
      platform: p.platform ?? p.ballerinaVersion ?? '',
      license: Array.isArray(p.licenses) ? (p.licenses[0] ?? '') : (p.license ?? ''),
      description: p.summary ?? p.description ?? '',
      dependencies: Array.isArray(p.dependencies)
        ? p.dependencies.map((d: any) => ({ org: d.organization ?? d.org, name: d.name, version: d.version }))
        : [],
      lastUpdated: p.createdDate ? new Date(p.createdDate).toISOString() : '',
    }));
  },

  getBallerinaServices: async (params?: {
    search?: string;
    status?: string;
  }): Promise<BallerinaService[]> => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    // Live Ballerina runtime services via the ci-gateway moat.
    return gatewayJson<BallerinaService[]>(`/ballerina/services?${query.toString()}`);
  },

  // Canonical `sonar` schema reads (mirrored from SonarQube by sonar-sync).
  getSonarIssues: async (params?: {
    severity?: string;
    issueType?: string;
    status?: string;
    query?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SonarListEnvelope<SonarIssueRow>> => {
    return sonarSyncJson<SonarListEnvelope<SonarIssueRow>>('/issues', params);
  },

  getSonarHotspots: async (params?: {
    category?: string;
    status?: string;
    query?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SonarListEnvelope<SonarHotspotRow>> => {
    return sonarSyncJson<SonarListEnvelope<SonarHotspotRow>>('/hotspots', params);
  },

  // Realm review writebacks (mirrored into the `sonar` schema + SonarQube).
  reviewHotspot: async (key: string, action: 'safe' | 'fixed' | 'accept-risk', owner?: string) => {
    return sonarSyncPost<{ ok: boolean; key: string }>('/hotspotReview', { hotspotKey: key, action, owner });
  },

  reviewIssue: async (key: string, transition: 'resolve' | 'wontfix' | 'falsepositive', owner?: string) => {
    return sonarSyncPost<{ ok: boolean; key: string }>('/issueReview', { issueKey: key, transition, owner });
  }
};