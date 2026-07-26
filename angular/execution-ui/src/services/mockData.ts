import {
  RequestItem,
  LeaseItem,
  AttemptItem,
  ReceiptItem,
  IntegrityScanResponse,
  PathologyItem,
  RequestStateResponse,
  LeaseLifecycleResponse,
  PipelineOriginResponse,
  ExecutorFleetSummary,
  ExecutorFleetDetail,
  StatusDistributionResponse,
  RootHealthCheck,
  ExecutionInlineHealth,
  RequestLineageBuckets,
  RequestAttemptsTree,
  PathologyKind,
  LifecycleState
} from '../types';

// Deterministic seed helper
const EXECUTORS = [
  'executor-gpu-us-east-01',
  'executor-gpu-us-east-02',
  'executor-cpu-us-central-01',
  'executor-worker-eu-west-01',
  'executor-inference-asia-01',
  'executor-batch-runner-01'
];

const PAYLOAD_KINDS = [
  'PIPELINE_INFERENCE_TRANSFORM',
  'DATASET_INTEGRITY_SCAN',
  'MODEL_WEIGHT_QUANTIZATION',
  'VISION_EMBEDDING_INDEXING',
  'AUDIO_SYNTHESIS_RENDER',
  'FEATURE_EXTRACTION_JOB'
];

