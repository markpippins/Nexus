export type AgentRole = 'planner' | 'builder' | 'reviewer' | 'kernel' | 'executor' | string;

export type WRPState =
  | 'PROPOSED'
  | 'PLANNING'
  | 'PENDING'
  | 'EXECUTING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'ARCHIVED'
  | 'healthy'
  | 'PLAN_CREATE'
  | 'IMPLEMENTATION'
  | 'REVIEW_PASS'
  | 'BLOCK'
  | string;

export type PlanLifecycleStatus = WRPState;

// System & Health
export interface ServiceRootResponse {
  service: string;
  version: string;
  docs: string;
}

export interface HealthzResponse {
  status: string;
}

export interface ReadyzResponse {
  status: string;
  kernel_version: number;
}

export interface SystemStatus {
  pgConnected: boolean;
  pgDsn: string;
  pgSchema: string;
  wrpKernelActive: boolean;
  wrpKernelUrl: string;
  conduitSrvActive?: boolean;
  conduitSrvUrl?: string;
  mcpServerUrl: string;
  activeLeasesCount: number;
  circuitBreakerTripped: boolean;
  lastSyncTimestamp: string;
}

// 1. Delta Ingestion
export interface KernelDeltaReceipt {
  id: string;
  plan_id: string;
  type: string;
  agent_role: AgentRole;
  created_at: string;
  ticket_id?: string;
  summary?: string;
  metadata_json?: string;
  tokens_used?: number;
}

export interface KernelDeltaInput {
  delta_id: string;
  batch_id: string;
  receipts: KernelDeltaReceipt[];
  affected_plans: string[];
  invalidated_plans: string[];
}

export interface DeltaIngestResponse {
  success: boolean;
  version: number;
  delta_id: string;
  plan_count: number;
  receipt_count: number;
  error: string | null;
}

export interface DeltaStateSummary {
  version: number;
  plan_count: number;
  receipt_count: number;
  identity_count: number;
  graph_edge_count: number;
  lineage_event_count: number;
}

// 2. State Inspection
export interface KernelStateSummary {
  kernel_version: number;
  plan_count: number;
  receipt_count: number;
  identity_count: number;
  graph_edge_count: number;
  lineage_event_count: number;
  delta_log_count: number;
}

export interface GraphEdge {
  source?: string;
  source_label?: string;
  target?: string;
  target_label?: string;
  relation: string;
  metadata?: Record<string, any>;
}

export interface KernelIdentity {
  id: string;
  aliases: string[];
  label: string;
  edges_outgoing?: GraphEdge[];
  edges_incoming?: GraphEdge[];
  node_ids?: string[];
}

export interface ReceiptItem {
  id: string;
  plan_id: string;
  type: string;
  agent_role: AgentRole;
  session_id?: string;
  ticket_id?: string;
  artifact_path?: string;
  summary?: string;
  metadata_json?: string;
  tokens_used?: number;
  created_at: string;
}

export interface PlanDetailResponse {
  plan_num: string;
  identity_id: string;
  aliases: string[];
  label: string;
  receipt_count: number;
  current_wrp_state: WRPState;
  valid_transitions: WRPState[];
  receipts: ReceiptItem[];
  edges_outgoing: GraphEdge[];
  edges_incoming: GraphEdge[];
}

export interface CrossPlanGraphNode {
  id: string;
  aliases: string[];
  label: string;
}

export interface CrossPlanGraphResponse {
  nodes: CrossPlanGraphNode[];
  edges: GraphEdge[];
  total_edges: number;
  cursor: string;
  limit: number;
}

export interface LineageEventItem {
  id: number;
  version: number;
  delta_id: string;
  step: string;
  event_type: string;
  affected_plans: string[];
  detail: string;
}

// 3. Replay
export interface ReplayStateResponse {
  version: number;
  plan_count: number;
  receipt_count: number;
  identity_count: number;
  graph_edge_count: number;
  lineage_event_count: number;
  reconstructed_from_version: number;
}

export interface ReplayCompareResponse {
  match: boolean;
  live_version: number;
  replay_version: number;
  live_plan_count: number;
  replay_plan_count: number;
  live_receipt_count: number;
  replay_receipt_count: number;
  live_identity_count: number;
  replay_identity_count: number;
  live_edge_count: number;
  replay_edge_count: number;
  diffs: string[];
}

// 4. Admin
export interface AdminIdentityItem {
  id: string;
  label: string;
  aliases: string[];
  node_ids: string[];
}

