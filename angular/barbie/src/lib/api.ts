/**
 * Centralized REST API Client for Platform Operations Registry API
 * Targets /api/v1/registry/* endpoints with support for switching between
 * Live REST Backend mode and Client Mock mode.
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
  HealthStatus
} from '../types';

import {
  mockServices,
  mockServers,
  mockDeployments,
  mockSystems,
  mockFrameworks,
  mockLibraries,
  mockLookups,
  mockAggregateState
} from './mockData';

// Storage keys
const STORAGE_MODE_KEY = 'platform_api_mode';
const STORAGE_URL_KEY = 'platform_api_base_url';

// Default to 'mock' mode since there's no real backend configured.
// In mock mode all data is served by the barbie Express server's embedded routes.
// Remove this file's .env BACKEND_URL and the systemd service's
// Environment=BACKEND_URL to keep the proxy disabled.
// Clear any stale 'live' mode from a previous browser session (no backend available).
if (localStorage.getItem(STORAGE_MODE_KEY) === 'live') {
  localStorage.removeItem(STORAGE_MODE_KEY);
}
let currentMode: 'live' | 'mock' = (localStorage.getItem(STORAGE_MODE_KEY) as 'live' | 'mock') || 'mock';
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

export const registryApi = {
  // Mode & Configuration Controls
  getApiMode: (): 'live' | 'mock' => currentMode,
  setApiMode: (mode: 'live' | 'mock') => {
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
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.system) query.append('system', params.system);
    if (params?.environment) query.append('environment', params.environment);
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);

    return fetchJson<PaginatedResponse<Service>>(`${currentBaseUrl}/services?${query.toString()}`);
  },

  getServicesWithHosted: async (size = 1000): Promise<PaginatedResponse<Service>> => {
    if (currentMode === 'mock') {
      return {
        data: mockServices,
        meta: { page: 1, size: mockServices.length, totalItems: mockServices.length, totalPages: 1 }
      };
    }
    return fetchJson<PaginatedResponse<Service>>(`${currentBaseUrl}/services/with-hosted?size=${size}`);
  },

  getServiceById: async (id: string): Promise<Service> => {
    if (currentMode === 'mock') {
      const found = mockServices.find(s => s.id === id) || mockServices[0];
      return found;
    }
    return fetchJson<Service>(`${currentBaseUrl}/services/${id}`);
  },

  getServiceDetails: async (serviceName: string): Promise<{ service: Service; deployments: Deployment[]; server?: Server }> => {
    if (currentMode === 'mock') {
      const svc = mockServices.find(s => s.name === serviceName) || mockServices[0];
      const deps = mockDeployments.filter(d => d.serviceName === serviceName);
      const srv = mockServers.find(s => s.id === svc.serverId);
      return { service: svc, deployments: deps, server: srv };
    }
    return fetchJson(`${currentBaseUrl}/services/${encodeURIComponent(serviceName)}/details`);
  },

  getServicesByOperation: async (operation: string): Promise<{ data: Service[]; operation: string }> => {
    if (currentMode === 'mock') {
      return { data: mockServices, operation };
    }
    return fetchJson(`${currentBaseUrl}/services/by-operation/${encodeURIComponent(operation)}`);
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
    return fetchJson<Service>(`${currentBaseUrl}/services`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
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
    return fetchJson<Service>(`${currentBaseUrl}/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteService: async (id: string): Promise<{ message: string; service: Service }> => {
    if (currentMode === 'mock') {
      const idx = mockServices.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockServices.splice(idx, 1)[0] : mockServices[0];
      return { message: 'Mock deleted', service: removed };
    }
    return fetchJson(`${currentBaseUrl}/services/${id}`, {
      method: 'DELETE'
    });
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
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.environment) query.append('environment', params.environment);

    return fetchJson<PaginatedResponse<Server>>(`${currentBaseUrl}/servers?${query.toString()}`);
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
    return fetchJson<Server>(`${currentBaseUrl}/servers`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateServer: async (id: string, data: Partial<Server>): Promise<Server> => {
    if (currentMode === 'mock') {
      const idx = mockServers.findIndex(s => s.id === id);
      if (idx !== -1) mockServers[idx] = { ...mockServers[idx], ...data };
      return mockServers[0];
    }
    return fetchJson<Server>(`${currentBaseUrl}/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteServer: async (id: string): Promise<{ message: string; server: Server }> => {
    if (currentMode === 'mock') {
      const idx = mockServers.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockServers.splice(idx, 1)[0] : mockServers[0];
      return { message: 'Mock server deleted', server: removed };
    }
    return fetchJson(`${currentBaseUrl}/servers/${id}`, {
      method: 'DELETE'
    });
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
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.environment) query.append('environment', params.environment);

    return fetchJson<PaginatedResponse<Deployment>>(`${currentBaseUrl}/deployments?${query.toString()}`);
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
    return fetchJson<Deployment>(`${currentBaseUrl}/deployments`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateDeployment: async (id: string, data: Partial<Deployment>): Promise<Deployment> => {
    if (currentMode === 'mock') {
      const idx = mockDeployments.findIndex(d => d.id === id);
      if (idx !== -1) mockDeployments[idx] = { ...mockDeployments[idx], ...data };
      return mockDeployments[0];
    }
    return fetchJson<Deployment>(`${currentBaseUrl}/deployments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteDeployment: async (id: string): Promise<{ message: string; deployment: Deployment }> => {
    if (currentMode === 'mock') {
      const idx = mockDeployments.findIndex(d => d.id === id);
      const removed = idx !== -1 ? mockDeployments.splice(idx, 1)[0] : mockDeployments[0];
      return { message: 'Mock deployment deleted', deployment: removed };
    }
    return fetchJson(`${currentBaseUrl}/deployments/${id}`, {
      method: 'DELETE'
    });
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
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);

    return fetchJson<PaginatedResponse<Framework>>(`${currentBaseUrl}/frameworks?${query.toString()}`);
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
    return fetchJson<Framework>(`${currentBaseUrl}/frameworks`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateFramework: async (id: string, data: Partial<Framework>): Promise<Framework> => {
    if (currentMode === 'mock') return mockFrameworks[0];
    return fetchJson<Framework>(`${currentBaseUrl}/frameworks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteFramework: async (id: string): Promise<{ message: string; framework: Framework }> => {
    if (currentMode === 'mock') {
      const idx = mockFrameworks.findIndex(f => f.id === id);
      const removed = idx !== -1 ? mockFrameworks.splice(idx, 1)[0] : mockFrameworks[0];
      return { message: 'Mock framework deleted', framework: removed };
    }
    return fetchJson(`${currentBaseUrl}/frameworks/${id}`, {
      method: 'DELETE'
    });
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
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);

    return fetchJson<PaginatedResponse<Library>>(`${currentBaseUrl}/libraries?${query.toString()}`);
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
    return fetchJson<Library>(`${currentBaseUrl}/libraries`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateLibrary: async (id: string, data: Partial<Library>): Promise<Library> => {
    if (currentMode === 'mock') return mockLibraries[0];
    return fetchJson<Library>(`${currentBaseUrl}/libraries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteLibrary: async (id: string): Promise<{ message: string; library: Library }> => {
    if (currentMode === 'mock') {
      const idx = mockLibraries.findIndex(l => l.id === id);
      const removed = idx !== -1 ? mockLibraries.splice(idx, 1)[0] : mockLibraries[0];
      return { message: 'Mock library deleted', library: removed };
    }
    return fetchJson(`${currentBaseUrl}/libraries/${id}`, {
      method: 'DELETE'
    });
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
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);

    return fetchJson<PaginatedResponse<System>>(`${currentBaseUrl}/systems?${query.toString()}`);
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
    return fetchJson<System>(`${currentBaseUrl}/systems`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateSystem: async (id: string, data: Partial<System>): Promise<System> => {
    if (currentMode === 'mock') return mockSystems[0];
    return fetchJson<System>(`${currentBaseUrl}/systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteSystem: async (id: string): Promise<{ message: string; system: System }> => {
    if (currentMode === 'mock') {
      const idx = mockSystems.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockSystems.splice(idx, 1)[0] : mockSystems[0];
      return { message: 'Mock system deleted', system: removed };
    }
    return fetchJson(`${currentBaseUrl}/systems/${id}`, {
      method: 'DELETE'
    });
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
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));

    return fetchJson<PaginatedResponse<LookupEntry>>(`${currentBaseUrl}/${type}?${query.toString()}`);
  },

  createLookupEntry: async (type: LookupType, data: { key: string; name: string }): Promise<LookupEntry> => {
    if (currentMode === 'mock') {
      const entry: LookupEntry = { id: `lk-${Date.now()}`, lookupType: type, key: data.key, name: data.name };
      if (!mockLookups[type]) mockLookups[type] = [];
      mockLookups[type].push(entry);
      return entry;
    }
    return fetchJson<LookupEntry>(`${currentBaseUrl}/${type}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  deleteLookupEntry: async (type: LookupType, id: string): Promise<{ message: string }> => {
    if (currentMode === 'mock') {
      if (mockLookups[type]) {
        mockLookups[type] = mockLookups[type].filter(x => x.id !== id);
      }
      return { message: 'Mock lookup deleted' };
    }
    return fetchJson(`${currentBaseUrl}/${type}/${id}`, {
      method: 'DELETE'
    });
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
    return fetchJson(`${currentBaseUrl}/register`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
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
    return fetchJson(`${currentBaseUrl}/deregister/${encodeURIComponent(serviceName)}/graceful`, {
      method: 'POST'
    });
  },

  // --- AGGREGATE PLATFORM STATE ---
  getPlatformAggregate: async (): Promise<PlatformAggregateState> => {
    if (currentMode === 'mock') {
      return {
        ...mockAggregateState,
        totalServices: mockServices.length,
        totalServers: mockServers.length,
        totalDeployments: mockDeployments.length
      };
    }
    return fetchJson<PlatformAggregateState>(`${currentBaseUrl}/aggregate`);
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
  }
};
