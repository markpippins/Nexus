/**
 * execution-srv — TypeSpec Models
 *
 * Reverse-engineered from typescript/execution-srv/src/routes.ts
 * and the `execution` schema DDL. Column shapes follow the DB.
 */
namespace org.nexus.executionsrv {

  // ── execution.requests ────────────────────────────────────────

  model ExecutionRequest {
    id: string;
    business_key: string;
    title: string;
    intent_type: string;
    objective: string;
    inputs: unknown;
    deterministic: boolean;
    max_retries?: int32;
    timeout_policy?: string;
    resource_hints?: string[];
    op_trace: unknown;
    status: string;
    source_plan?: string;
    created_at: string;
    updated_at: string;
    source_wr_id?: string;
  }

  // ── execution.leases ──────────────────────────────────────────

  model ExecutionLease {
    id: string;
    request_id: string;
    executor_id: string;
    status: string;
    ttl_seconds: int32;
    acquired_at: string;
    expires_at: string;
    released_at?: string;
    created_at: string;
  }

  // ── execution.attempts ────────────────────────────────────────

  model ExecutionAttempt {
    id: string;
    lease_id: string;
    request_id: string;
    executor_id: string;
    status: string;
    started_at?: string;
    completed_at?: string;
    result: unknown;
    error?: string;
    exit_code?: int32;
    created_at: string;
  }

  // ── execution.receipts ────────────────────────────────────────

  model ExecutionReceipt {
    id: string;
    attempt_id?: string;
    request_id: string;
    type: string;
    agent_role: string;
    summary: string;
    metadata: unknown;
    lineage_source?: string;
    lineage_original_id?: string;
    issued_at: string;
  }

  // ── Paginated list envelope ───────────────────────────────────

  model PaginatedList {
    total: int32;
    limit: int32;
    offset: int32;
  }

  model RequestList is PaginatedList {
    items: ExecutionRequest[];
  }

  model LeaseList is PaginatedList {
    items: ExecutionLease[];
  }

  model AttemptList is PaginatedList {
    items: ExecutionAttempt[];
  }

  model ReceiptList is PaginatedList {
    items: ExecutionReceipt[];
  }

  // ── Lifecycle / health shapes ─────────────────────────────────

  model RequestState {
    request: ExecutionRequest;
    lease?: ExecutionLease;
    latestAttempt?: ExecutionAttempt;
    receipts: ExecutionReceipt[];
  }

  model LeaseLifecycle {
    lease: ExecutionLease;
    attempts: ExecutionAttempt[];
  }

  model StaleLease {
    id: string;
    request_id: string;
    executor_id: string;
    status: string;
    expires_at: string;
    age_seconds: float64;
  }

  model IntegrityScan {
    orphan_attempts: int32;
    orphan_receipts: int32;
    leases_past_expiry: int32;
    missing_request_lease: int32;
    checked_at: string;
  }

  model ExecutorHealth {
    executor_id: string;
    active_leases: int32;
    completed_attempts: int32;
    failed_attempts: int32;
    last_seen?: string;
  }

  model StatusDistribution {
    status: string;
    count: int32;
  }

  model PipelineOrigin {
    execution: ExecutionReceipt;
    vision?: { id: string; type: string; issued_at?: string };
  }

  // ── Error envelope ────────────────────────────────────────────

  model ErrorDetail {
    error: string;
  }

  model HealthResponse {
    status: string;
    timestamp: string;
    db_connected: boolean;
  }
}