function generateDataset() {
  const now = new Date('2026-07-21T18:00:00Z');
  const nowMs = now.getTime();

  const requests: RequestItem[] = [];
  const leases: LeaseItem[] = [];
  const attempts: AttemptItem[] = [];
  const receipts: ReceiptItem[] = [];

  // Generate 323 requests
  for (let i = 1; i <= 323; i++) {
    const id = `req_${i.toString(16).padStart(6, '0')}`;
    const executor_id = EXECUTORS[i % EXECUTORS.length];
    
    // Status distribution
    let status: RequestItem['status'] = 'COMPLETED';
    if (i <= 18) status = 'PENDING';
    else if (i <= 63) status = 'READY';
    else if (i <= 91) status = 'RUNNING';
    else if (i <= 295) status = 'COMPLETED';
    else if (i <= 319) status = 'FAILED';
    else status = 'CANCELLED';

    const createdOffset = (323 - i) * 120000 + (i % 7) * 1500;
    const createdAt = new Date(nowMs - createdOffset).toISOString();
    const updatedAt = new Date(nowMs - createdOffset + 45000).toISOString();

    requests.push({
      id,
      status,
      executor_id,
      payload: {
        task_kind: PAYLOAD_KINDS[i % PAYLOAD_KINDS.length],
        priority: (i % 5) + 1,
        input_chunks: (i * 3) % 128 + 1,
        max_retries: 3,
        pipeline_origin: i % 4 === 0 ? 'vision.receipts' : 'execution.native',
        parameters: { batch_size: 64, precision: 'fp16', timeout_sec: 120 }
      },
      created_at: createdAt,
      updated_at: updatedAt,
      metadata: { region: 'us-west-2', version: 'v2.4.1', trigger: i % 2 === 0 ? 'cron' : 'mcp' }
    });
  }

  // Generate 321 leases (linking to requests except 3 orphan leases)
  for (let i = 1; i <= 321; i++) {
    const id = `les_${i.toString(16).padStart(6, '0')}`;
    
    // Intentional Pathology 1: Orphan lease
    let requestId = `req_${i.toString(16).padStart(6, '0')}`;
    if (i === 319 || i === 320 || i === 321) {
      requestId = `req_orphan_${i}`; // Mismatch!
    }

    const executor_id = EXECUTORS[i % EXECUTORS.length];
    const createdOffset = (323 - i) * 120000;
    const acquiredAt = new Date(nowMs - createdOffset + 2000).toISOString();

    let status: LeaseItem['status'] = 'RELEASED';
    let expiresAt = new Date(nowMs - createdOffset + 122000).toISOString();
    let releasedAt: string | null = new Date(nowMs - createdOffset + 98000).toISOString();
    const promisedTtl = 120;

    // Intentional Pathology 2: Stale active leases (expired but still ACTIVE status)
    if (i <= 8) {
      status = 'ACTIVE';
      expiresAt = new Date(nowMs - (i * 300000 + 600000)).toISOString(); // expired in past
      releasedAt = null;
    } else if (i <= 32) {
      status = 'ACTIVE';
      expiresAt = new Date(nowMs + (i * 180000)).toISOString(); // active live
      releasedAt = null;
    } else if (i > 300) {
      status = 'EXPIRED';
      releasedAt = null;
    }

    // Intentional Pathology 7: Unreleased lease for terminal request (COMPLETED/FAILED)
    if (i >= 15 && i <= 19) {
      status = 'ACTIVE';
      expiresAt = new Date(nowMs + 600000).toISOString();
      releasedAt = null;
      if (requests[i - 1]) requests[i - 1].status = 'COMPLETED';
    }

    leases.push({
      id,
      request_id: requestId,
      executor_id,
      status,
      acquired_at: acquiredAt,
      expires_at: expiresAt,
      released_at: releasedAt,
      promised_ttl_seconds: promisedTtl,
      actual_ttl_seconds: releasedAt ? Math.round((new Date(releasedAt).getTime() - new Date(acquiredAt).getTime()) / 1000) : null
    });
  }

  // Generate 321 attempts
  for (let i = 1; i <= 321; i++) {
    const id = `att_${i.toString(16).padStart(6, '0')}`;
    const requestId = `req_${i.toString(16).padStart(6, '0')}`;
    
    // Intentional Pathology 3: Attempt orphan no lease
    let leaseId = `les_${i.toString(16).padStart(6, '0')}`;
    if (i === 317 || i === 318) {
      leaseId = `les_non_existent_${i}`;
    }

    const executor_id = EXECUTORS[i % EXECUTORS.length];
    let status: AttemptItem['status'] = 'SUCCEEDED';
    if (i <= 5) status = 'CREATED';
    else if (i <= 33) status = 'RUNNING';
    else if (i <= 293) status = 'SUCCEEDED';
    else if (i <= 315) status = 'FAILED';
    else status = 'TIMED_OUT';

    const startedAt = new Date(nowMs - (323 - i) * 120000 + 4000).toISOString();
    let finishedAt: string | null = new Date(nowMs - (323 - i) * 120000 + 85000).toISOString();
    if (status === 'RUNNING' || status === 'CREATED') finishedAt = null;

    // Intentional Pathology 4: Attempt status diverges from request
    if (i >= 25 && i <= 28) {
      status = 'RUNNING';
      if (requests[i - 1]) requests[i - 1].status = 'COMPLETED'; // Divergence!
    }

    attempts.push({
      id,
      request_id: requestId,
      lease_id: leaseId,
      status,
      executor_id,
      attempt_number: (i % 2) + 1,
      started_at: startedAt,
      finished_at: finishedAt,
      error_message: status === 'FAILED' ? 'OutOfMemoryError: GPU heap exhausted' : status === 'TIMED_OUT' ? 'Lease TTL expired during execution' : null
    });
  }

  // Generate 1558 receipts
  let receiptCounter = 1;
  for (let i = 1; i <= 321; i++) {
    const reqId = `req_${i.toString(16).padStart(6, '0')}`;
    const attId = `att_${i.toString(16).padStart(6, '0')}`;
    const lesId = `les_${i.toString(16).padStart(6, '0')}`;
    const req = requests[i - 1];

    // Intentional Pathology 5 & 6: Receipt mismatches
    let targetReqId = reqId;
    let targetAttId = attId;
    if (i === 310 || i === 311) targetReqId = `req_missing_${i}`;
    if (i === 312 || i === 313) targetAttId = `att_missing_${i}`;

    // Base receipts for every attempt
    const baseTime = req ? new Date(req.created_at).getTime() : nowMs;

    // 1. LEASE_ACQUIRED
    receipts.push({
      id: `rcp_${receiptCounter.toString(16).padStart(6, '0')}`,
      request_id: targetReqId,
      attempt_id: targetAttId,
      lease_id: lesId,
      event_type: 'LEASE_ACQUIRED',
      created_at: new Date(baseTime + 2000).toISOString(),
      lineage_source: i % 5 === 0 ? 'vision.receipts' : null,
      lineage_original_id: i % 5 === 0 ? `vis_rcp_${i}` : null,
      payload: { acquired_ttl: 120, worker: req?.executor_id }
    });
    receiptCounter++;

    // 2. EXECUTION_START
    receipts.push({
      id: `rcp_${receiptCounter.toString(16).padStart(6, '0')}`,
      request_id: targetReqId,
      attempt_id: targetAttId,
      lease_id: lesId,
      event_type: 'EXECUTION_START',
      created_at: new Date(baseTime + 4000).toISOString(),
      lineage_source: i % 5 === 0 ? 'vision.receipts' : null,
      lineage_original_id: i % 5 === 0 ? `vis_rcp_${i}_start` : null,
      payload: { pid: 4892 + i, cgroup: 'execution/workers' }
    });
    receiptCounter++;

    // 3. CHECKPOINTS (1 to 3 checkpoints)
    const checkpointCount = (i % 3) + 1;
    for (let cp = 1; cp <= checkpointCount; cp++) {
      receipts.push({
        id: `rcp_${receiptCounter.toString(16).padStart(6, '0')}`,
        request_id: targetReqId,
        attempt_id: targetAttId,
        lease_id: lesId,
        event_type: 'CHECKPOINT',
        created_at: new Date(baseTime + 4000 + cp * 15000).toISOString(),
        lineage_source: i % 5 === 0 ? 'vision.receipts' : null,
        lineage_original_id: i % 5 === 0 ? `vis_rcp_${i}_cp${cp}` : null,
        payload: { checkpoint_seq: cp, progress: Math.min(100, cp * 33) }
      });
      receiptCounter++;
    }

    // 4. EXECUTION_COMPLETE / EXECUTION_FAILED
    if (i <= 280) {
      receipts.push({
        id: `rcp_${receiptCounter.toString(16).padStart(6, '0')}`,
        request_id: targetReqId,
        attempt_id: targetAttId,
        lease_id: lesId,
        event_type: 'EXECUTION_COMPLETE',
        created_at: new Date(baseTime + 85000).toISOString(),
        lineage_source: i % 5 === 0 ? 'vision.receipts' : null,
        lineage_original_id: i % 5 === 0 ? `vis_rcp_${i}_end` : null,
        payload: { exit_code: 0, bytes_processed: 1048576 * (i % 16 + 1) }
      });
      receiptCounter++;

      receipts.push({
        id: `rcp_${receiptCounter.toString(16).padStart(6, '0')}`,
        request_id: targetReqId,
        attempt_id: targetAttId,
        lease_id: lesId,
        event_type: 'LEASE_RELEASED',
        created_at: new Date(baseTime + 98000).toISOString(),
        lineage_source: i % 5 === 0 ? 'vision.receipts' : null,
        lineage_original_id: i % 5 === 0 ? `vis_rcp_${i}_release` : null,
        payload: { reason: 'normal_completion' }
      });
      receiptCounter++;
    } else if (i <= 300) {
      receipts.push({
        id: `rcp_${receiptCounter.toString(16).padStart(6, '0')}`,
        request_id: targetReqId,
        attempt_id: targetAttId,
        lease_id: lesId,
        event_type: 'EXECUTION_FAILED',
        created_at: new Date(baseTime + 65000).toISOString(),
        lineage_source: null,
        payload: { exit_code: 137, signal: 'SIGKILL' }
      });
      receiptCounter++;
    }
  }

  // Intentional Pathology 8: Attempted no completion
  for (let i = 50; i <= 53; i++) {
    if (requests[i]) {
      requests[i].status = 'READY';
      if (attempts[i]) attempts[i].status = 'CREATED';
    }
  }

  // Ensure receipt count reaches 1558
  while (receipts.length < 1558) {
    const idx = receipts.length + 1;
    receipts.push({
      id: `rcp_${idx.toString(16).padStart(6, '0')}`,
      request_id: `req_${((idx % 323) + 1).toString(16).padStart(6, '0')}`,
      attempt_id: `att_${((idx % 321) + 1).toString(16).padStart(6, '0')}`,
      lease_id: `les_${((idx % 321) + 1).toString(16).padStart(6, '0')}`,
      event_type: 'CHECKPOINT',
      created_at: new Date(nowMs - (1558 - idx) * 45000).toISOString(),
      lineage_source: idx % 7 === 0 ? 'vision.receipts' : null,
      lineage_original_id: idx % 7 === 0 ? `vis_rcp_${idx}` : null,
      payload: { HeartBeat: true, memory_rss_mb: 512 + (idx % 256) }
    });
  }

  return { requests, leases, attempts, receipts };
}

