// Pipeline state types

export type PlanStatus = 'pending' | 'active' | 'completed' | 'blocked' | 'proposed' | 'planning';

export interface PlanCard {
  fileName: string;
  planNumber: string;
  baseName: string;
  title: string;
  project: string;
  createdAt: string; // ISO date
  movedAt?: string;
  completedAt?: string;
  blockReason?: string;
  goal?: string;
  filesAffected?: string[];
  acceptanceCriteria?: string[];
  dependencies?: string[];
  promptRef?: string;  // prompt number this plan was spawned from
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

export interface PipelineState {
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
}

// SSE event types
export type PipelineEventType =
  | 'plan_created'
  | 'plan_moved'
  | 'plan_file_added'      // file appeared on disk (content sync, not state change)
  | 'plan_file_removed'    // file deleted from disk (content sync, not state change)
  | 'plan_state_changed'   // receipt was issued, state changed (authoritative)
  | 'plan_archived'
  | 'plan_deleted'
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
  | 'state_full';

export interface PipelineEvent {
  type: PipelineEventType;
  data: any;
  timestamp: string;
}

export interface ParsedPlan {
  fileName: string;
  planNumber: string;
  baseName: string;
  title: string;
  project: string;
  goal: string;
  filesAffected: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
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
export interface PromptEntry {
  path: string;
  fileName: string;
  promptNumber: string;
  project: string;
  session: string;
  title: string;
  summary: string;
  response: string;
  location: 'active' | 'archived';
  mtime: string;
  planRefs: { planNumber: string; wrLabel?: string; title?: string; status?: string }[];
  invocationOrder: string[];
  fullContent: string;
}

export interface PromptSearchParams {
  search?: string;
  project?: string;
  session?: string;
  dateFrom?: string;
  dateTo?: string;
  planRef?: string;
  location?: string;
  page?: number;
  pageSize?: number;
}

// Analytics types (v037)
export interface TimeSeriesPoint { label: string; value: number }
export interface PipelineMetrics {
  totalPlansCompleted: number;
  totalPlansPending: number;
  totalPlansActive: number;
  totalPlansBlocked: number;
  totalBuildersLaunched: number;
  totalBuildersKilled: number;
  averagePlanLifetimeSeconds: number;
  builderStalenessRate: number;
  circuitBreakerTrips: number;
  throughputSparkline: number[];
  throughputAvg: number;
  planAgeDistribution: { bucket: string; count: number }[];
}

// Changes types (v038)
export type ChangeCategory = 'committed' | 'flagged' | 'reviewed';
export interface FileChange { action: 'NEW' | 'MODIFY' | 'DELETE'; path: string }
export interface ChangePlanRef { planNumber: string; title: string; status: string; declaredFiles: string[]; testsSummary: string | null }
export interface ChangeReportEntry {
  path: string;
  fileName: string;
  category: ChangeCategory;
  location: 'active' | 'archived';
  mtime: string;
  agent: string;
  sessionId: string | null;
  title: string;
  plansProcessed: number;
  planRefs: ChangePlanRef[];
  summary: string;
  totalTests: number | null;
  testsPassing: number | null;
  allAcceptancePassing: boolean;
  fullContent: string;
  newFiles: number;
  modifyFiles: number;
}

// Receipt types (v056)
export type ReceiptType = 'PLAN_CREATE' | 'IMPLEMENTATION' | 'REVIEW_PASS' | 'REVIEW_REJECT' | 'BLOCK' | 'PROPOSED' | 'PLANNING' | 'REVIEW' | 'CRITIQUE' | 'CRITIQUE_PASS' | 'CRITIQUE_REJECT' | 'PLAN_BLOCK';

export interface IssueReceiptInput {
  plan_id: string;        // required: plan number e.g. "0053"
  type: ReceiptType;      // required
  agent_role: string;     // required: planner|builder|reviewer|watchdog
  session_id?: string;    // optional: builder-20260605-120000
  artifact_path?: string; // optional: relative path to proof file
  summary?: string;       // optional: one-line description
  metadata?: Record<string, any>; // optional: arbitrary JSON
}
