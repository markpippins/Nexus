export type ArtifactStage = 
  | 'harvest' 
  | 'candidate' 
  | 'intent' 
  | 'requirement' 
  | 'specification' 
  | 'plan' 
  | 'work_request';

export type PlanLifecycleStatus = 
  | 'PROPOSED' 
  | 'PLANNING' 
  | 'PENDING' 
  | 'ACTIVE' 
  | 'COMPLETED' 
  | 'BLOCKED';

export type AgentRole = 'planner' | 'builder' | 'reviewer' | 'kernel' | 'executor';

export type ExecutionAttemptStatus = 'SUCCEEDED' | 'FAILED' | 'FATAL_ERROR' | 'IN_PROGRESS';

export interface HTMLHarvest {
  id: string;
  title: string;
  sourceUrl?: string;
  ingestedAt: string;
  rawHtmlContent: string;
  candidateCount: number;
  author: string;
  tags: string[];
}

export interface CandidateItem {
  id: string;
  harvestId: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'architecture' | 'bug' | 'feature' | 'security' | 'refactor';
  status: 'unassigned' | 'converted_to_intent' | 'dismissed';
  createdAt: string;
  suggestedSystem?: string;
}

export interface IntentRecord {
  id: string;
  candidateId: string;
  systemId: string;
  subsystemId: string;
  summary: string;
  intentScope: string;
  impactScore: number; // 1 - 10
  status: 'draft' | 'promoted_to_requirement' | 'archived';
  createdAt: string;
  targetOutcome: string;
}

export interface RequirementSpec {
  id: string;
  intentId: string;
  codeName: string; // e.g. REQ-AUTH-004
  title: string;
  acceptanceCriteria: string[];
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'draft' | 'canonicalized' | 'in_deliberation';
  estimatedComplexity: 'S' | 'M' | 'L' | 'XL';
  createdAt: string;
}

export interface SystemCanonicalSpec {
  id: string;
  requirementId: string;
  systemName: string; // e.g. nexus.kernel.engine
  subsystemName: string; // e.g. wrp_kernel
  specVersion: string;
  architectureSummary: string;
  apiContracts: string[];
  moduleBoundaries: string[];
  status: 'canonical' | 'deprecated' | 'under_review';
  updatedAt: string;
}

export interface DeliberationParticipant {
  agentId: string;
  name: string;
  role: AgentRole;
  model: string;
  vote?: 'APPROVE' | 'REJECT' | 'NEUTRAL';
  comments?: string;
  feasibilityScore?: number; // 0 - 100
}

export interface DeliberationAgenda {
  id: string;
  specId: string;
  title: string;
  proposedByRole: AgentRole;
  createdAt: string;
  status: 'OPEN' | 'IN_DELIBERATION' | 'CONSENSUS_REACHED' | 'REJECTED';
  feasibilityConsensusScore: number; // 0 - 100
  participants: DeliberationParticipant[];
  discussionTranscript: Array<{
    timestamp: string;
    agentId: string;
    agentName: string;
    role: AgentRole;
    text: string;
  }>;
  summaryOutput?: string;
}

export interface Receipt {
  id: string;
  ticketId: string;
  receiptType: 'PROPOSED' | 'PLANNING' | 'PLAN_CREATE' | 'IMPLEMENTATION' | 'REVIEW_PASS' | 'BLOCK';
  issuedAt: string;
  payload: Record<string, any>;
  hash: string;
  previousHash?: string;
}

export interface ImplementationPlan {
  id: string; // e.g., plan_0075
  ticketId: string;
  title: string;
  description: string;
  specId?: string;
  status: PlanLifecycleStatus;
  currentRole: AgentRole;
  modelChain: string[];
  activeModel: string;
  costUsd: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
  receipts: Receipt[];
  leaseOwner?: string;
  retryAttempts: number;
  blockReason?: string;
}

export interface WorkRequestDCO {
  id: string; // e.g. WR-2026-088
  planId: string;
  role: AgentRole;
  leaseId: string;
  leaseOwner: string;
  leaseExpiresAt: string;
  attemptId: string;
  attemptStatus: ExecutionAttemptStatus;
  primaryModel: string;
  fallbackUsed?: string;
  inputPayload: string; // JSON / DCO format
  outputResult?: string;
  executionReceiptHash?: string;
  createdAt: string;
  completedAt?: string;
  costEstimateUsd: number;
}

export interface WRPKernelDelta {
  sequenceId: number;
  receiptId: string;
  planId: string;
  action: string;
  deltaType: 'STATE_MUTATION' | 'LINEAGE_LINK' | 'SNAPSHOT_POINT';
  timestamp: string;
  engineSignature: string;
  stateHash: string;
}

export interface SystemNode {
  id: string;
  name: string;
  type: 'system' | 'subsystem' | 'module';
  description: string;
  status: 'healthy' | 'degraded' | 'maintenance';
  children?: SystemNode[];
  linkedSpecsCount: number;
  linkedWorkRequestsCount: number;
}

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

export interface SystemStatus {
  pgConnected: boolean;
  pgDsn: string;
  pgSchema: string;
  wrpKernelActive: boolean;
  wrpKernelUrl: string;
  mcpServerUrl: string;
  activeLeasesCount: number;
  circuitBreakerTripped: boolean;
  lastSyncTimestamp: string;
}