// Global state in memory
class MockExecutionStore {
  private requests: RequestItem[];
  private leases: LeaseItem[];
  private attempts: AttemptItem[];
  private receipts: ReceiptItem[];

  constructor() {
    const data = generateDataset();
    this.requests = data.requests;
    this.leases = data.leases;
    this.attempts = data.attempts;
    this.receipts = data.receipts;
  }

  public getRootHealth(): RootHealthCheck {
    return {
      status: 'ok',
      database: 'connected',
      tables: {
        requests: this.requests.length,
        leases: this.leases.length,
        attempts: this.attempts.length,
        receipts: this.receipts.length
      }
    };
  }

  public getInlineHealth(): ExecutionInlineHealth {
    const nowMs = Date.now();
    const readyCount = this.requests.filter(r => r.status === 'READY').length;
    const staleActiveCount = this.leases.filter(l => l.status === 'ACTIVE' && new Date(l.expires_at).getTime() < nowMs).length;
    const runningAttempts = this.attempts.filter(a => a.status === 'RUNNING').length;

    return {
      status: staleActiveCount > 5 ? 'degraded' : 'healthy',
      ready_requests: readyCount,
      stale_active_leases: staleActiveCount,
      running_attempts: runningAttempts,
      total_requests: this.requests.length,
      total_leases: this.leases.length,
      total_attempts: this.attempts.length,
      total_receipts: this.receipts.length,
      scan_status: 'pathologies_detected'
    };
  }

