import {
  RequestItem,
  RequestStatus,
  LeaseItem,
  LeaseStatus,
  AttemptItem,
  AttemptStatus,
  ReceiptItem,
  ReceiptEventType,
  LifecycleState,
  RootHealthCheck,
  ExecutionInlineHealth,
  RequestStateResponse,
  LeaseLifecycleResponse,
  IntegrityScanResponse,
  PathologyItem,
  PathologyKind,
  RequestAttemptsTree,
  RequestLineageBuckets,
  ExecutorFleetSummary,
  ExecutorFleetDetail,
  StatusDistributionResponse,
  PipelineOriginResponse
} from '../types';

export function mapRequestItem(raw: any): RequestItem {
  if (!raw) {
    return {
      id: '',
      status: 'PENDING',
      executor_id: 'unassigned',
      payload: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  return {
    id: String(raw.id || ''),
    status: (raw.status || 'PENDING') as RequestStatus,
    executor_id: String(raw.executor_id || 'unassigned'),
    payload: raw.payload || raw.inputs || {},
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || raw.created_at || new Date().toISOString(),
    metadata: raw.metadata || undefined
  };
}

export function mapLeaseItem(raw: any): LeaseItem {
  if (!raw) {
    return {
      id: '',
      request_id: '',
      executor_id: 'unassigned',
      status: 'ACTIVE',
      acquired_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
      released_at: null,
      promised_ttl_seconds: 30
    };
  }

  const acquired_at = raw.acquired_at || raw.created_at || new Date().toISOString();
  const promised_ttl_seconds = Number(raw.promised_ttl_seconds ?? raw.ttl_seconds ?? 30);

  let expires_at = raw.expires_at;
  if (!expires_at) {
    expires_at = new Date(new Date(acquired_at).getTime() + promised_ttl_seconds * 1000).toISOString();
  }

  const released_at = raw.released_at ?? null;
  const status = (raw.status || raw.request_status || 'ACTIVE') as LeaseStatus;

  let actual_ttl_seconds = raw.actual_ttl_seconds ?? raw.actual_held_seconds;
  if (actual_ttl_seconds === undefined || actual_ttl_seconds === null) {
    const startMs = new Date(acquired_at).getTime();
    if (released_at) {
      actual_ttl_seconds = Math.round((new Date(released_at).getTime() - startMs) / 1000);
    } else {
      actual_ttl_seconds = Math.round((Date.now() - startMs) / 1000);
    }
  }

  let lifecycle_state = raw.lifecycle_state as LifecycleState | undefined;
  if (!lifecycle_state) {
    const nowMs = Date.now();
    const expMs = new Date(expires_at).getTime();
    if (status === 'RELEASED') {
      lifecycle_state = 'released';
    } else if (status === 'EXPIRED' && !released_at) {
      lifecycle_state = 'expired_unreleased';
    } else if (status === 'ACTIVE' && expMs < nowMs) {
      lifecycle_state = 'stale_active';
    } else {
      lifecycle_state = 'live';
    }
  }

  return {
    id: String(raw.id || raw.lease_id || ''),
    request_id: String(raw.request_id || ''),
    executor_id: String(raw.executor_id || 'unassigned'),
    status,
    acquired_at,
    expires_at,
    released_at,
    promised_ttl_seconds,
    actual_ttl_seconds,
    lifecycle_state
  };
}

export function mapAttemptItem(raw: any, index?: number): AttemptItem {
  if (!raw) {
    return {
      id: '',
      request_id: '',
      lease_id: '',
      status: 'CREATED',
      executor_id: 'unassigned',
      attempt_number: 1,
      started_at: new Date().toISOString(),
      finished_at: null
    };
  }

  return {
    id: String(raw.id || ''),
    request_id: String(raw.request_id || ''),
    lease_id: String(raw.lease_id || ''),
    status: (raw.status || 'CREATED') as AttemptStatus,
    executor_id: String(raw.executor_id || 'unassigned'),
    attempt_number: Number(raw.attempt_number ?? (index !== undefined ? index + 1 : 1)),
    started_at: raw.started_at || raw.created_at || new Date().toISOString(),
    finished_at: raw.finished_at ?? raw.completed_at ?? null,
    error_message: raw.error_message ?? raw.error ?? null
  };
}

export function mapReceiptItem(raw: any): ReceiptItem {
  if (!raw) {
    return {
      id: '',
      request_id: '',
      attempt_id: '',
      lease_id: '',
      event_type: 'CHECKPOINT',
      created_at: new Date().toISOString()
    };
  }

  return {
    id: String(raw.id || ''),
    request_id: String(raw.request_id || ''),
    attempt_id: String(raw.attempt_id || ''),
    lease_id: String(raw.lease_id || ''),
    event_type: (raw.event_type || raw.type || 'CHECKPOINT') as ReceiptEventType,
    created_at: raw.created_at || raw.issued_at || new Date().toISOString(),
    lineage_source: raw.lineage_source ?? null,
    lineage_original_id: raw.lineage_original_id ?? null,
    payload: raw.payload || raw.metadata || {}
  };
}

export function mapRootHealth(raw: any): RootHealthCheck {
  if (!raw) {
    return {
      status: 'ok',
      database: 'connected',
      tables: { requests: 0, leases: 0, attempts: 0, receipts: 0 }
    };
  }

  const isDbConnected = raw.database === 'connected' || raw.db === true;
  return {
    status: raw.status || 'ok',
    database: isDbConnected ? 'connected' : (raw.database || 'disconnected'),
    tables: {
      requests: Number(raw.tables?.requests ?? raw.counts?.requests ?? 0),
      leases: Number(raw.tables?.leases ?? raw.counts?.leases ?? 0),
      attempts: Number(raw.tables?.attempts ?? raw.counts?.attempts ?? 0),
      receipts: Number(raw.tables?.receipts ?? raw.counts?.receipts ?? 0)
    }
  };
}

export function mapInlineHealth(raw: any): ExecutionInlineHealth {
  if (!raw) {
    return {
      status: 'healthy',
      ready_requests: 0,
      stale_active_leases: 0,
      running_attempts: 0,
      total_requests: 0,
      total_leases: 0,
      total_attempts: 0,
      total_receipts: 0,
      scan_status: 'clean'
    };
  }

  const stale_active = Number(raw.stale_active_leases ?? 0);
  return {
    status: raw.status || (stale_active > 0 ? 'degraded' : 'healthy'),
    ready_requests: Number(raw.ready_requests ?? 0),
    stale_active_leases: stale_active,
    running_attempts: Number(raw.running_attempts ?? 0),
    total_requests: Number(raw.total_requests ?? raw.requests ?? 0),
    total_leases: Number(raw.total_leases ?? raw.leases ?? 0),
    total_attempts: Number(raw.total_attempts ?? raw.attempts ?? 0),
    total_receipts: Number(raw.total_receipts ?? raw.receipts ?? 0),
    scan_status: raw.scan_status || (stale_active > 0 ? 'pathologies_detected' : 'clean')
  };
}

export function mapRequestState(raw: any): RequestStateResponse | null {
  if (!raw || !raw.request) return null;
  return {
    request: mapRequestItem(raw.request),
    lease: raw.lease ? mapLeaseItem(raw.lease) : (raw.current_lease ? mapLeaseItem(raw.current_lease) : null),
    latest_attempt: raw.latest_attempt ? mapAttemptItem(raw.latest_attempt) : null,
    receipts: Array.isArray(raw.receipts) ? raw.receipts.map(mapReceiptItem) : []
  };
}

export function mapStaleLeases(raw: any): LeaseItem[] {
  const items = Array.isArray(raw) ? raw : (raw?.stale_leases || []);
  return items.map(mapLeaseItem);
}

export function mapLeaseLifecycle(raw: any): LeaseLifecycleResponse | null {
  if (!raw) return null;
  const acquired_at = raw.acquired_at || new Date().toISOString();
  const promised_ttl = Number(raw.promised_ttl_seconds ?? raw.ttl_seconds ?? 30);
  const expires_at = raw.expires_at || new Date(new Date(acquired_at).getTime() + promised_ttl * 1000).toISOString();
  const released_at = raw.released_at ?? null;

  let actual_ttl = raw.actual_ttl_seconds ?? raw.actual_held_seconds;
  if (actual_ttl === undefined || actual_ttl === null) {
    if (released_at) {
      actual_ttl = Math.round((new Date(released_at).getTime() - new Date(acquired_at).getTime()) / 1000);
    } else {
      actual_ttl = null;
    }
  }

  const expiry_gap = Number(raw.expiry_gap_seconds ?? raw.overdue_seconds ?? Math.round((Date.now() - new Date(expires_at).getTime()) / 1000));

  let lifecycle_state = raw.lifecycle_state as LifecycleState;
  if (!lifecycle_state) {
    if (raw.status === 'RELEASED') lifecycle_state = 'released';
    else if (raw.status === 'EXPIRED') lifecycle_state = 'expired_unreleased';
    else if (raw.status === 'ACTIVE' && expiry_gap > 0) lifecycle_state = 'stale_active';
    else lifecycle_state = 'live';
  }

  return {
    id: String(raw.id || ''),
    request_id: String(raw.request_id || ''),
    executor_id: String(raw.executor_id || 'unassigned'),
    status: (raw.status || 'ACTIVE') as LeaseStatus,
    acquired_at,
    expires_at,
    released_at,
    promised_ttl_seconds: promised_ttl,
    actual_ttl_seconds: actual_ttl,
    expiry_gap_seconds: expiry_gap,
    lifecycle_state
  };
}

const PATHOLOGY_META: Record<string, { title: string; description: string; severity: PathologyItem['severity'] }> = {
  orphan_lease_request_mismatch: {
    title: 'Orphan Lease Request Mismatch',
    description: 'lease.request_id has no matching execution.requests record.',
    severity: 'CRITICAL'
  },
  stale_active_lease: {
    title: 'Stale Active Lease',
    description: 'lease.status=ACTIVE and expires_at < now() (TTL enforcement gap).',
    severity: 'CRITICAL'
  },
  attempt_orphan_no_lease: {
    title: 'Attempt Orphan No Lease',
    description: 'attempt.lease_id has no matching execution.leases record.',
    severity: 'CRITICAL'
  },
  attempt_status_diverges_from_request: {
    title: 'Attempt Status Diverges From Request',
    description: 'request.status=COMPLETED while attempt is CREATED/RUNNING, or READY request has SUCCEEDED attempt.',
    severity: 'WARNING'
  },
  receipt_request_mismatch: {
    title: 'Receipt Request Mismatch',
    description: 'receipt.request_id has no matching execution.requests record.',
    severity: 'CRITICAL'
  },
  receipt_attempt_mismatch: {
    title: 'Receipt Attempt Mismatch',
    description: 'receipt.attempt_id has no matching execution.attempts record.',
    severity: 'WARNING'
  },
  unreleased_lease_for_terminal_request: {
    title: 'Unreleased Lease for Terminal Request',
    description: 'request.status in (COMPLETED, CANCELLED, FAILED) but lease is still ACTIVE.',
    severity: 'CRITICAL'
  },
  attempted_no_completion: {
    title: 'Attempted No Completion',
    description: 'request status not terminal and all attempts are CREATED without progress.',
    severity: 'INFO'
  }
};

export function mapIntegrityScan(raw: any): IntegrityScanResponse {
  if (!raw) {
    return {
      scanned_at: new Date().toISOString(),
      total_pathologies: 0,
      total_issues_count: 0,
      items: []
    };
  }

  const scanItems = raw.items || raw.scans || [];
  const mappedItems: PathologyItem[] = scanItems.map((item: any) => {
    const kind = item.kind as PathologyKind;
    const meta = PATHOLOGY_META[kind] || {
      title: kind,
      description: 'System pathology detected during integrity scan.',
      severity: 'WARNING'
    };

    return {
      kind,
      count: Number(item.count ?? 0),
      severity: item.severity || meta.severity,
      title: item.title || meta.title,
      description: item.description || meta.description,
      samples: Array.isArray(item.samples) ? item.samples : []
    };
  });

  const totalIssues = raw.total_issues_count ?? raw.totals?.anomalies ?? mappedItems.reduce((sum, p) => sum + p.count, 0);
  const totalPathologies = raw.total_pathologies ?? raw.totals?.kinds_fired ?? mappedItems.filter(p => p.count > 0).length;

  return {
    scanned_at: raw.scanned_at || new Date().toISOString(),
    total_pathologies: totalPathologies,
    total_issues_count: totalIssues,
    items: mappedItems
  };
}

export function mapRequestAttemptsTree(raw: any, requestId: string): RequestAttemptsTree | null {
  if (!raw) return null;
  const rawAttempts = Array.isArray(raw.attempts) ? raw.attempts : (Array.isArray(raw) ? raw : []);

  const mappedAttempts = rawAttempts.map((row: any, idx: number) => {
    const attemptRaw = row.attempt || row;
    const leaseRaw = row.lease || (row.attempt ? row.attempt.lease : null);
    const receiptsRaw = row.receipts || [];

    return {
      attempt: mapAttemptItem(attemptRaw, idx),
      lease: leaseRaw ? mapLeaseItem(leaseRaw) : null,
      receipts: Array.isArray(receiptsRaw) ? receiptsRaw.map(mapReceiptItem) : []
    };
  });

  return {
    request_id: String(raw.request_id || requestId),
    attempts: mappedAttempts
  };
}

export function mapReceiptsLineage(raw: any, requestId: string): RequestLineageBuckets | null {
  if (!raw) return null;
  const buckets = raw.lineage_buckets || raw;

  return {
    request_id: String(raw.request_id || requestId),
    native: (buckets.native || []).map(mapReceiptItem),
    backfilled: (buckets.backfilled || []).map(mapReceiptItem),
    unknown: (buckets.unknown || []).map(mapReceiptItem)
  };
}

export function mapFleetByExecutor(raw: any, executorId?: string): ExecutorFleetSummary[] | ExecutorFleetDetail {
  if (!raw) {
    if (executorId) {
      return {
        summary: {
          executor_id: executorId,
          active_leases_count: 0,
          in_progress_attempts_count: 0,
          total_requests_handled: 0,
          health_status: 'HEALTHY',
          last_heartbeat: new Date().toISOString()
        },
        active_leases: [],
        in_progress_attempts: [],
        recent_completed_count: 0,
        recent_failed_count: 0
      };
    }
    return [];
  }

  if (executorId) {
    const summaryRaw = raw.summary || raw;
    const activeLeases = (raw.active_leases || []).map(mapLeaseItem);
    const inProgressAttempts = (raw.in_progress_attempts || []).map(mapAttemptItem);

    const activeCount = Number(summaryRaw.active_leases_count ?? summaryRaw.active_leases ?? activeLeases.length ?? 0);
    const inProgressCount = Number(summaryRaw.in_progress_attempts_count ?? summaryRaw.in_progress_attempts ?? inProgressAttempts.length ?? 0);
    const totalHandled = Number(summaryRaw.total_requests_handled ?? summaryRaw.total_leases ?? summaryRaw.requests_held ?? 0);

    const summary: ExecutorFleetSummary = {
      executor_id: executorId,
      active_leases_count: activeCount,
      in_progress_attempts_count: inProgressCount,
      total_requests_handled: totalHandled,
      health_status: summaryRaw.health_status || (activeCount > 10 ? 'OVERLOADED' : 'HEALTHY'),
      last_heartbeat: summaryRaw.last_heartbeat || new Date().toISOString()
    };

    return {
      summary,
      active_leases: activeLeases,
      in_progress_attempts: inProgressAttempts,
      recent_completed_count: Number(raw.recent_completed_count ?? summaryRaw.released_leases ?? Math.round(totalHandled * 0.8)),
      recent_failed_count: Number(raw.recent_failed_count ?? summaryRaw.expired_leases ?? Math.round(totalHandled * 0.05))
    };
  } else {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((item: any) => {
      const activeCount = Number(item.active_leases_count ?? item.active_leases ?? 0);
      const inProgressCount = Number(item.in_progress_attempts_count ?? item.in_progress_attempts ?? 0);
      const totalHandled = Number(item.total_requests_handled ?? item.total_leases ?? item.requests_held ?? 0);

      return {
        executor_id: String(item.executor_id || 'unknown'),
        active_leases_count: activeCount,
        in_progress_attempts_count: inProgressCount,
        total_requests_handled: totalHandled,
        health_status: item.health_status || (activeCount > 10 ? 'OVERLOADED' : 'HEALTHY'),
        last_heartbeat: item.last_heartbeat || item.updated_at || new Date().toISOString()
      };
    });
  }
}

function convertArrayToRecord<K extends string>(arrOrObj: any, keyFields: string[]): Record<K, number> {
  if (Array.isArray(arrOrObj)) {
    const res: Record<string, number> = {};
    for (const item of arrOrObj) {
      let k = '';
      for (const f of keyFields) {
        if (item[f]) {
          k = String(item[f]);
          break;
        }
      }
      const c = Number(item.count ?? 0);
      if (k) res[k] = c;
    }
    return res as Record<K, number>;
  }
  return (arrOrObj || {}) as Record<K, number>;
}

export function mapStatusDistribution(raw: any): StatusDistributionResponse {
  if (!raw) {
    return {
      timestamp: new Date().toISOString(),
      requests: { PENDING: 0, READY: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0, CANCELLED: 0 },
      leases: { ACTIVE: 0, RELEASED: 0, EXPIRED: 0 },
      attempts: { CREATED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, TIMED_OUT: 0 },
      receipts: { LEASE_ACQUIRED: 0, EXECUTION_START: 0, CHECKPOINT: 0, EXECUTION_COMPLETE: 0, EXECUTION_FAILED: 0, LEASE_RELEASED: 0 }
    };
  }

  return {
    timestamp: raw.timestamp || new Date().toISOString(),
    requests: convertArrayToRecord(raw.requests, ['status']),
    leases: convertArrayToRecord(raw.leases, ['status']),
    attempts: convertArrayToRecord(raw.attempts, ['status']),
    receipts: convertArrayToRecord(raw.receipts || raw.receipts_by_type, ['event_type', 'type'])
  };
}

export function mapPipelineOrigin(raw: any, receiptId: string): PipelineOriginResponse | null {
  if (!raw) return null;

  const execRaw = raw.execution_receipt || raw.local_execution_record?.record;
  const visionRaw = raw.vision_receipt || raw.remote_vision_record?.record;

  const execReceipt = execRaw ? mapReceiptItem(execRaw) : null;
  const visionReceipt = visionRaw ? mapReceiptItem(visionRaw) : null;

  if (!execReceipt) return null;

  let diffFields = raw.diff_fields;
  if (!Array.isArray(diffFields)) {
    diffFields = [
      {
        field: 'created_at',
        execution_value: execReceipt.created_at,
        vision_value: visionReceipt?.created_at ?? 'N/A',
        matches: execReceipt.created_at === visionReceipt?.created_at
      },
      {
        field: 'event_type',
        execution_value: execReceipt.event_type,
        vision_value: visionReceipt?.event_type ?? 'N/A',
        matches: execReceipt.event_type === visionReceipt?.event_type
      },
      {
        field: 'lineage_source',
        execution_value: execReceipt.lineage_source || 'native',
        vision_value: visionReceipt?.lineage_source ?? 'N/A',
        matches: false
      }
    ];
  }

  return {
    receipt_id: String(raw.receipt_id || execReceipt.id || receiptId),
    relationship: String(raw.relationship || 'native_execution_only'),
    execution_receipt: execReceipt,
    vision_receipt: visionReceipt,
    diff_fields: diffFields
  };
}
