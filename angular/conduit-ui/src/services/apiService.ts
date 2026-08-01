import { friendlyFetchError } from '../utils/network-errors';
import { unwrapErrorMessage } from '../utils/response';
import {
  ServiceRootResponse,
  HealthzResponse,
  ReadyzResponse,
  SystemStatus,
  KernelDeltaInput,
  DeltaIngestResponse,
  DeltaStateSummary,
  KernelStateSummary,
  KernelIdentity,
  ReceiptItem,
  PlanDetailResponse,
  CrossPlanGraphResponse,
  LineageEventItem,
  ReplayStateResponse,
  ReplayCompareResponse,
  AdminIdentitiesResponse,
  EngineConsistencyResponse,
  KernelSession,
  BreakerStateResponse,
  FailureRecoveryConfig,
  ModelChainConfig,
  WorkflowListResponse,
  TicketDetectionResponse,
  TicketLineageResponse,
  TokenPlanUsageResponse,
  TokenRoleUsageResponse,
  TokenTicketUsageResponse,
  CronConfigResponse,
  GovernanceReplayResponse,
  GovernanceEventsResponse,
  VisionWorkRequestsResponse,
  VisionWorkRequestSingleResponse,
  VisionWorkRequestInput,
  VisionWorkRequestUpsertResponse,
  VisionReceiptsResponse,
} from '../types/conduit';

import {
  INITIAL_SYSTEM_STATUS,
  INITIAL_PLANS,
  INITIAL_MODEL_CHAINS,
} from './mockData';

const STORAGE_KEYS = {
  STATUS: 'nexus_system_status_v1',
  DELTAS: 'nexus_kernel_deltas_v2',
  RECEIPTS: 'nexus_receipts_v2',
  SESSIONS: 'nexus_sessions_v2',
  BREAKER: 'nexus_breaker_v2',
  LINEAGE: 'nexus_lineage_v2',
  IDENTITIES: 'nexus_identities_v2',
  USE_MOCK: 'nexus_use_mock_api_v1',
};

class ApiService {
  private useMock: boolean = true;
  private liveModeDetected: boolean | null = null; // null = not yet checked

  constructor() {
    const storedMock = localStorage.getItem(STORAGE_KEYS.USE_MOCK);
    if (storedMock !== null) {
      this.useMock = storedMock === 'true';
    } else {
      this.useMock = true;
    }
    this.initLocalStorage();
  }

