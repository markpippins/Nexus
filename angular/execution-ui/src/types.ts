export type RequestStatus = 'PENDING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type LeaseStatus = 'ACTIVE' | 'RELEASED' | 'EXPIRED';
export type AttemptStatus = 'CREATED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
export type ThemeMode = 'dark' | 'light' | 'steel';
export type ReceiptEventType = 
  | 'LEASE_ACQUIRED' 
  | 'EXECUTION_START' 
  | 'CHECKPOINT' 
  | 'EXECUTION_COMPLETE' 
  | 'EXECUTION_FAILED' 
  | 'LEASE_RELEASED';

export type LifecycleState = 'live' | 'released' | 'stale_active' | 'expired_unreleased';

export interface RequestItem {
  id: string;
  status: RequestStatus;
  executor_id: string;
  payload: Record<string, any>;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface LeaseItem {
  id: string;
  request_id: string;
  executor_id: string;
  status: LeaseStatus;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  promised_ttl_seconds: number;
  actual_ttl_seconds?: number | null;
  lifecycle_state?: LifecycleState;
}

export interface AttemptItem {
  id: string;
  request_id: string;
  lease_id: string;
  status: AttemptStatus;
  executor_id: string;
  attempt_number: number;
  started_at: string;
  finished_at: string | null;
  error_message?: string | null;
}

export interface ReceiptItem {
  id: string;
  request_id: string;
  attempt_id: string;
  lease_id: string;
  event_type: ReceiptEventType;
  created_at: string;
  lineage_source?: string | null;
  lineage_original_id?: string | null;
  payload?: Record<string, any>;
}

export interface RequestStateResponse {
  request: RequestItem;
  lease: LeaseItem | null;
  latest_attempt: AttemptItem | null;
  receipts: ReceiptItem[];
}

export interface LeaseLifecycleResponse {
  id: string;
  request_id: string;
  executor_id: string;
  status: LeaseStatus;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  promised_ttl_seconds: number;
  actual_ttl_seconds: number | null;
  expiry_gap_seconds: number;
  lifecycle_state: LifecycleState;
}

export type PathologyKind =
  | 'orphan_lease_request_mismatch'
  | 'stale_active_lease'
  | 'attempt_orphan_no_lease'
  | 'attempt_status_diverges_from_request'
  | 'receipt_request_mismatch'
  | 'receipt_attempt_mismatch'
  | 'unreleased_lease_for_terminal_request'
  | 'attempted_no_completion';

export interface PathologyItem {
  kind: PathologyKind;
  count: number;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  samples: Array<Record<string, any>>;
}

export interface IntegrityScanResponse {
  scanned_at: string;
  total_pathologies: number;
  total_issues_count: number;
  items: PathologyItem[];
}

export interface PipelineOriginResponse {
  receipt_id: string;
  relationship: 'native_execution_only' | 'backfilled_from_vision' | string;
  execution_receipt: ReceiptItem;
  vision_receipt: ReceiptItem | null;
  diff_fields: Array<{
    field: string;
    execution_value: any;
    vision_value: any;
    matches: boolean;
  }>;
}

export interface ExecutorFleetSummary {
  executor_id: string;
  active_leases_count: number;
  in_progress_attempts_count: number;
  total_requests_handled: number;
  health_status: 'HEALTHY' | 'STALE_LEASES' | 'OVERLOADED' | 'IDLE';
  last_heartbeat: string;
}

export interface ExecutorFleetDetail {
  summary: ExecutorFleetSummary;
  active_leases: LeaseItem[];
  in_progress_attempts: AttemptItem[];
  recent_completed_count: number;
  recent_failed_count: number;
}

export interface StatusDistributionResponse {
  timestamp: string;
  requests: Record<RequestStatus, number>;
  leases: Record<LeaseStatus, number>;
  attempts: Record<AttemptStatus, number>;
  receipts: Record<ReceiptEventType, number>;
}

export interface RootHealthCheck {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected' | 'mocked';
  tables: {
    requests: number;
    leases: number;
    attempts: number;
    receipts: number;
  };
}

export interface ExecutionInlineHealth {
  status: 'healthy' | 'degraded';
  ready_requests: number;
  stale_active_leases: number;
  running_attempts: number;
  total_requests: number;
  total_leases: number;
  total_attempts: number;
  total_receipts: number;
  scan_status: 'pathologies_detected' | 'clean';
}

export interface RequestLineageBuckets {
  request_id: string;
  native: ReceiptItem[];
  backfilled: ReceiptItem[];
  unknown: ReceiptItem[];
}

export interface RequestAttemptsTree {
  request_id: string;
  attempts: Array<{
    attempt: AttemptItem;
    lease: LeaseItem | null;
    receipts: ReceiptItem[];
  }>;
}

export type NavTab = 
  | 'dashboard'
  | 'integrity-scan'
  | 'requests'
  | 'request-detail'
  | 'leases'
  | 'lease-detail'
  | 'attempts'
  | 'receipts-origin'
  | 'fleet'
  | 'api-docs'
  | 'settings';