export interface AdminIdentitiesResponse {
  identities: AdminIdentityItem[];
  total: number;
  cursor: string;
  limit: number;
}

export interface EngineConsistencyResponse {
  aligned: boolean;
  engine_version: number;
  delta_log_version: number;
  engine_plan_count: number;
  delta_log_count: number;
  details: string[];
}

// 5. Sessions
export interface KernelSession {
  id: string;
  role: AgentRole;
  state: 'running' | 'completed' | 'failed' | 'stale' | string;
  detail: string;
  pid: number;
  cost_usd: number;
  started_at: string;
  last_heartbeat: string;
}

// 6. Circuit Breaker
export interface BreakerStateResponse {
  tripped: boolean;
  paused: boolean;
  retry_after: number;
  source: string;
  error: string;
  detail: string;
  tripped_at: string | null;
  max_retries_per_model: number;
  retry_delay_seconds: number;
  max_fallbacks: number;
  push_back_to_pending: boolean;
}

export interface FailureRecoveryConfig {
  max_retries_per_model: number;
  retry_delay_seconds: number;
  max_fallbacks: number;
  push_back_to_pending: boolean;
  circuit_breaker_retry_after?: number;
}

// Model Chain
export interface ModelChainConfig {
  role: AgentRole;
  primaryModel: string;
  fallbackModels: string[];
  maxRetries: number;
  retryDelaySeconds: number;
  budgetCapUsd: number;
  currentUsageUsd: number;
  circuitBreakerTripped: boolean;
}

// Legacy Compatibility Interfaces
export interface HTMLHarvest {
  id: string;
  title: string;
  rawHtmlContent: string;
  harvestedAt?: string;
  ingestedAt?: string;
  author: string;
  sourceUrl?: string;
  tags: string[];
  extractedCandidatesCount?: number;
  candidateCount?: number;
}

export interface CandidateItem {
  id: string;
  harvestId: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
  category: 'architecture' | 'feature' | 'security' | 'refactor' | string;
  suggestedSystem: string;
  status?: string;
  promotedToIntentId?: string;
  createdAt?: string;
}

export interface IntentRecord {
  id: string;
  candidateId: string;
  systemId: string;
  subsystemId: string;
  summary: string;
  targetOutcome: string;
  status: 'DRAFT' | 'PROMOTED' | 'REJECTED' | 'promoted_to_requirement' | 'draft' | string;
  promotedToReqId?: string;
  intentScope?: string;
  impactScore?: number;
  createdAt?: string;
}

export interface RequirementSpec {
  id: string;
  intentId: string;
  title: string;
  codeName: string;
  acceptanceCriteria: string[];
  status: 'DRAFT' | 'REVIEW' | 'CANONICALIZED' | 'canonicalized' | string;
  canonicalSpecId?: string;
  priority?: string;
  estimatedComplexity?: string;
  createdAt?: string;
}

export interface SystemCanonicalSpec {
  id: string;
  requirementId: string;
  systemName: string;
  subsystemName: string;
  architectureSummary: string;
  apiContracts: string[];
  createdAt?: string;
  updatedAt?: string;
  specVersion?: string;
  moduleBoundaries?: string[];
  status?: string;
}

export interface DeliberationVote {
  agentId: string;
  agentRole: AgentRole;
  modelName: string;
  vote: 'APPROVE' | 'REJECT' | 'NEUTRAL' | string;
  comments: string;
  feasibilityScore: number;
  votedAt: string;
}

export interface DeliberationAgenda {
  id: string;
  specId: string;
  topicTitle?: string;
  proposedByRole: AgentRole;
  status: 'OPEN' | 'CONSENSUS' | 'DEADLOCK' | 'CONSENSUS_REACHED' | 'IN_DELIBERATION' | string;
  votes?: DeliberationVote[];
  consensusScore?: number;
  promotedToPlanId?: string;
  title?: string;
  createdAt?: string;
  feasibilityConsensusScore?: number;
  participants?: any[];
  discussionTranscript?: any[];
  summaryOutput?: string;
}

export interface LegacyReceipt {
  id: string;
  ticketId: string;
  receiptType: WRPState;
  issuedAt: string;
  payload: any;
  hash: string;
  previousHash?: string;
}

export interface ImplementationPlan {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  status: WRPState;
  currentRole: AgentRole;
  modelChain: string[];
  activeModel: string;
  costUsd: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
  retryAttempts: number;
  receipts: LegacyReceipt[];
  specId?: string;
  blockReason?: string;
  leaseOwner?: string;
}

