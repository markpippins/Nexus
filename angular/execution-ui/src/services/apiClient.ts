import { mockStore } from './mockData';
import {
  RequestStateResponse,
  LeaseItem,
  LeaseLifecycleResponse,
  IntegrityScanResponse,
  PipelineOriginResponse,
  ExecutorFleetSummary,
  ExecutorFleetDetail,
  StatusDistributionResponse,
  RootHealthCheck,
  ExecutionInlineHealth,
  RequestLineageBuckets,
  RequestAttemptsTree
} from '../types';
import {
  mapRequestItem,
  mapLeaseItem,
  mapAttemptItem,
  mapReceiptItem,
  mapRootHealth,
  mapInlineHealth,
  mapRequestState,
  mapStaleLeases,
  mapLeaseLifecycle,
  mapIntegrityScan,
  mapRequestAttemptsTree,
  mapReceiptsLineage,
  mapFleetByExecutor,
  mapStatusDistribution,
  mapPipelineOrigin
} from './apiAdapters';

export interface ApiClientConfig {
  useMock: boolean;
  baseUrl: string; // Defaults to '/api/execution'
}

// Environment-selected mode is authoritative at startup: the live unit
// builds/runs without mock selected, so the client boots LIVE instead of
// defaulting to the mock store. Explicit mock is selected via the .env/build
// configuration (VITE_EXECUTION_USE_MOCK=true) or the in-UI toggle.
let clientConfig: ApiClientConfig = {
  useMock: (import.meta as any).env?.VITE_EXECUTION_USE_MOCK === 'true',
  baseUrl: '/api/execution'
};

export const getApiClientConfig = (): ApiClientConfig => ({ ...clientConfig });

export const setApiClientConfig = (config: Partial<ApiClientConfig>) => {
  clientConfig = { ...clientConfig, ...config };
};

// Helper for HTTP requests
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const executionApi = {
  // 0. Health checks
  async getRootHealth(): Promise<RootHealthCheck> {
    if (clientConfig.useMock) {
      return mockStore.getRootHealth();
    }
    const raw = await fetchJson<any>('/health');
    return mapRootHealth(raw);
  },

  async getInlineHealth(): Promise<ExecutionInlineHealth> {
    if (clientConfig.useMock) {
      return mockStore.getInlineHealth();
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/health`);
    return mapInlineHealth(raw);
  },

  // 1. Lifecycle state — aggregate root
  async getRequestState(id: string): Promise<RequestStateResponse | null> {
    if (clientConfig.useMock) {
      return mockStore.getRequestState(id);
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/requests/${encodeURIComponent(id)}/state`);
    return mapRequestState(raw);
  },

  // 2. Lease integrity — stale active leases & lifecycle
  async getStaleLeases(): Promise<LeaseItem[]> {
    if (clientConfig.useMock) {
      return mockStore.getStaleLeases();
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/leases/stale`);
    return mapStaleLeases(raw);
  },

  async getLeaseLifecycle(id: string): Promise<LeaseLifecycleResponse | null> {
    if (clientConfig.useMock) {
      return mockStore.getLeaseLifecycle(id);
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/leases/${encodeURIComponent(id)}/lifecycle`);
    return mapLeaseLifecycle(raw);
  },

  // 3. Cross-table consistency scan
  async getIntegrityScan(): Promise<IntegrityScanResponse> {
    if (clientConfig.useMock) {
      return mockStore.getIntegrityScan();
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/health/integrity-scan`);
    return mapIntegrityScan(raw);
  },

  // 4. Attempt/lease/request tree & lineage
  async getRequestAttemptsTree(requestId: string): Promise<RequestAttemptsTree | null> {
    if (clientConfig.useMock) {
      return mockStore.getRequestAttemptsTree(requestId);
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/requests/${encodeURIComponent(requestId)}/attempts`);
    return mapRequestAttemptsTree(raw, requestId);
  },

  async getReceiptsLineage(requestId: string): Promise<RequestLineageBuckets | null> {
    if (clientConfig.useMock) {
      return mockStore.getReceiptsLineage(requestId);
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/requests/${encodeURIComponent(requestId)}/receipts/lineage`);
    return mapReceiptsLineage(raw, requestId);
  },

  // 5. Fleet view
  async getFleetByExecutor(executorId?: string): Promise<ExecutorFleetSummary[] | ExecutorFleetDetail> {
    if (clientConfig.useMock) {
      return mockStore.getFleetByExecutor(executorId);
    }
    const url = executorId 
      ? `${clientConfig.baseUrl}/health/by-executor?executor_id=${encodeURIComponent(executorId)}`
      : `${clientConfig.baseUrl}/health/by-executor`;
    const raw = await fetchJson<any>(url);
    return mapFleetByExecutor(raw, executorId);
  },

  async getStatusDistribution(): Promise<StatusDistributionResponse> {
    if (clientConfig.useMock) {
      return mockStore.getStatusDistribution();
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/health/status-distribution`);
    return mapStatusDistribution(raw);
  },

  // 6. Pipeline Origin
  async getPipelineOrigin(receiptId: string): Promise<PipelineOriginResponse | null> {
    if (clientConfig.useMock) {
      return mockStore.getPipelineOrigin(receiptId);
    }
    const raw = await fetchJson<any>(`${clientConfig.baseUrl}/receipts/${encodeURIComponent(receiptId)}/pipeline-origin`);
    return mapPipelineOrigin(raw, receiptId);
  },

  // Direct collection listings for table views
  async listRequests(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listRequests(filter);
    }
    const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.search) params.set('search', filter.search);
      if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
      if (filter?.offset !== undefined) params.set('offset', String(filter.offset));

      const query = params.toString() ? `?${params.toString()}` : '';
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/requests${query}`);
      const items = (raw.items || []).map(mapRequestItem);
      return {
        total: Number(raw.total ?? items.length),
        items
      };
  },

  async listLeases(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listLeases(filter);
    }
    const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.search) params.set('search', filter.search);
      if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
      if (filter?.offset !== undefined) params.set('offset', String(filter.offset));

      const query = params.toString() ? `?${params.toString()}` : '';
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/leases${query}`);
      const items = (raw.items || []).map(mapLeaseItem);
      return {
        total: Number(raw.total ?? items.length),
        items
      };
  },

  async listAttempts(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listAttempts(filter);
    }
    const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.search) params.set('search', filter.search);
      if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
      if (filter?.offset !== undefined) params.set('offset', String(filter.offset));

      const query = params.toString() ? `?${params.toString()}` : '';
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/attempts${query}`);
      const items = (raw.items || []).map((item: any, idx: number) => mapAttemptItem(item, idx));
      return {
        total: Number(raw.total ?? items.length),
        items
      };
  },

  async listReceipts(filter?: { event_type?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listReceipts(filter);
    }
    const params = new URLSearchParams();
      if (filter?.event_type) params.set('type', filter.event_type); // Backend query param is 'type'
      if (filter?.search) params.set('search', filter.search);
      if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
      if (filter?.offset !== undefined) params.set('offset', String(filter.offset));

      const query = params.toString() ? `?${params.toString()}` : '';
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/receipts${query}`);
      const items = (raw.items || []).map(mapReceiptItem);
      return {
        total: Number(raw.total ?? items.length),
        items
      };
  }
};