  public getStatusDistribution(): StatusDistributionResponse {
    const requestsDist = { PENDING: 0, READY: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0, CANCELLED: 0 };
    this.requests.forEach(r => { requestsDist[r.status] = (requestsDist[r.status] || 0) + 1; });

    const leasesDist = { ACTIVE: 0, RELEASED: 0, EXPIRED: 0 };
    this.leases.forEach(l => { leasesDist[l.status] = (leasesDist[l.status] || 0) + 1; });

    const attemptsDist = { CREATED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, TIMED_OUT: 0 };
    this.attempts.forEach(a => { attemptsDist[a.status] = (attemptsDist[a.status] || 0) + 1; });

    const receiptsDist = { LEASE_ACQUIRED: 0, EXECUTION_START: 0, CHECKPOINT: 0, EXECUTION_COMPLETE: 0, EXECUTION_FAILED: 0, LEASE_RELEASED: 0 };
    this.receipts.forEach(rc => { receiptsDist[rc.event_type] = (receiptsDist[rc.event_type] || 0) + 1; });

    return {
      timestamp: new Date().toISOString(),
      requests: requestsDist,
      leases: leasesDist,
      attempts: attemptsDist,
      receipts: receiptsDist
    };
  }

  public getRequestState(id: string): RequestStateResponse | null {
    const req = this.requests.find(r => r.id === id);
    if (!req) return null;

    const lease = this.leases.find(l => l.request_id === id) || null;
    const requestAttempts = this.attempts.filter(a => a.request_id === id);
    const latestAttempt = requestAttempts.length > 0
      ? requestAttempts.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
      : null;
    const reqReceipts = this.receipts.filter(rc => rc.request_id === id);

    return {
      request: req,
      lease,
      latest_attempt: latestAttempt,
      receipts: reqReceipts
    };
  }

  public getStaleLeases(): LeaseItem[] {
    const nowMs = Date.now();
    return this.leases.filter(l => l.status === 'ACTIVE' && new Date(l.expires_at).getTime() < nowMs);
  }

  public getLeaseLifecycle(id: string): LeaseLifecycleResponse | null {
    const lease = this.leases.find(l => l.id === id);
    if (!lease) return null;

    const nowMs = Date.now();
    const acqTime = new Date(lease.acquired_at).getTime();
    const expTime = new Date(lease.expires_at).getTime();
    const relTime = lease.released_at ? new Date(lease.released_at).getTime() : null;

    let lifecycle_state: LifecycleState = 'live';
    if (lease.status === 'RELEASED') {
      lifecycle_state = 'released';
    } else if (lease.status === 'ACTIVE' && expTime < nowMs) {
      lifecycle_state = 'stale_active';
    } else if (lease.status === 'EXPIRED' && !lease.released_at) {
      lifecycle_state = 'expired_unreleased';
    }

    const actual_ttl = relTime ? Math.round((relTime - acqTime) / 1000) : null;
    const expiry_gap = Math.round((nowMs - expTime) / 1000);

    return {
      id: lease.id,
      request_id: lease.request_id,
      executor_id: lease.executor_id,
      status: lease.status,
      acquired_at: lease.acquired_at,
      expires_at: lease.expires_at,
      released_at: lease.released_at,
      promised_ttl_seconds: lease.promised_ttl_seconds,
      actual_ttl_seconds: actual_ttl,
      expiry_gap_seconds: expiry_gap,
      lifecycle_state
    };
  }

