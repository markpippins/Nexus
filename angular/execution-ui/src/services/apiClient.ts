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

let clientConfig: ApiClientConfig = {
  useMock: true, // Default to true so preview runs instantly without requiring live DB setup
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
    try {
      const raw = await fetchJson<any>('/health');
      return mapRootHealth(raw);
    } catch {
      return mockStore.getRootHealth();
    }
  },

  async getInlineHealth(): Promise<ExecutionInlineHealth> {
    if (clientConfig.useMock) {
      return mockStore.getInlineHealth();
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/health`);
      return mapInlineHealth(raw);
    } catch {
      return mockStore.getInlineHealth();
    }
  },

  // 1. Lifecycle state — aggregate root
  async getRequestState(id: string): Promise<RequestStateResponse | null> {
    if (clientConfig.useMock) {
      return mockStore.getRequestState(id);
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/requests/${encodeURIComponent(id)}/state`);
      return mapRequestState(raw);
    } catch {
      return mockStore.getRequestState(id);
    }
  },

  // 2. Lease integrity — stale active leases & lifecycle
  async getStaleLeases(): Promise<LeaseItem[]> {
    if (clientConfig.useMock) {
      return mockStore.getStaleLeases();
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/leases/stale`);
      return mapStaleLeases(raw);
    } catch {
      return mockStore.getStaleLeases();
    }
  },

  async getLeaseLifecycle(id: string): Promise<LeaseLifecycleResponse | null> {
    if (clientConfig.useMock) {
      return mockStore.getLeaseLifecycle(id);
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/leases/${encodeURIComponent(id)}/lifecycle`);
      return mapLeaseLifecycle(raw);
    } catch {
      return mockStore.getLeaseLifecycle(id);
    }
  },

  // 3. Cross-table consistency scan
  async getIntegrityScan(): Promise<IntegrityScanResponse> {
    if (clientConfig.useMock) {
      return mockStore.getIntegrityScan();
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/health/integrity-scan`);
      return mapIntegrityScan(raw);
    } catch {
      return mockStore.getIntegrityScan();
    }
  },

  // 4. Attempt/lease/request tree & lineage
  async getRequestAttemptsTree(requestId: string): Promise<RequestAttemptsTree | null> {
    if (clientConfig.useMock) {
      return mockStore.getRequestAttemptsTree(requestId);
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/requests/${encodeURIComponent(requestId)}/attempts`);
      return mapRequestAttemptsTree(raw, requestId);
    } catch {
      return mockStore.getRequestAttemptsTree(requestId);
    }
  },

  async getReceiptsLineage(requestId: string): Promise<RequestLineageBuckets | null> {
    if (clientConfig.useMock) {
      return mockStore.getReceiptsLineage(requestId);
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/requests/${encodeURIComponent(requestId)}/receipts/lineage`);
      return mapReceiptsLineage(raw, requestId);
    } catch {
      return mockStore.getReceiptsLineage(requestId);
    }
  },

  // 5. Fleet view
  async getFleetByExecutor(executorId?: string): Promise<ExecutorFleetSummary[] | ExecutorFleetDetail> {
    if (clientConfig.useMock) {
      return mockStore.getFleetByExecutor(executorId);
    }
    try {
      const url = executorId 
        ? `${clientConfig.baseUrl}/health/by-executor?executor_id=${encodeURIComponent(executorId)}`
        : `${clientConfig.baseUrl}/health/by-executor`;
      const raw = await fetchJson<any>(url);
      return mapFleetByExecutor(raw, executorId);
    } catch {
      return mockStore.getFleetByExecutor(executorId);
    }
  },

  async getStatusDistribution(): Promise<StatusDistributionResponse> {
    if (clientConfig.useMock) {
      return mockStore.getStatusDistribution();
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/health/status-distribution`);
      return mapStatusDistribution(raw);
    } catch {
      return mockStore.getStatusDistribution();
    }
  },

  // 6. Pipeline Origin
  async getPipelineOrigin(receiptId: string): Promise<PipelineOriginResponse | null> {
    if (clientConfig.useMock) {
      return mockStore.getPipelineOrigin(receiptId);
    }
    try {
      const raw = await fetchJson<any>(`${clientConfig.baseUrl}/receipts/${encodeURIComponent(receiptId)}/pipeline-origin`);
      return mapPipelineOrigin(raw, receiptId);
    } catch {
      return mockStore.getPipelineOrigin(receiptId);
    }
  },

  // Direct collection listings for table views
  async listRequests(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listRequests(filter);
    }
    try {
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
    } catch {
      return mockStore.listRequests(filter);
    }
  },

  async listLeases(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listLeases(filter);
    }
    try {
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
    } catch {
      return mockStore.listLeases(filter);
    }
  },

  async listAttempts(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listAttempts(filter);
    }
    try {
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
    } catch {
      return mockStore.listAttempts(filter);
    }
  },

  async listReceipts(filter?: { event_type?: string; search?: string; limit?: number; offset?: number }) {
    if (clientConfig.useMock) {
      return mockStore.listReceipts(filter);
    }
    try {
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
    } catch {
      return mockStore.listReceipts(filter);
    }
  }
};
