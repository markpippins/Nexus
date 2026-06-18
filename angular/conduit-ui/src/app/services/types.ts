// Pipeline state types - mirrored from MCP server (conduit-mcp)

export interface PlanCard {
  fileName: string;
  planNumber: string;
  baseName: string;
  title: string;
  project: string;
  createdAt: string;
  movedAt?: string;
  completedAt?: string;
  blockReason?: string;
  goal?: string;
  filesAffected?: string[];
  acceptanceCriteria?: string[];
  dependencies?: string[];
  promptRef?: string;  // prompt number this plan was spawned from
  /** Per-role ticket detail: role → { status, id, created_at, expires_at, objective } */
  ticketStatuses?: Record<string, { status: string; id: string; created_at: string; expires_at?: string; objective?: string }>;
  /** Derived status from the receipt chain (PLAN_CREATE, IMPLEMENTATION, REVIEW_PASS, etc.) */
  derivedStatus?: string;
}

export interface BuilderStatus {
  pid: number | null;
  status: 'idle' | 'running' | 'stale' | 'killed' | 'error';
  startedAt?: string;
  lastActivity?: string;
  elapsedSeconds?: number;
  lastLogLine?: string;
}

export interface CircuitBreaker {
  tripped: boolean;
  retryAfter?: number;
  reason?: string;
  paused: boolean;
}

export interface ConduitState {
  plans: {
    pending: PlanCard[];
    active: PlanCard[];
    completed: PlanCard[];
    blocked: PlanCard[];
    archived: PlanCard[];
    proposed: PlanCard[];
    planning: PlanCard[];
  };
  builder: BuilderStatus;
  circuitBreaker: CircuitBreaker;
  agents: AgentState[];
  receiptStats?: { type: string; count: number }[];
  prompts: PromptEntry[];
  lastUpdated: string;
  temporal?: TemporalState;
}

export interface TemporalState {
  connected: boolean;
  address: string;
  namespace: string;
  schedulerIntervalMs: number;
  workflowCounts: { running: number; completed: number; failed: number; cancelled: number; total: number };
}

// Receipt types (v061)
export type ReceiptType = 'PLAN_CREATE' | 'IMPLEMENTATION' | 'REVIEW_PASS' | 'REVIEW_REJECT' | 'BLOCK';

export interface ReceiptEntry {
  id: string;
  type: ReceiptType;
  agent_role: string;
  session_id: string | null;
  artifact_path: string | null;
  summary: string;
  metadata: Record<string, any>;
  created_at: string;
}

// Archive types (v033)
export type ArchiveCategory = 'completed-plans' | 'build-logs' | 'prompts' | 'changes';

export interface ArchiveEntry {
  path: string;
  fileName: string;
  category: ArchiveCategory;
  mtime: string;
  size: number;
  planNumber?: string;
  title?: string;
  goal?: string;
  filesAffected?: string[];
  acceptanceCriteria?: string;
  dependencies?: string;
  sessionId?: string;
  exitCode?: number;
  plansProcessed?: string;
  retriesUsed?: number;
}

export interface ArchiveSearchParams {
  category?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface ArchiveResult {
  results: ArchiveEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// Agent heartbeat types (v034)
export type AgentRole = 'planner' | 'builder' | 'reviewer' | 'critic' | 'analyst' | 'architect';
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'stale' | 'gone';

export interface AgentState {
  role: AgentRole;
  status: AgentStatus;
  detail: string | null;
  pid: number | null;
  lastHeartbeat: string | null;
}

// Inspection types (v035)
export type InspectionCategory = 'report' | 'error' | 'warning' | 'blocker-report' | 'todo' | 'triage';
export type InspectionStatus = 'resolved' | 'unresolved' | 'pending';
export type InspectionSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface InspectionEntry {
  path: string;
  fileName: string;
  category: InspectionCategory;
  mtime: string;
  status: InspectionStatus;
  severity: InspectionSeverity;
  title: string;
  planRefs: string[];
  summary: string;
  fullContent: string;
}

export interface InspectionSearchParams {
  category?: string;
  status?: string;
  search?: string;
  planRef?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// Prompt types (v036)
export interface PromptEntry { path: string; fileName: string; promptNumber: string; project: string; session: string; title: string; summary: string; response: string; location: 'active' | 'archived'; mtime: string; planRefs: { planNumber: string; wrLabel?: string; title?: string; status?: string }[]; invocationOrder: string[]; fullContent: string }
export interface PromptSearchParams { search?: string; project?: string; session?: string; dateFrom?: string; dateTo?: string; planRef?: string; location?: string; page?: number; pageSize?: number }

// Analytics types (v037)
export interface ConduitMetrics { totalPlansCompleted: number; totalPlansPending: number; totalPlansActive: number; totalPlansBlocked: number; totalBuildersLaunched: number; totalBuildersKilled: number; averagePlanLifetimeSeconds: number; builderStalenessRate: number; circuitBreakerTrips: number; throughputSparkline: number[]; throughputAvg: number; planAgeDistribution: { bucket: string; count: number }[] }

// Changes types (v038)
export type ChangeCategory = 'committed' | 'flagged' | 'reviewed';
export interface ChangePlanRef { planNumber: string; title: string; status: string; declaredFiles: string[]; testsSummary: string | null }
export interface ChangeReportEntry { path: string; fileName: string; category: ChangeCategory; location: 'active' | 'archived'; mtime: string; agent: string; sessionId: string | null; title: string; plansProcessed: number; planRefs: ChangePlanRef[]; summary: string; totalTests: number | null; testsPassing: number | null; allAcceptancePassing: boolean; fullContent: string; newFiles: number; modifyFiles: number }

// Dependency graph types (v042)
export interface DepNode { type: 'prompt' | 'plan'; planNumber: string; title: string; status: string; x: number; y: number }
export interface DepEdge { from: string; to: string }

// Toast types (v041)
export type ToastType = 'builder_stale' | 'builder_killed' | 'circuit_tripped' | 'circuit_resolved' | 'blocker_filed' | 'agent_stale' | 'agent_gone' | 'sse_disconnected' | 'sse_reconnected' | 'run_started' | 'hard_deleted' | 'role_saved';
export interface ToastEntry { id: string; type: ToastType; title: string; message: string; icon: string; timestamp: string; priority: 'high' | 'normal'; }

// SSE event types (v032)
export type ConduitEventType =
  | 'connected'
  | 'plan_created'
  | 'plan_moved'
  | 'plan_archived'
  | 'builder_update'
  | 'circuit_breaker_update'
  | 'agent_update'
  | 'inspection_created'
  | 'inspection_moved'
  | 'inspection_resolved'
  | 'prompt_created'
  | 'prompt_archived'
  | 'change_created'
  | 'change_archived'
  | 'plan_file_added'
  | 'plan_file_removed'
  | 'plan_state_changed'
  | 'plan_deleted'
  | 'state_full'
  | 'session_log'
  | 'session_killed'
  | 'agent_killed'
  | 'conduit_paused';

export interface ConduitEvent {
  type: ConduitEventType;
  data: any;
  timestamp?: string;
}

// Cron schedule config (v092 — exposed by GET /config/cron)
export interface CronConfig {
  cron: string;
  intervalMinutes: number;
  description: string;
  timestamp: string;
}

// Session log event (v071 — streaming live builder output)
export interface SessionLogEvent {
  sessionId: string;
  line: string;
  timestamp: string;
  /** Event type: 'stdout' (default), 'stderr' (error output), 'error' (crash/exit) */
  logType?: 'stdout' | 'stderr' | 'error';
}