  public getIntegrityScan(): IntegrityScanResponse {
    const nowMs = Date.now();
    const reqMap = new Map(this.requests.map(r => [r.id, r]));
    const leaseMap = new Map(this.leases.map(l => [l.id, l]));
    const attemptMap = new Map(this.attempts.map(a => [a.id, a]));

    const pathologies: PathologyItem[] = [
      {
        kind: 'orphan_lease_request_mismatch',
        count: 0,
        severity: 'CRITICAL',
        title: 'Orphan Lease Request Mismatch',
        description: 'lease.request_id has no matching execution.requests record.',
        samples: []
      },
      {
        kind: 'stale_active_lease',
        count: 0,
        severity: 'WARNING',
        title: 'Stale Active Lease',
        description: 'lease.status=ACTIVE and expires_at < now() (TTL enforcement gap).',
        samples: []
      },
      {
        kind: 'attempt_orphan_no_lease',
        count: 0,
        severity: 'CRITICAL',
        title: 'Attempt Orphan No Lease',
        description: 'attempt.lease_id has no matching execution.leases record.',
        samples: []
      },
      {
        kind: 'attempt_status_diverges_from_request',
        count: 0,
        severity: 'WARNING',
        title: 'Attempt Status Diverges From Request',
        description: 'request.status=COMPLETED while attempt is CREATED/RUNNING, or READY request has SUCCEEDED attempt.',
        samples: []
      },
      {
        kind: 'receipt_request_mismatch',
        count: 0,
        severity: 'CRITICAL',
        title: 'Receipt Request Mismatch',
        description: 'receipt.request_id has no matching execution.requests record.',
        samples: []
      },
      {
        kind: 'receipt_attempt_mismatch',
        count: 0,
        severity: 'WARNING',
        title: 'Receipt Attempt Mismatch',
        description: 'receipt.attempt_id has no matching execution.attempts record.',
        samples: []
      },
      {
        kind: 'unreleased_lease_for_terminal_request',
        count: 0,
        severity: 'CRITICAL',
        title: 'Unreleased Lease for Terminal Request',
        description: 'request.status in (COMPLETED, CANCELLED, FAILED) but lease is still ACTIVE.',
        samples: []
      },
      {
        kind: 'attempted_no_completion',
        count: 0,
        severity: 'INFO',
        title: 'Attempted No Completion',
        description: 'request status not terminal and all attempts are CREATED without progress.',
        samples: []
      }
    ];

    // 1. orphan_lease_request_mismatch
    this.leases.forEach(l => {
      if (!reqMap.has(l.request_id)) {
        pathologies[0].count++;
        if (pathologies[0].samples.length < 5) pathologies[0].samples.push(l);
      }
    });

    // 2. stale_active_lease
    this.leases.forEach(l => {
      if (l.status === 'ACTIVE' && new Date(l.expires_at).getTime() < nowMs) {
        pathologies[1].count++;
        if (pathologies[1].samples.length < 5) pathologies[1].samples.push(l);
      }
    });

    // 3. attempt_orphan_no_lease
    this.attempts.forEach(a => {
      if (!leaseMap.has(a.lease_id)) {
        pathologies[2].count++;
        if (pathologies[2].samples.length < 5) pathologies[2].samples.push(a);
      }
    });

    // 4. attempt_status_diverges_from_request
    this.attempts.forEach(a => {
      const req = reqMap.get(a.request_id);
      if (req) {
        if (req.status === 'COMPLETED' && (a.status === 'CREATED' || a.status === 'RUNNING')) {
          pathologies[3].count++;
          if (pathologies[3].samples.length < 5) pathologies[3].samples.push({ attempt: a, request: req });
        }
      }
    });

    // 5. receipt_request_mismatch
    this.receipts.forEach(rc => {
      if (!reqMap.has(rc.request_id)) {
        pathologies[4].count++;
        if (pathologies[4].samples.length < 5) pathologies[4].samples.push(rc);
      }
    });

    // 6. receipt_attempt_mismatch
    this.receipts.forEach(rc => {
      if (!attemptMap.has(rc.attempt_id)) {
        pathologies[5].count++;
        if (pathologies[5].samples.length < 5) pathologies[5].samples.push(rc);
      }
    });

    // 7. unreleased_lease_for_terminal_request
    this.leases.forEach(l => {
      const req = reqMap.get(l.request_id);
      if (req && ['COMPLETED', 'CANCELLED', 'FAILED'].includes(req.status) && l.status === 'ACTIVE') {
        pathologies[6].count++;
        if (pathologies[6].samples.length < 5) pathologies[6].samples.push({ lease: l, request: req });
      }
    });

    // 8. attempted_no_completion
    this.requests.forEach(r => {
      if (!['COMPLETED', 'CANCELLED', 'FAILED'].includes(r.status)) {
        const reqAtts = this.attempts.filter(a => a.request_id === r.id);
        if (reqAtts.length > 0 && reqAtts.every(a => a.status === 'CREATED')) {
          pathologies[7].count++;
          if (pathologies[7].samples.length < 5) pathologies[7].samples.push({ request: r, attempts: reqAtts });
        }
      }
    });

    const totalIssues = pathologies.reduce((acc, p) => acc + p.count, 0);

    return {
      scanned_at: new Date().toISOString(),
      total_pathologies: pathologies.filter(p => p.count > 0).length,
      total_issues_count: totalIssues,
      items: pathologies
    };
  }