  /**
   * Check the server's /api/status endpoint to determine if the server
   * is running in live mode (proxying to real backends). If so, disable
   * mock mode so the client fetches real data.
   *
   * Call this once on app mount, before any data refresh.
   */
  public async initializeMode(): Promise<boolean> {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const status = await res.json();
        if (status.liveMode === true) {
          this.useMock = false;
          this.liveModeDetected = true;
          localStorage.setItem(STORAGE_KEYS.USE_MOCK, 'false');
          return true;
        }
      }
    } catch (e) {
      console.warn('Could not reach /api/status to detect live mode — using mock', e);
    }
    this.liveModeDetected = false;
    return false;
  }

  public isMockMode(): boolean {
    return this.useMock;
  }

  public setMockMode(enabled: boolean): void {
    this.useMock = enabled;
    localStorage.setItem(STORAGE_KEYS.USE_MOCK, String(enabled));
  }

  /**
   * Live-mode request helper for mutations. Throws on any HTTP error (with
   * the backend's error message when available) instead of silently falling
   * through to the mock path — so a failed save/delete surfaces the real
   * error to the caller (which alerts it) rather than faking mock success.
   * Mirrors tackle-ui's requestOrThrow pattern for cross-UI consistency.
   */
  private async requestOrThrow(url: string, options: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, options);
    } catch (e) {
      // Map known fetch network-failure messages (shared util) to a friendlier
      // message so alerts don't show a cryptic string when the backend is
      // unreachable. Other errors pass through unchanged (non-Errors are
      // wrapped in an Error so the caller always receives an Error).
      throw friendlyFetchError(e);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      // Backends differ: tackle-srv returns { error: "string" }; the Python
      // kernel returns a nested envelope { error: { code, message } }. Unwrap
      // both (shared util) so alerts show the real message, never "[object Object]".
      throw new Error(unwrapErrorMessage(err, `Request failed (HTTP ${res.status})`));
    }
    return res;
  }

  private initLocalStorage(): void {
    if (!localStorage.getItem(STORAGE_KEYS.STATUS)) {
      localStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(INITIAL_SYSTEM_STATUS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.RECEIPTS)) {
      const initialReceipts: ReceiptItem[] = [
        {
          id: 'RCP-PLAN-0053-1',
          plan_id: 'plan_0053',
          type: 'PROPOSED',
          agent_role: 'planner',
          session_id: 'sess-1001',
          ticket_id: 'TCK-2026-0053',
          artifact_path: 'IMPLEMENTATION_PLANS/pending/auth-module.md',
          summary: 'Initial proposal for Auth Module',
          metadata_json: '{"initiator": "planner_agent"}',
          tokens_used: 1200,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'RCP-PLAN-0053-2',
          plan_id: 'plan_0053',
          type: 'PLAN_CREATE',
          agent_role: 'planner',
          session_id: 'sess-1001',
          ticket_id: 'TCK-2026-0053',
          artifact_path: 'IMPLEMENTATION_PLANS/active/auth-module.md',
          summary: 'Plan created and validated',
          metadata_json: '{"consensus": 95}',
          tokens_used: 2400,
          created_at: new Date(Date.now() - 1800000).toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(initialReceipts));
    }

    if (!localStorage.getItem(STORAGE_KEYS.SESSIONS)) {
      const initialSessions: KernelSession[] = [
        {
          id: 'sess-1001',
          role: 'planner',
          state: 'running',
          detail: 'Decomposing plan_0053 requirements',
          pid: 14201,
          cost_usd: 1.25,
          started_at: new Date(Date.now() - 3600000).toISOString(),
          last_heartbeat: new Date().toISOString(),
        },
        {
          id: 'sess-1002',
          role: 'builder',
          state: 'running',
          detail: 'Executing test harness for plan_0054',
          pid: 14205,
          cost_usd: 3.50,
          started_at: new Date(Date.now() - 1800000).toISOString(),
          last_heartbeat: new Date().toISOString(),
        },
        {
          id: 'sess-1003',
          role: 'reviewer',
          state: 'stale',
          detail: 'Awaiting signature validation',
          pid: 13900,
          cost_usd: 0.45,
          started_at: new Date(Date.now() - 7200000).toISOString(),
          last_heartbeat: new Date(Date.now() - 4000000).toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(initialSessions));
    }

    if (!localStorage.getItem(STORAGE_KEYS.BREAKER)) {
      const initialBreaker: BreakerStateResponse = {
        tripped: false,
        paused: false,
        retry_after: 1800,
        source: '',
        error: '',
        detail: '',
        tripped_at: null,
        max_retries_per_model: 3,
        retry_delay_seconds: 120,
        max_fallbacks: 3,
        push_back_to_pending: true,
      };
      localStorage.setItem(STORAGE_KEYS.BREAKER, JSON.stringify(initialBreaker));
    }

    if (!localStorage.getItem(STORAGE_KEYS.IDENTITIES)) {
      const initialIdentities = [
        {
          id: 'iden::plan_0053',
          aliases: ['plan_0053', '0053', 'auth-module-v2'],
          label: 'Plan 0053 — Auth Module',
          node_ids: ['plan_0053'],
        },
        {
          id: 'iden::plan_0054',
          aliases: ['plan_0054', '0054'],
          label: 'Plan 0054 — Storage Engine',
          node_ids: ['plan_0054'],
        },
      ];
      localStorage.setItem(STORAGE_KEYS.IDENTITIES, JSON.stringify(initialIdentities));
    }

    if (!localStorage.getItem(STORAGE_KEYS.LINEAGE)) {
      const initialLineage: LineageEventItem[] = [
        {
          id: 1,
          version: 41,
          delta_id: 'delta-2026-07-24-080',
          step: 'reduce',
          event_type: 'apply',
          affected_plans: ['plan_0053'],
          detail: 'OK: 1 receipts reduced',
        },
        {
          id: 2,
          version: 42,
          delta_id: 'delta-2026-07-25-001',
          step: 'snapshot',
          event_type: 'checkpoint',
          affected_plans: ['plan_0053', 'plan_0054'],
          detail: 'Engine snapshot version 42 persisted',
        },
      ];
      localStorage.setItem(STORAGE_KEYS.LINEAGE, JSON.stringify(initialLineage));
    }
  }

  public resetToDefaults(): void {
    localStorage.removeItem(STORAGE_KEYS.RECEIPTS);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.BREAKER);
    localStorage.removeItem(STORAGE_KEYS.IDENTITIES);
    localStorage.removeItem(STORAGE_KEYS.LINEAGE);
    localStorage.removeItem(STORAGE_KEYS.DELTAS);
    this.initLocalStorage();
  }

  // System
  public async getServiceRoot(): Promise<ServiceRootResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch('/');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Backend offline, fallback to mock root', e);
      }
    }
    return { service: 'WRP Kernel Runtime (Mock)', version: '0.1.0', docs: '/docs' };
  }

  public async getHealthz(): Promise<HealthzResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch('/healthz');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Healthz offline', e);
      }
    }
    return { status: 'alive' };
  }

  public async getReadyz(): Promise<ReadyzResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch('/readyz');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Readyz offline', e);
      }
    }
    return { status: 'ready', kernel_version: 42 };
  }

  public async getMetrics(): Promise<string> {
    if (!this.useMock) {
      try {
        const res = await fetch('/metrics');
        if (res.ok) return await res.text();
      } catch (e) {
        console.warn('Metrics offline', e);
      }
    }
    return `# HELP kernel_requests_total Total HTTP requests\nkernel_requests_total 128\n# HELP kernel_version Current version\nkernel_version 42`;
  }

  public async getSystemStatus(): Promise<SystemStatus> {
    if (!this.useMock) {
      try {
        const res = await fetch('/api/status');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Status endpoint offline', e);
      }
    }
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.STATUS) || JSON.stringify(INITIAL_SYSTEM_STATUS));
  }

  // 1. Delta Ingestion
  public async postDelta(payload: KernelDeltaInput): Promise<DeltaIngestResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/delta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    }

    const receipts = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    payload.receipts.forEach(r => {
      receipts.push({
        id: r.id || `RCP-${Date.now()}`,
        plan_id: r.plan_id || 'plan_0053',
        type: r.type || 'PLAN_CREATE',
        agent_role: r.agent_role || 'planner',
        session_id: 'sess-1001',
        ticket_id: r.ticket_id || 'TCK-AUTO',
        artifact_path: 'IMPLEMENTATION_PLANS/pending/auto.md',
        summary: r.summary || 'Ingested delta',
        metadata_json: r.metadata_json || '{}',
        tokens_used: r.tokens_used || 500,
        created_at: r.created_at || new Date().toISOString(),
      });
    });
    localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(receipts));

    return {
      success: true,
      version: 43,
      delta_id: payload.delta_id,
      plan_count: 12,
      receipt_count: receipts.length,
      error: null,
    };
  }

  public async getDeltaState(): Promise<DeltaStateSummary> {
    if (!this.useMock) {
      try {
        const res = await fetch('/delta/state');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /delta/state offline', e);
      }
    }
    const receipts = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    const identities = JSON.parse(localStorage.getItem(STORAGE_KEYS.IDENTITIES) || '[]');
    return {
      version: 42,
      plan_count: 12,
      receipt_count: receipts.length,
      identity_count: identities.length,
      graph_edge_count: 34,
      lineage_event_count: 87,
    };
  }

  // 2. State Inspection
  public async getStateSummary(view: 'summary' | 'full' = 'summary'): Promise<KernelStateSummary> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/state?view=${view}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /state offline', e);
      }
    }
    const receipts = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    const identities = JSON.parse(localStorage.getItem(STORAGE_KEYS.IDENTITIES) || '[]');
    return {
      kernel_version: 42,
      plan_count: 12,
      receipt_count: receipts.length,
      identity_count: identities.length,
      graph_edge_count: 34,
      lineage_event_count: 87,
      delta_log_count: 42,
    };
  }

  public async getIdentity(identityId: string): Promise<KernelIdentity> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/state/identity/${encodeURIComponent(identityId)}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /state/identity offline', e);
      }
    }
    const identities: any[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.IDENTITIES) || '[]');
    const found = identities.find(i => i.id === identityId || i.id === `iden::${identityId}` || i.aliases.includes(identityId));
    if (found) {
      return {
        ...found,
        edges_outgoing: [{ target: 'iden::plan_0052', relation: 'wrp:depends_on', metadata: {} }],
        edges_incoming: [{ source: 'iden::plan_0054', relation: 'wrp:impacts_system', metadata: {} }],
      };
    }
    throw new Error(`Identity not found: ${identityId}`);
  }

  public async getReceipt(receiptId: string): Promise<{ id: string; receipt: ReceiptItem }> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/state/receipt/${encodeURIComponent(receiptId)}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /state/receipt offline', e);
      }
    }
    const receipts: ReceiptItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    const found = receipts.find(r => r.id === receiptId);
    if (!found) throw new Error(`Receipt not found: ${receiptId}`);
    return { id: found.id, receipt: found };
  }

  public async getReceiptsByPlan(planNum: string): Promise<{ plan_num: string; receipts: ReceiptItem[]; count: number }> {
    const formatted = planNum.startsWith('plan_') ? planNum : `plan_${planNum}`;
    if (!this.useMock) {
      try {
        const res = await fetch(`/state/receipts-by-plan/${formatted}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /state/receipts-by-plan offline', e);
      }
    }
    const receipts: ReceiptItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    const matches = receipts.filter(r => r.plan_id === formatted);
    return { plan_num: formatted, receipts: matches, count: matches.length };
  }

  public async getCrossPlanGraph(cursor: string = '', limit: number = 200): Promise<CrossPlanGraphResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/state/graph?cursor=${encodeURIComponent(cursor)}&limit=${limit}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /state/graph offline', e);
      }
    }
    const identities: any[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.IDENTITIES) || '[]');
    return {
      nodes: identities.map(i => ({ id: i.id, aliases: i.aliases, label: i.label })),
      edges: [
        {
          source: 'iden::plan_0053',
          source_label: 'Plan 0053 — Auth Module',
          target: 'iden::plan_0054',
          target_label: 'Plan 0054 — Storage Engine',
          relation: 'wrp:depends_on',
          metadata: { priority: 'high' },
        },
        {
          source: 'iden::plan_0054',
          source_label: 'Plan 0054 — Storage Engine',
          target: 'iden::plan_0052',
          target_label: 'Plan 0052 — Core DB',
          relation: 'wrp:impacts_system',
          metadata: {},
        },
      ],
      total_edges: 2,
      cursor: identities.length > 0 ? identities[identities.length - 1].id : '',
      limit,
    };
  }

  public async getPlanDetail(planNum: string): Promise<PlanDetailResponse> {
    const formatted = planNum.startsWith('plan_') ? planNum : `plan_${planNum}`;
    if (!this.useMock) {
      try {
        const res = await fetch(`/state/plan/${formatted}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /state/plan offline', e);
      }
    }
    const receipts: ReceiptItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    const matches = receipts.filter(r => r.plan_id === formatted);
    return {
      plan_num: formatted,
      identity_id: `iden::${formatted}`,
      aliases: [formatted, formatted.replace('plan_', '')],
      label: `Plan ${formatted.replace('plan_', '')}`,
      receipt_count: matches.length,
      current_wrp_state: 'EXECUTING',
      valid_transitions: ['COMPLETED', 'BLOCKED', 'CANCELLED', 'ARCHIVED'],
      receipts: matches,
      edges_outgoing: [{ target: 'iden::plan_0052', relation: 'wrp:depends_on', metadata: {} }],
      edges_incoming: [],
    };
  }

  public async getLineageEvents(version?: number, limit: number = 100): Promise<{ events: LineageEventItem[]; count: number }> {
    if (!this.useMock) {
      try {
        const url = version !== undefined ? `/state/lineage?version=${version}&limit=${limit}` : `/state/lineage?limit=${limit}`;
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /state/lineage offline', e);
      }
    }
    const events: LineageEventItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LINEAGE) || '[]');
    return { events, count: events.length };
  }

  // 3. Replay
  public async getReplayState(version?: number): Promise<ReplayStateResponse> {
    if (!this.useMock) {
      try {
        const url = version !== undefined ? `/replay?version=${version}` : '/replay';
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /replay offline', e);
      }
    }
    const v = version ?? 42;
    const receipts = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    return {
      version: v,
      plan_count: 12,
      receipt_count: receipts.length,
      identity_count: 15,
      graph_edge_count: 34,
      lineage_event_count: 87,
      reconstructed_from_version: v,
    };
  }

  public async compareReplay(version: number): Promise<ReplayCompareResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/replay/compare?version=${version}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /replay/compare offline', e);
      }
    }
    const match = version === 42;
    const receipts = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    return {
      match,
      live_version: 42,
      replay_version: version,
      live_plan_count: 12,
      replay_plan_count: match ? 12 : 11,
      live_receipt_count: receipts.length,
      replay_receipt_count: match ? receipts.length : receipts.length - 1,
      live_identity_count: 15,
      replay_identity_count: 15,
      live_edge_count: 34,
      replay_edge_count: 34,
      diffs: match ? [] : [`Discrepancy at reconstructed version ${version}: state hash mismatch`],
    };
  }

  // 4. Admin
  public async getAdminIdentities(cursor: string = '', limit: number = 50): Promise<AdminIdentitiesResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/admin/identities?cursor=${encodeURIComponent(cursor)}&limit=${limit}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /admin/identities offline', e);
      }
    }
    const identities = JSON.parse(localStorage.getItem(STORAGE_KEYS.IDENTITIES) || '[]');
    return {
      identities,
      total: identities.length,
      cursor: identities.length > 0 ? identities[identities.length - 1].id : '',
      limit,
    };
  }

  public async updateIdentity(identityId: string, data: { label?: string; aliases?: string[] }): Promise<{ id: string; label: string; aliases: string[]; updated: boolean }> {
    if (!this.useMock) {
      const res = await this.requestOrThrow(`/admin/identities/${encodeURIComponent(identityId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await res.json();
    }
    const identities: any[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.IDENTITIES) || '[]');
    const iden = identities.find(i => i.id === identityId || i.id === `iden::${identityId}`);
    if (iden) {
      if (data.label) iden.label = data.label;
      if (data.aliases) iden.aliases = data.aliases;
      localStorage.setItem(STORAGE_KEYS.IDENTITIES, JSON.stringify(identities));
      return { id: iden.id, label: iden.label, aliases: iden.aliases, updated: true };
    }
    throw new Error(`Identity not found: ${identityId}`);
  }

  public async deleteIdentity(identityId: string): Promise<{ ok: boolean; identity_id: string }> {
    if (!this.useMock) {
      const res = await this.requestOrThrow(`/admin/identities/${encodeURIComponent(identityId)}`, { method: 'DELETE' });
      return await res.json();
    }
    let identities: any[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.IDENTITIES) || '[]');
    identities = identities.filter(i => i.id !== identityId && i.id !== `iden::${identityId}`);
    localStorage.setItem(STORAGE_KEYS.IDENTITIES, JSON.stringify(identities));
    return { ok: true, identity_id: identityId };
  }

  public async getEngineConsistency(): Promise<EngineConsistencyResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch('/admin/consistency');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /admin/consistency offline', e);
      }
    }
    return {
      aligned: true,
      engine_version: 42,
      delta_log_version: 42,
      engine_plan_count: 12,
      delta_log_count: 42,
      details: [
        'Version aligned: engine=42 == delta_log=42',
        'Plans tracked: 12',
        'Delta log entries: 42',
      ],
    };
  }

  // 5. Sessions
  public async getSessions(runningOnly: boolean = false): Promise<KernelSession[]> {
    if (!this.useMock) {
      try {
        const res = await fetch(runningOnly ? '/api/sessions?running_only=true' : '/api/sessions');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /api/sessions offline', e);
      }
    }
    const sessions: KernelSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
    return runningOnly ? sessions.filter(s => s.state === 'running') : sessions;
  }

  public async getStaleSessions(thresholdSeconds: number = 3600): Promise<KernelSession[]> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/api/sessions/stale?threshold_seconds=${thresholdSeconds}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /api/sessions/stale offline', e);
      }
    }
    const sessions: KernelSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
    return sessions.filter(s => s.state === 'stale');
  }

  public async updateSessionCost(sessionId: string, costUsd: number): Promise<KernelSession> {
    if (!this.useMock) {
      const res = await this.requestOrThrow(`/api/sessions/${encodeURIComponent(sessionId)}/cost`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_usd: costUsd }),
      });
      return await res.json();
    }
    const sessions: KernelSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
    const sess = sessions.find(s => s.id === sessionId);
    if (sess) {
      sess.cost_usd = costUsd;
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
      return sess;
    }
    throw new Error(`Session not found: ${sessionId}`);
  }

  public async killSession(sessionId: string): Promise<{ killed: boolean; sessionId: string; pids: number[]; errors: string[]; timestamp: string }> {
    if (!this.useMock) {
      const res = await this.requestOrThrow(`/api/sessions/${encodeURIComponent(sessionId)}/kill`, { method: 'POST' });
      return await res.json();
    }
    const sessions: KernelSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
    const sess = sessions.find(s => s.id === sessionId);
    if (sess) {
      sess.state = 'failed';
      sess.detail = 'Force-killed via UI';
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    }
    return {
      killed: true,
      sessionId,
      pids: sess ? [sess.pid] : [12345],
      errors: [],
      timestamp: new Date().toISOString(),
    };
  }

  // 6. Circuit Breaker
  public async getBreakerState(): Promise<BreakerStateResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch('/api/breaker');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /api/breaker offline', e);
      }
    }
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.BREAKER) || '{}');
  }

  public async tripBreaker(data?: { reason?: string; detail?: string; retryAfter?: number }): Promise<BreakerStateResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/api/breaker/trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      return await res.json();
    }
    const breaker: BreakerStateResponse = JSON.parse(localStorage.getItem(STORAGE_KEYS.BREAKER) || '{}');
    breaker.tripped = true;
    breaker.source = data?.reason || 'MANUAL_TRIP';
    breaker.error = data?.reason || 'Manual circuit breaker trip';
    breaker.detail = data?.detail || 'Tripped by user';
    breaker.tripped_at = new Date().toISOString();
    if (data?.retryAfter) breaker.retry_after = data.retryAfter;
    localStorage.setItem(STORAGE_KEYS.BREAKER, JSON.stringify(breaker));
    return breaker;
  }

  public async resetBreaker(): Promise<BreakerStateResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/api/breaker/reset', { method: 'POST' });
      return await res.json();
    }
    const breaker: BreakerStateResponse = JSON.parse(localStorage.getItem(STORAGE_KEYS.BREAKER) || '{}');
    breaker.tripped = false;
    breaker.source = '';
    breaker.error = '';
    breaker.detail = '';
    breaker.tripped_at = null;
    localStorage.setItem(STORAGE_KEYS.BREAKER, JSON.stringify(breaker));
    return breaker;
  }

  public async pauseOrchestration(): Promise<BreakerStateResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/api/breaker/pause', { method: 'POST' });
      return await res.json();
    }
    const breaker: BreakerStateResponse = JSON.parse(localStorage.getItem(STORAGE_KEYS.BREAKER) || '{}');
    breaker.paused = true;
    localStorage.setItem(STORAGE_KEYS.BREAKER, JSON.stringify(breaker));
    return breaker;
  }

  public async resumeOrchestration(): Promise<BreakerStateResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/api/breaker/resume', { method: 'POST' });
      return await res.json();
    }
    const breaker: BreakerStateResponse = JSON.parse(localStorage.getItem(STORAGE_KEYS.BREAKER) || '{}');
    breaker.paused = false;
    localStorage.setItem(STORAGE_KEYS.BREAKER, JSON.stringify(breaker));
    return breaker;
  }

  public async getFailureRecoveryConfig(): Promise<FailureRecoveryConfig> {
    if (!this.useMock) {
      try {
        const res = await fetch('/api/breaker/failure-recovery');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /api/breaker/failure-recovery offline', e);
      }
    }
    const breaker: BreakerStateResponse = JSON.parse(localStorage.getItem(STORAGE_KEYS.BREAKER) || '{}');
    return {
      max_retries_per_model: breaker.max_retries_per_model || 3,
      retry_delay_seconds: breaker.retry_delay_seconds || 120,
      max_fallbacks: breaker.max_fallbacks || 3,
      push_back_to_pending: breaker.push_back_to_pending ?? true,
      circuit_breaker_retry_after: breaker.retry_after || 1800,
    };
  }

  public async saveFailureRecoveryConfig(config: Partial<FailureRecoveryConfig>): Promise<FailureRecoveryConfig> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/api/breaker/failure-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      return await res.json();
    }
    const breaker: BreakerStateResponse = JSON.parse(localStorage.getItem(STORAGE_KEYS.BREAKER) || '{}');
    if (config.max_retries_per_model !== undefined) breaker.max_retries_per_model = config.max_retries_per_model;
    if (config.retry_delay_seconds !== undefined) breaker.retry_delay_seconds = config.retry_delay_seconds;
    if (config.max_fallbacks !== undefined) breaker.max_fallbacks = config.max_fallbacks;
    if (config.push_back_to_pending !== undefined) breaker.push_back_to_pending = config.push_back_to_pending;
    if (config.circuit_breaker_retry_after !== undefined) breaker.retry_after = config.circuit_breaker_retry_after;
    localStorage.setItem(STORAGE_KEYS.BREAKER, JSON.stringify(breaker));

    return {
      max_retries_per_model: breaker.max_retries_per_model,
      retry_delay_seconds: breaker.retry_delay_seconds,
      max_fallbacks: breaker.max_fallbacks,
      push_back_to_pending: breaker.push_back_to_pending,
      circuit_breaker_retry_after: breaker.retry_after,
    };
  }

  // 7. Receipts
  public async getFormattedReceipts(planId: string): Promise<Array<ReceiptItem & { parsed_metadata: any }>> {
    const formatted = planId.startsWith('plan_') ? planId : `plan_${planId}`;
    if (!this.useMock) {
      try {
        const res = await fetch(`/api/receipts/${formatted}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /api/receipts offline', e);
      }
    }
    const receipts: ReceiptItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    return receipts
      .filter(r => r.plan_id === formatted)
      .map(r => ({
        ...r,
        parsed_metadata: JSON.parse(r.metadata_json || '{}'),
      }));
  }

  public async insertReceipt(receipt: Partial<ReceiptItem>): Promise<{ ok: boolean; id: string; plan_id: string }> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receipt),
      });
      return await res.json();
    }
    const receipts: ReceiptItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    const newRc: ReceiptItem = {
      id: receipt.id || `RCP-${Date.now()}`,
      plan_id: receipt.plan_id || 'plan_0053',
      type: receipt.type || 'PLAN_CREATE',
      agent_role: receipt.agent_role || 'planner',
      session_id: receipt.session_id || 'sess-1001',
      ticket_id: receipt.ticket_id || 'TCK-2026-0053',
      artifact_path: receipt.artifact_path || 'IMPLEMENTATION_PLANS/pending/manual.md',
      summary: receipt.summary || 'Inserted receipt',
      metadata_json: receipt.metadata_json || '{}',
      tokens_used: receipt.tokens_used || 1000,
      created_at: receipt.created_at || new Date().toISOString(),
    };
    receipts.push(newRc);
    localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(receipts));
    return { ok: true, id: newRc.id, plan_id: newRc.plan_id };
  }

  public async deleteReceipts(planId: string, types: string[]): Promise<{ deleted: number; plan_id: string; types: string[] }> {
    const formatted = planId.startsWith('plan_') ? planId : `plan_${planId}`;
    if (!this.useMock) {
      const res = await this.requestOrThrow(`/api/receipts/${formatted}?types=${encodeURIComponent(types.join(','))}`, { method: 'DELETE' });
      return await res.json();
    }
    let receipts: ReceiptItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    const countBefore = receipts.length;
    receipts = receipts.filter(r => !(r.plan_id === formatted && (types.length === 0 || types.includes(r.type))));
    localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(receipts));
    return { deleted: countBefore - receipts.length, plan_id: formatted, types };
  }

  // 8. TypeScript conduit-srv (:3104) Methods

  public async getConduitSrvHealth(): Promise<{ status: string; port: number; db: string; timestamp: string }> {
    if (!this.useMock) {
      try {
        const res = await fetch('/health');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /health offline', e);
      }
    }
    return { status: 'ok', port: 3104, db: 'up', timestamp: new Date().toISOString() };
  }

  public async getWorkflows(): Promise<WorkflowListResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch('/workflows');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /workflows offline', e);
      }
    }
    const sessions = await this.getSessions(true);
    return {
      connected: true,
      counts: { running: sessions.length, completed: 0, failed: 0, cancelled: 0, total: sessions.length },
      workflows: sessions.map(s => ({
        workflowId: `plan-plan_0053-${s.role}`,
        runId: s.id,
        status: s.state,
        startTime: s.started_at,
        closeTime: null,
        planId: 'plan_0053',
        role: s.role,
        pid: s.pid,
      })),
    };
  }

  public async detectTickets(): Promise<TicketDetectionResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/tickets/detect', { method: 'POST' });
      return await res.json();
    }
    return { detected: true, stale: 1, expired: 0, timestamp: new Date().toISOString() };
  }

  public async getTicketLineage(planId: string): Promise<TicketLineageResponse> {
    const formatted = planId.startsWith('plan_') ? planId : `plan_${planId}`;
    if (!this.useMock) {
      try {
        const res = await fetch(`/tickets/lineage/${formatted}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /tickets/lineage offline', e);
      }
    }
    return {
      plan_id: formatted,
      tickets: [
        {
          id: 'TCK-2026-0053',
          role: 'planner',
          status: 'claimed',
          tokens_used: 3600,
          parent_ticket_id: null,
          spawn_reason: null,
          replacement_of: null,
          closure_reason: null,
          created_at: new Date(Date.now() - 7200000).toISOString(),
          closed_at: null,
        },
      ],
    };
  }

  public async getTokensByPlan(planId: string): Promise<TokenPlanUsageResponse> {
    const formatted = planId.startsWith('plan_') ? planId : `plan_${planId}`;
    if (!this.useMock) {
      try {
        const res = await fetch(`/tokens/plan/${formatted}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /tokens/plan offline', e);
      }
    }
    return { plan_id: formatted, total_tokens: 3600, receipts: 2 };
  }

  public async getTokensByRole(role: string): Promise<TokenRoleUsageResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/tokens/role/${encodeURIComponent(role)}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /tokens/role offline', e);
      }
    }
    return { role, total_tokens: 4200, receipts: 3 };
  }

  public async getTokensByTicket(ticketId: string): Promise<TokenTicketUsageResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/tokens/ticket/${encodeURIComponent(ticketId)}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /tokens/ticket offline', e);
      }
    }
    return { ticket_id: ticketId, tokens_used: 1500 };
  }

  public async getCronConfig(): Promise<CronConfigResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch('/config/cron');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /config/cron offline', e);
      }
    }
    return { cron: '*/3 * * * *', intervalMinutes: 3, description: 'Pipeline cron interval', timestamp: new Date().toISOString() };
  }

  public async replayGovernance(): Promise<GovernanceReplayResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/governance/replay', { method: 'POST' });
      return await res.json();
    }
    return { ok: true, replayed: 2 };
  }

  public async getGovernanceEvents(planId?: string, eventType?: string): Promise<GovernanceEventsResponse> {
    if (!this.useMock) {
      try {
        const queryParams = new URLSearchParams();
        if (planId) queryParams.set('planId', planId);
        if (eventType) queryParams.set('eventType', eventType);
        const res = await fetch(`/governance/events?${queryParams.toString()}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /governance/events offline', e);
      }
    }
    return {
      ok: true,
      events: [
        {
          id: 1,
          receipt_id: 'RCP-PLAN-0053-1',
          event_type: 'receipt:PROPOSED',
          work_request_id: 'wr-uuid-0053',
          plan_id: 'plan_0053',
          agent_role: 'planner',
          payload: { session_id: 'sess-1001', artifact_path: 'IMPLEMENTATION_PLANS/pending/auth-module.md', summary: 'Initial proposal' },
          created_at: new Date(Date.now() - 7200000).toISOString(),
          replayed_at: new Date().toISOString(),
        },
      ],
    };
  }

  public async getVisionWorkRequests(status?: string): Promise<VisionWorkRequestsResponse> {
    if (!this.useMock) {
      try {
        const url = status ? `/vision/work-requests?status=${encodeURIComponent(status)}` : '/vision/work-requests';
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /vision/work-requests offline', e);
      }
    }
    return {
      ok: true,
      work_requests: [
        {
          id: 1,
          wr_id: 'plan_0053',
          work_request_uuid: 'wr-uuid-0053',
          dco_json: '{"lease_owner_pid":"14201","cost_limit_usd":5.00}',
          context: { system: 'Auth Module', subsystem: 'OAuth Bridges' },
          status: 'pending',
          title: 'Auth Module V2 Implementation Plan',
          recorded_on_dt: new Date(Date.now() - 7200000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          wr_id: 'plan_0054',
          work_request_uuid: 'wr-uuid-0054',
          dco_json: '{"lease_owner_pid":"14205","cost_limit_usd":10.00}',
          context: { system: 'Storage Engine', subsystem: 'PostgreSQL Buffer' },
          status: 'in_progress',
          title: 'Storage Engine Buffer Cache Optimization',
          recorded_on_dt: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }

  public async getVisionWorkRequestById(id: string): Promise<VisionWorkRequestSingleResponse> {
    if (!this.useMock) {
      try {
        const res = await fetch(`/vision/work-requests/${encodeURIComponent(id)}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /vision/work-requests/:id offline', e);
      }
    }
    return {
      ok: true,
      work_request: {
        id: 1,
        wr_id: id.startsWith('plan_') ? id : `plan_${id}`,
        work_request_uuid: 'wr-uuid-0053',
        dco_json: '{"lease_owner_pid":"14201","cost_limit_usd":5.00}',
        context: { system: 'Auth Module', subsystem: 'OAuth Bridges' },
        status: 'pending',
        title: 'Auth Module V2 Implementation Plan',
        recorded_on_dt: new Date(Date.now() - 7200000).toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  }

  public async upsertVisionWorkRequest(payload: VisionWorkRequestInput): Promise<VisionWorkRequestUpsertResponse> {
    if (!this.useMock) {
      const res = await this.requestOrThrow('/vision/work-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    }
    const wrId = payload.id.startsWith('plan_') ? payload.id : `plan_${payload.id}`;
    return {
      ok: true,
      id: wrId,
      work_request_uuid: payload.work_request_uuid || `uuid-${Date.now()}`,
      action: 'created',
    };
  }

  public async getVisionReceipts(planId: string): Promise<VisionReceiptsResponse> {
    const formatted = planId.startsWith('plan_') ? planId : `plan_${planId}`;
    if (!this.useMock) {
      try {
        const res = await fetch(`/vision/receipts?planId=${encodeURIComponent(formatted)}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('GET /vision/receipts offline', e);
      }
    }
    const receipts = await this.getFormattedReceipts(formatted);
    return {
      ok: true,
      receipts: receipts.map((r, idx) => ({
        id: r.id,
        plan_id: r.plan_id,
        type: r.type,
        agent_role: r.agent_role,
        session_id: r.session_id || 'sess-1001',
        ticket_id: r.ticket_id || 'TCK-2026-0053',
        artifact_path: r.artifact_path || 'IMPLEMENTATION_PLANS/active/auth.md',
        summary: r.summary,
        metadata_json: r.metadata_json || '{}',
        tokens_used: r.tokens_used || 1000,
        created_at: r.created_at,
        sequence: idx + 1,
      })),
    };
  }

  public getSessionLogSseUrl(sessionId: string): string {
    return `/log/${encodeURIComponent(sessionId)}`;
  }

  // Model Chains Helper
  public async getModelChains(): Promise<ModelChainConfig[]> {
    return INITIAL_MODEL_CHAINS;
  }
}

export const apiService = new ApiService();