export interface WorkRequestDCO {
  id: string;
  planId: string;
  leaseOwnerPid?: string;
  leaseOwner?: string;
  role?: string;
  attemptStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SUCCEEDED' | string;
  attemptId?: string;
  leaseExpiresAt?: string;
  promptSha256?: string;
  costLimitUsd?: number;
  leaseId?: string;
  primaryModel?: string;
  inputPayload?: any;
  costEstimateUsd?: number;
  outputResult?: any;
  createdAt?: string;
  completedAt?: string;
  executionReceiptHash?: string;
}

export interface WRPKernelDelta {
  id?: string;
  batchId?: string;
  version?: number;
  reducedAt?: string;
  receiptsCount?: number;
  deltaHash?: string;
  sequenceId?: number;
  receiptId?: string;
  planId?: string;
  action?: string;
  deltaType?: string;
  timestamp?: string;
  engineSignature?: string;
  stateHash?: string;
}

export interface SystemNode {
  id: string;
  name: string;
  type: 'feature' | 'system' | 'subsystem' | 'work_request' | 'module' | string;
  parentId?: string;
  status: WRPState;
  children?: SystemNode[];
  description?: string;
  linkedSpecsCount?: number;
  linkedWorkRequestsCount?: number;
}

// -------------------------------------------------------------
// TypeScript conduit-srv (:3104) Types
// -------------------------------------------------------------

// Workflows
export interface WorkflowItem {
  workflowId: string;
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | string;
  startTime: string;
  closeTime: string | null;
  planId: string;
  role: AgentRole;
  pid?: number;
}

export interface WorkflowListResponse {
  connected: boolean;
  counts: {
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  };
  workflows: WorkflowItem[];
}

// Ticket Detection & Lineage
export interface TicketDetectionResponse {
  detected: boolean;
  stale: number;
  expired: number;
  timestamp: string;
}

export interface TicketLineageItem {
  id: string;
  role: AgentRole;
  status: string;
  tokens_used: number;
  parent_ticket_id: string | null;
  spawn_reason: string | null;
  replacement_of: string | null;
  closure_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface TicketLineageResponse {
  plan_id: string;
  tickets: TicketLineageItem[];
}

// Token Usage
export interface TokenPlanUsageResponse {
  plan_id: string;
  total_tokens: number;
  receipts: number;
}

export interface TokenRoleUsageResponse {
  role: AgentRole;
  total_tokens: number;
  receipts: number;
}

export interface TokenTicketUsageResponse {
  ticket_id: string;
  tokens_used: number;
}

// Config
export interface CronConfigResponse {
  cron: string;
  intervalMinutes: number;
  description: string;
  timestamp: string;
}

// Governance
export interface GovernanceReplayResponse {
  ok: boolean;
  replayed: number;
}

export interface GovernanceEventItem {
  id: number;
  receipt_id: string;
  event_type: string;
  work_request_id?: string;
  plan_id: string;
  agent_role: AgentRole;
  payload: any;
  created_at: string;
  replayed_at: string;
}

export interface GovernanceEventsResponse {
  ok: boolean;
  events: GovernanceEventItem[];
}

// Vision Work Requests
export interface VisionWorkRequest {
  id: number;
  wr_id: string;
  work_request_uuid: string;
  dco_json: string;
  context: Record<string, any>;
  status: string;
  title: string;
  recorded_on_dt: string;
  updated_at: string;
}

export interface VisionWorkRequestInput {
  id: string;
  work_request_uuid?: string;
  dco_json?: string;
  context?: Record<string, any>;
  status?: string;
  title?: string;
}

export interface VisionWorkRequestsResponse {
  ok: boolean;
  work_requests: VisionWorkRequest[];
}

export interface VisionWorkRequestSingleResponse {
  ok: boolean;
  work_request: VisionWorkRequest;
}

export interface VisionWorkRequestUpsertResponse {
  ok: boolean;
  id: string;
  work_request_uuid: string;
  action: 'created' | 'updated' | string;
}

// Vision Receipts
export interface VisionReceiptItem {
  id: string;
  plan_id: string;
  type: WRPState;
  agent_role: AgentRole;
  session_id: string;
  ticket_id: string;
  artifact_path: string;
  summary: string;
  metadata_json: string;
  tokens_used: number;
  created_at: string;
  sequence: number;
}

export interface VisionReceiptsResponse {
  ok: boolean;
  receipts: VisionReceiptItem[];
}