  public getRequestAttemptsTree(requestId: string): RequestAttemptsTree | null {
    const req = this.requests.find(r => r.id === requestId);
    if (!req) return null;

    const reqAttempts = this.attempts.filter(a => a.request_id === requestId);
    const tree = reqAttempts.map(att => {
      const parentLease = this.leases.find(l => l.id === att.lease_id) || null;
      const attReceipts = this.receipts.filter(rc => rc.attempt_id === att.id);
      return {
        attempt: att,
        lease: parentLease,
        receipts: attReceipts
      };
    });

    return {
      request_id: requestId,
      attempts: tree
    };
  }

  public getReceiptsLineage(requestId: string): RequestLineageBuckets | null {
    const req = this.requests.find(r => r.id === requestId);
    if (!req) return null;

    const reqReceipts = this.receipts.filter(rc => rc.request_id === requestId);
    const native: ReceiptItem[] = [];
    const backfilled: ReceiptItem[] = [];
    const unknown: ReceiptItem[] = [];

    reqReceipts.forEach(rc => {
      if (!rc.lineage_source) {
        native.push(rc);
      } else if (rc.lineage_source === 'vision.receipts') {
        backfilled.push(rc);
      } else {
        unknown.push(rc);
      }
    });

    return {
      request_id: requestId,
      native,
      backfilled,
      unknown
    };
  }

