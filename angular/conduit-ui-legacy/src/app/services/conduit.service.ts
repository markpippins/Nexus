import { Injectable, signal, NgZone, Inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SILENT_REQUEST } from '../interceptors/request-context';
import {
  ConduitState,
  ConduitEvent,
  BuilderStatus,
  CircuitBreaker,
  PlanCard,
  AgentState,
  InspectionEntry,
  PromptEntry,
  ChangeReportEntry,
  SessionLogEvent,
  CronConfig,
} from './types';
import { API_BASE_URL } from './api-config';

const POLL_FALLBACK_INTERVAL = 10000; // 10 seconds (was 30s, reduced for near-realtime)

@Injectable({
  providedIn: 'root',
})
export class ConduitService {
  // Reactive state
  readonly state = signal<ConduitState | null>(null);
  readonly builder = signal<BuilderStatus>({ pid: null, status: 'idle' });
  readonly circuitBreaker = signal<CircuitBreaker>({ tripped: false, paused: false });
  readonly agents = signal<AgentState[]>([]);
  readonly connected = signal<boolean>(false);
  readonly offline = signal<boolean>(false);
  readonly sseConnected = signal<boolean>(false);
  readonly inspections = signal<InspectionEntry[]>([]);
  readonly prompts = signal<PromptEntry[]>([]);
  readonly changeReports = signal<ChangeReportEntry[]>([]);

  /** Server health indicators (v081) */
  readonly mcpOnline = signal<boolean>(true);

  /** Whether conduit orchestration is paused (v073 — workflow control) */
  readonly conduitPaused = signal(false);

  /** Cron schedule config (v092 — exposed by GET /config/cron) */
  readonly cronConfig = signal<CronConfig | null>(null);

  private eventSource: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Rolling activity log for overview (v039)
  readonly activityLog = signal<
    Array<{ type: string; detail: string; timestamp: string; planNumber?: string }>
  >([]);

  // Session log viewer (v071 — streaming live builder output)
  readonly sessionLog = signal<SessionLogEvent[]>([]);
  readonly sessionLogActive = signal(false);
  readonly sessionLogSessionId = signal<string | null>(null);
  readonly sessionLogFileExists = signal<boolean | null>(null); // null = not yet determined
  private sessionLogSource: EventSource | null = null;