  public getPipelineOrigin(receiptId: string): PipelineOriginResponse | null {
    const execReceipt = this.receipts.find(rc => rc.id === receiptId);
    if (!execReceipt) return null;

    let relationship: PipelineOriginResponse['relationship'] = 'native_execution_only';
    let visionReceipt: ReceiptItem | null = null;

    if (execReceipt.lineage_source === 'vision.receipts') {
      relationship = 'backfilled_from_vision';
      visionReceipt = {
        id: execReceipt.lineage_original_id || `vis_${execReceipt.id}`,
        request_id: execReceipt.request_id,
        attempt_id: execReceipt.attempt_id,
        lease_id: execReceipt.lease_id,
        event_type: execReceipt.event_type,
        created_at: new Date(new Date(execReceipt.created_at).getTime() - 150).toISOString(),
        lineage_source: 'vision.canonical_ingest',
        payload: {
          ...execReceipt.payload,
          vision_ingest_host: 'vision-srv-pod-09',
          integrity_checksum: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        }
      };
    } else if (execReceipt.lineage_source) {
      relationship = `unknown_source:${execReceipt.lineage_source}`;
    }

    const diff_fields = [
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

    return {
      receipt_id: receiptId,
      relationship,
      execution_receipt: execReceipt,
      vision_receipt: visionReceipt,
      diff_fields
    };
  }

  public getFleetByExecutor(executorId?: string): ExecutorFleetSummary[] | ExecutorFleetDetail {
    const nowMs = Date.now();
    const executorStatsMap = new Map<string, {
      active_leases: LeaseItem[];
      in_progress: AttemptItem[];
      total_handled: number;
    }>();

    EXECUTORS.forEach(ex => {
      executorStatsMap.set(ex, { active_leases: [], in_progress: [], total_handled: 0 });
    });

    this.requests.forEach(r => {
      if (executorStatsMap.has(r.executor_id)) {
        executorStatsMap.get(r.executor_id)!.total_handled++;
      }
    });

    this.leases.forEach(l => {
      if (l.status === 'ACTIVE' && executorStatsMap.has(l.executor_id)) {
        executorStatsMap.get(l.executor_id)!.active_leases.push(l);
      }
    });

    this.attempts.forEach(a => {
      if (a.status === 'RUNNING' && executorStatsMap.has(a.executor_id)) {
        executorStatsMap.get(a.executor_id)!.in_progress.push(a);
      }
    });

    if (executorId) {
      const stats = executorStatsMap.get(executorId) || { active_leases: [], in_progress: [], total_handled: 0 };
      const staleCount = stats.active_leases.filter(l => new Date(l.expires_at).getTime() < nowMs).length;
      let health_status: ExecutorFleetSummary['health_status'] = 'HEALTHY';
      if (staleCount > 0) health_status = 'STALE_LEASES';
      else if (stats.in_progress.length > 8) health_status = 'OVERLOADED';

      const summary: ExecutorFleetSummary = {
        executor_id: executorId,
        active_leases_count: stats.active_leases.length,
        in_progress_attempts_count: stats.in_progress.length,
        total_requests_handled: stats.total_handled,
        health_status,
        last_heartbeat: new Date(nowMs - 12000).toISOString()
      };

      return {
        summary,
        active_leases: stats.active_leases,
        in_progress_attempts: stats.in_progress,
        recent_completed_count: Math.round(stats.total_handled * 0.8),
        recent_failed_count: Math.round(stats.total_handled * 0.08)
      };
    } else {
      return EXECUTORS.map(ex => {
        const stats = executorStatsMap.get(ex)!;
        const staleCount = stats.active_leases.filter(l => new Date(l.expires_at).getTime() < nowMs).length;
        let health_status: ExecutorFleetSummary['health_status'] = 'HEALTHY';
        if (staleCount > 0) health_status = 'STALE_LEASES';
        else if (stats.in_progress.length > 8) health_status = 'OVERLOADED';

        return {
          executor_id: ex,
          active_leases_count: stats.active_leases.length,
          in_progress_attempts_count: stats.in_progress.length,
          total_requests_handled: stats.total_handled,
          health_status,
          last_heartbeat: new Date(nowMs - Math.floor(Math.random() * 30000)).toISOString()
        };
      });
    }
  }

  // Lists with filter/search
  public listRequests(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    let list = [...this.requests];
    if (filter?.status) {
      list = list.filter(r => r.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(r => r.id.toLowerCase().includes(q) || r.executor_id.toLowerCase().includes(q) || JSON.stringify(r.payload).toLowerCase().includes(q));
    }
    const total = list.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    return { total, items: list.slice(offset, offset + limit) };
  }

  public listLeases(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    let list = [...this.leases];
    if (filter?.status) {
      list = list.filter(l => l.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(l => l.id.toLowerCase().includes(q) || l.request_id.toLowerCase().includes(q) || l.executor_id.toLowerCase().includes(q));
    }
    const total = list.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    return { total, items: list.slice(offset, offset + limit) };
  }

  public listAttempts(filter?: { status?: string; search?: string; limit?: number; offset?: number }) {
    let list = [...this.attempts];
    if (filter?.status) {
      list = list.filter(a => a.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(a => a.id.toLowerCase().includes(q) || a.request_id.toLowerCase().includes(q) || a.lease_id.toLowerCase().includes(q));
    }
    const total = list.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    return { total, items: list.slice(offset, offset + limit) };
  }

  public listReceipts(filter?: { event_type?: string; search?: string; limit?: number; offset?: number }) {
    let list = [...this.receipts];
    if (filter?.event_type) {
      list = list.filter(rc => rc.event_type === filter.event_type);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(rc => rc.id.toLowerCase().includes(q) || rc.request_id.toLowerCase().includes(q) || rc.attempt_id.toLowerCase().includes(q));
    }
    const total = list.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    return { total, items: list.slice(offset, offset + limit) };
  }
}

export const mockStore = new MockExecutionStore();