  private healthProbeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private http: HttpClient,
    private zone: NgZone,
    @Inject(API_BASE_URL) private apiBase: string,
  ) {
    this.fetchInitialState();
    this.startServerHealthProbe();
  }

  /** Fetch initial state via HTTP, then connect SSE */
  private fetchInitialState() {
    this.http.get<ConduitState>(`${this.apiBase}/state`).subscribe({
      next: (state) => {
        this.state.set(state);
        this.builder.set(state.builder);
        this.circuitBreaker.set(state.circuitBreaker);
        this.conduitPaused.set(state.circuitBreaker.paused);
        this.connected.set(true);
        this.offline.set(false);
        this.connectSSE();
      },
      error: () => {
        this.offline.set(true);
        this.startPollingFallback();
      },
    });
  }

  /** SSE connection */
  private connectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(`${this.apiBase}/events`);

    this.eventSource.onopen = () => {
      this.sseConnected.set(true);
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    };

    this.eventSource.onmessage = (event) => {
      this.zone.run(() => {
        try {
          const parsed: ConduitEvent = JSON.parse(event.data);
          this.handleSSEEvent(parsed);
        } catch {
          // ignore parse errors
        }
      });
    };

    this.eventSource.addEventListener('state_full', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('plan_created', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('plan_moved', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('plan_archived', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('builder_update', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('circuit_breaker_update', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('agent_update', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('inspection_created', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('inspection_moved', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('inspection_resolved', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('prompt_created', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('prompt_archived', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('change_created', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('change_archived', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('plan_state_changed', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.addEventListener('plan_deleted', (event: any) => {
      this.zone.run(() => this.handleSSEEvent(JSON.parse(event.data)));
    });

    this.eventSource.onerror = () => {
      this.sseConnected.set(false);
      this.startPollingFallback();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.sseConnected()) {
        this.fetchInitialState();
      }
    }, 10000);
  }

  private startPollingFallback() {
    if (this.pollTimer) return;
    const silentContext = new HttpContext().set(SILENT_REQUEST, true);
    this.pollTimer = setInterval(() => {
      this.http.get<ConduitState>(`${this.apiBase}/state`, { context: silentContext }).subscribe({
        next: (state) => {
          this.state.set(state);
          this.builder.set(state.builder);
        this.circuitBreaker.set(state.circuitBreaker);
        this.conduitPaused.set(state.circuitBreaker.paused);
        this.connected.set(true);
        this.offline.set(false);
        },
        error: () => {
          this.offline.set(true);
        },
      });
    }, POLL_FALLBACK_INTERVAL);
  }

  private handleSSEEvent(event: ConduitEvent) {
    const timestamp = event.timestamp || new Date().toISOString();

    switch (event.type) {
      case 'state_full':
        // Full state push from server (connect + heartbeat)
        this.state.set(event.data as ConduitState);
        this.builder.set((event.data as ConduitState).builder);
        this.circuitBreaker.set((event.data as ConduitState).circuitBreaker);
        this.conduitPaused.set((event.data as ConduitState).circuitBreaker.paused);
        this.prompts.set((event.data as ConduitState).prompts || []);
        this.connected.set(true);
        this.offline.set(false);
        break;

      case 'connected':
        this.sseConnected.set(true);
        this.addActivity('connected', 'SSE stream connected', timestamp);
        break;

      case 'plan_created': {
        const plan = event.data.plan as PlanCard;
        const status = event.data.status as string;
        const from = event.data.from as string;
        const current = this.state();
        if (current) {
          const plans = { ...current.plans };
          // Remove from source
          const fromKey = from as keyof typeof plans;
          if (Array.isArray(plans[fromKey])) {
            plans[fromKey] = plans[fromKey].filter(
              (p: PlanCard) => p.fileName !== plan.fileName,
            );
          }
          // If there's a 'to' field, add there
          const to = event.data.to as string;
          if (to) {
            const toKey = to as keyof typeof plans;
            if (Array.isArray(plans[toKey])) {
              plans[toKey] = [...plans[toKey], plan];
            }
          }
          this.state.set({ ...current, plans, lastUpdated: timestamp });
        }
        this.addActivity(
          'plan_moved',
          `${plan.planNumber}: ${plan.title} ← ${from}`,
          timestamp,
          plan.planNumber,
        );
        break;
      }

      case 'plan_archived': {
        const plan = event.data.plan as PlanCard;
        const current = this.state();
        if (current) {
          const plans = { ...current.plans };
          plans.archived = [...plans.archived.slice(-9), plan]; // keep last 10
          this.state.set({ ...current, plans, lastUpdated: timestamp });
        }
        this.addActivity(
          'plan_archived',
          `${plan.planNumber}: ${plan.title}`,
          timestamp,
          plan.planNumber,
        );
        break;
      }

      case 'builder_update': {
        const builderData = event.data as BuilderStatus;
        this.builder.set(builderData);
        const current = this.state();
        if (current) {
          this.state.set({ ...current, builder: builderData, lastUpdated: timestamp });
        }
        const label =
          builderData.status === 'running'
            ? `Builder running · ${builderData.workflowId ?? `PID ${builderData.pid}`}`
            : builderData.status === 'stale'
              ? `Builder stale · ${builderData.workflowId ?? `PID ${builderData.pid}`}`
              : builderData.status === 'killed'
                ? `Builder killed · ${builderData.workflowId ?? `PID ${builderData.pid}`}`
                : 'Builder idle';
        this.addActivity('builder_update', label, timestamp);
        break;
      }

      case 'circuit_breaker_update': {
        const cbData = event.data as CircuitBreaker;
        this.circuitBreaker.set(cbData);
        this.conduitPaused.set(cbData.paused);
        const current = this.state();
        if (current) {
          this.state.set({ ...current, circuitBreaker: cbData, lastUpdated: timestamp });
        }
        this.addActivity(
          'circuit_breaker_update',
          cbData.tripped ? 'Circuit breaker TRIPPED' : 'Circuit breaker RESOLVED',
          timestamp,
        );
        break;
      }

      case 'agent_update': {
        const data = event.data;
        if (Array.isArray(data)) {
          this.agents.set(data);
        } else {
          const existing = this.agents();
          const idx = existing.findIndex((a) => a.role === data.role);
          if (idx === -1) {
            this.agents.set([...existing, data]);
          } else {
            const updated = [...existing];
            updated[idx] = data;
            this.agents.set(updated);
          }
        }
        break;
      }

      case 'inspection_created': {
        const entry = event.data as InspectionEntry;
        const existing = this.inspections();
        if (!existing.find(e => e.path === entry.path)) {
          this.inspections.set([entry, ...existing]);
        } else {
          this.inspections.set(existing.map(e => e.path === entry.path ? entry : e));
        }
        this.addActivity('inspection_created', `${entry.severity}: ${entry.title}`, timestamp);
        break;
      }

      case 'inspection_moved':
      case 'inspection_resolved': {
        const data = event.data;
        const path = typeof data === 'string' ? data : data?.path;
        if (path) {
          this.inspections.set(this.inspections().filter(e => e.path !== path));
        }
        this.addActivity('inspection_moved', `Inspection removed: ${path}`, timestamp);
        break;
      }

      case 'prompt_created': {
        const entry = event.data as PromptEntry;
        const existing = this.prompts();
        if (!existing.find(e => e.path === entry.path)) {
          this.prompts.set([entry, ...existing]);
        } else {
          this.prompts.set(existing.map(e => e.path === entry.path ? entry : e));
        }
        this.addActivity('prompt_created', `Prompt #${entry.promptNumber}: ${entry.title}`, timestamp);
        break;
      }

      case 'prompt_archived': {
        const path = event.data?.path as string;
        if (path) {
          this.prompts.set(this.prompts().filter(e => e.path !== path));
        }
        this.addActivity('prompt_archived', `Prompt archived: ${path}`, timestamp);
        break;
      }

      case 'change_created': {
        const entry = event.data as ChangeReportEntry;
        const existing = this.changeReports();
        if (!existing.find(e => e.path === entry.path)) {
          this.changeReports.set([entry, ...existing]);
        } else {
          this.changeReports.set(existing.map(e => e.path === entry.path ? entry : e));
        }
        this.addActivity('change_created', `Change: ${entry.title}`, timestamp);
        break;
      }

      case 'change_archived': {
        const path = event.data?.path as string;
        if (path) {
          this.changeReports.set(this.changeReports().filter(e => e.path !== path));
        }
        this.addActivity('change_archived', `Change archived: ${path}`, timestamp);
        break;
      }

      case 'plan_state_changed': {
        // Receipt was issued — fetch full state to pick up group changes
        this.http.get<ConduitState>(`${this.apiBase}/state`, {
          context: new HttpContext().set(SILENT_REQUEST, true),
        }).subscribe({
          next: (state) => {
            this.state.set(state);
            this.builder.set(state.builder);
            this.circuitBreaker.set(state.circuitBreaker);
            this.conduitPaused.set(state.circuitBreaker.paused);
          },
        });
        const planNumber = event.data?.planNumber as string;
        this.addActivity(
          'plan_state_changed',
          `Plan #${planNumber}: ${event.data?.receiptType} by ${event.data?.agentRole}`,
          timestamp,
          planNumber,
        );
        break;
      }

      case 'plan_deleted': {
        const planNumber = event.data?.planNumber as string;
        const current = this.state();
        if (current && planNumber) {
          const plans = { ...current.plans };
          // Remove from all columns
          for (const key of ['pending', 'active', 'completed', 'blocked', 'proposed', 'planning'] as const) {
            plans[key] = plans[key].filter((p: PlanCard) => p.planNumber !== planNumber);
          }
          this.state.set({ ...current, plans, lastUpdated: timestamp });
        }
        this.addActivity(
          'plan_deleted',
          `Plan #${planNumber} deleted${event.data?.wasBlocked ? ' (block artifacts cleaned)' : ''}`,
          timestamp,
          planNumber,
        );
        break;
      }

      case 'agent_killed':
      case 'session_killed': {
        // Fetch updated state via HTTP (lightweight — no SSE reconnect)
        const label = event.data?.role
          ? `Agent ${event.data.role} killed`
          : `Session ${event.data?.sessionId || ''} killed`;
        this.addActivity('agent_killed', label, timestamp);
        this.http.get<ConduitState>(`${this.apiBase}/state`, {
          context: new HttpContext().set(SILENT_REQUEST, true),
        }).subscribe({
          next: (state) => {
            this.state.set(state);
            this.builder.set(state.builder);
            this.circuitBreaker.set(state.circuitBreaker);
            this.agents.set(state.agents);
          },
        });
        break;
      }

      case 'conduit_paused': {
        const paused = event.data?.paused === true;
        this.conduitPaused.set(paused);
        this.addActivity(
          'conduit_paused',
          paused ? 'Conduit PAUSED' : 'Conduit RESUMED',
          timestamp,
        );
        break;
      }
    }
  }

  private addActivity(
    type: string,
    detail: string,
    timestamp: string,
    planNumber?: string,
  ) {
    const log = this.activityLog();
    this.activityLog.set(
      [{ type, detail, timestamp, planNumber }, ...log].slice(0, 50),
    );
  }

  /** Fetch current state on demand */
  getState(): ConduitState | null {
    return this.state();
  }

  /** Force an immediate state fetch */
  refresh() {
    this.fetchInitialState();
  }

  /** Periodically probe MCP and Chat server health (v081) */
  private startServerHealthProbe(): void {
    const silentContext = new HttpContext().set(SILENT_REQUEST, true);
    const probe = () => {
      this.http.get<any>(`${this.apiBase}/health`, { context: silentContext }).subscribe({
        next: () => this.mcpOnline.set(true),
        error: () => this.mcpOnline.set(false),
      });

    };
    probe();
    this.healthProbeTimer = setInterval(probe, 30000);
  }

  /** Subscribe to live session log via SSE (v071) */
  subscribeToSessionLog(sessionId: string): void {
    // Clean up any existing subscription
    this.unsubscribeSessionLog();

    this.sessionLog.set([]);
    this.sessionLogSessionId.set(sessionId);
    this.sessionLogActive.set(true);
    this.sessionLogFileExists.set(null);

    const url = `${this.apiBase}/log/${sessionId}`;
    this.sessionLogSource = new EventSource(url);

    this.sessionLogSource.onmessage = (event) => {
      this.zone.run(() => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'session_log' && parsed.data) {
            const entry: SessionLogEvent = {
              sessionId: parsed.data.sessionId,
              line: parsed.data.line,
              timestamp: parsed.data.timestamp,
              logType: parsed.data.logType || 'stdout',
            };
            this.sessionLog.update((lines) => [...lines.slice(-4999), entry]);
          } else if (parsed.type === 'session_log_meta' && parsed.data) {
            this.sessionLogFileExists.set(parsed.data.logFileExists === true);
          }
        } catch {
          // ignore parse errors
        }
      });
    };

    this.sessionLogSource.onerror = () => {
      // EventSource will auto-reconnect; don't clear the log
    };
  }

  /** Clean up session log subscription */
  unsubscribeSessionLog(): void {
    if (this.sessionLogSource) {
      this.sessionLogSource.close();
      this.sessionLogSource = null;
    }
    this.sessionLogActive.set(false);
    this.sessionLogSessionId.set(null);
    this.sessionLogFileExists.set(null);
  }

  /** Kill a running session by ID (v072) */
  killSession(sessionId: string) {
    return this.http.post<{ killed: boolean; sessionId: string; pids: number[] }>(
      `${this.apiBase}/sessions/${sessionId}/kill`,
      {},
    );
  }

  /** Kill a running agent by role (v073 — kill builder/reviewer/planner from UI) */
  killAgent(role: string) {
    return this.http.post<{ killed: boolean; role: string; pids: number[] }>(
      `${this.apiBase}/agents/${role}/kill`,
      {},
    );
  }

  /** Trip the circuit breaker (v073 — manual trip from UI) */
  tripCircuitBreaker(reason?: string) {
    return this.http.post<{ tripped: boolean; reason: string }>(
      `${this.apiBase}/circuit-breaker/trip`,
      { reason, retryAfter: 3600 },
    );
  }

  /** Reset the circuit breaker (v073 — manual reset from UI) */
  resetCircuitBreaker() {
    return this.http.post<{ tripped: boolean }>(
      `${this.apiBase}/circuit-breaker/reset`,
      {},
    );
  }

  /** Pause conduit orchestration (v073 — stops dispatching new work) */
  pauseConduit() {
    return this.http.post<{ paused: boolean }>(
      `${this.apiBase}/conduit/pause`,
      {},
    );
  }

  /** Resume conduit orchestration (v073 — resumes dispatching) */
  resumeConduit() {
    return this.http.post<{ paused: boolean }>(
      `${this.apiBase}/conduit/resume`,
      {},
    );
  }

  /** Fetch the cron schedule config from the MCP server (v092). */
  fetchCronConfig(): void {
    this.http.get<CronConfig>(`${this.apiBase}/config/cron`, {
      context: new HttpContext().set(SILENT_REQUEST, true),
    }).subscribe({
      next: (config) => this.cronConfig.set(config),
      error: () => { /* use default */ },
    });
  }

  /** Restart builder for a specific plan (v074 — user-triggered, bypasses cursor/pause).
   *  If the circuit breaker is tripped, returns { blocked: true, breaker: {...} }
   *  so the UI can show a confirmation dialog. Pass force=true to override. */
  restartBuilder(planId: string, force = false) {
    const params = force ? '?force=true' : '';
    return this.http.post<{
      restarted?: boolean;
      blocked?: boolean;
      message?: string;
      breaker?: { tripped: boolean; error: string | null; detail: string | null; trippedAt: string | null };
      planId: string;
      force: boolean;
      timestamp: string;
    }>(
      `${this.apiBase}/plans/${planId}/restart-builder${params}`,
      {},
    );
  }

  /** Hard-delete a plan and all associated tickets/receipts (irreversible).
   *  Requires confirmPlanTitle to match exactly for safety. */
  hardDeletePlan(planNumber: string, confirmPlanTitle: string) {
    return this.http.post<{
      result: {
        hardDeleted: boolean;
        planNumber: string;
        ticketsDeleted: number;
        receiptsDeleted: number;
        cleanedPaths: string[];
        timestamp: string;
      };
      requestId: string;
    }>(
      `${this.apiBase}/tools/call`,
      {
        name: 'hard_delete_plan',
        arguments: { planNumber, confirmPlanTitle },
      },
    );
  }
}
