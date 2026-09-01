/**
 * nexus-broker — TypeSpec Models
 *
 * Worker-tier Moleculer broker (D-2026-08-14-002).
 */
namespace org.nexus.nexusbroker {

  /** GET /api/health response. */
  model Health {
    /** Literal "ok". */
    status: string;
    /** Broker name ("nexus-broker"). */
    service: string;
    /** Broker namespace ("nexus"). */
    `namespace`: string;
    /** Declared worker-tier services (populated as each Wave 4 migration lands). */
    workers: string[];
    /** ISO timestamp. */
    timestamp: string;
  }

  /** A worker-tier service entry. */
  model WorkerEntry {
    /** Service name, e.g. "worker.harness". */
    name: string;
    /** Scaffold status until Wave 4 lands the real handlers. */
    status: string;
    /** Migration wave that implements it. */
    wave: int32;
  }

  /** GET /api/workers response. */
  model Workers {
    workers: WorkerEntry[];
    nodeID: string;
  }

  /** GET /api/solir/status response. */
  model SolIrStatus {
    enabled: boolean;
    intervalMs: int32;
    latestSnapshot: int32 | null;
    latestSnapshotAt: string | null;
  }

  /** POST /api/solir/snapshot request body. */
  model SolIrSnapshotRequest {
    /** Optional label; defaults to snapshot-vN. */
    label?: string;
  }

  /** POST /api/solir/snapshot response. */
  model SolIrSnapshotResult {
    ok: boolean;
    version: int32;
    label: string;
    observations: int32;
    assessments: int32;
    driftFindings: int32;
    prevVersion: int32;
  }

  // ========================================================================
  // Keychains — agent-record contextual layer (state vector + rewind)
  // ========================================================================

  /** GET /api/keychain-snapshot/status response (legacy observations projection). */
  model KeychainStatus {
    enabled: boolean;
    intervalMs: int32;
    latestSnapshot: int32 | null;
    latestSnapshotAt: string | null;
  }

  /** The current issuance of a keychain instance (latest version only). */
  model KeychainActiveInstance {
    instance_id: string;
    record_id: string;
    version: int32;
    role: string;
    supersession_type: string;
    asset_id: string | null;
  }

  /**
   * Normalized snapshot-trigger event (shared trigger contract,
   * Analyst catalogue 332d6831). Idempotent on (kind, id).
   */
  model KeychainTriggerEvent {
    kind: string;
    id: string;
    actor?: string;
    source?: string;
    correlation_id?: string;
    contract_id?: string;
    evaluator_id?: string;
    law_id?: string;
    effective_at?: string;
    meta?: Record<unknown>;
  }

  /** GET /api/keychain-snapshot/agent-records/status response. */
  model KeychainAgentRecordsStatus {
    enabled: boolean;
    latestSnapshot: int32 | null;
    latestSnapshotAt: string | null;
    entryCount: int32;
    totalRecordsProjected: int32 | null;
    supersededRecords: int32 | null;
  }

  /** POST /api/keychain-snapshot/agent-records/snapshot request. */
  model KeychainSnapshotRequest {
    label?: string;
    /** Legacy raw trigger string (backward compat). */
    trigger?: string;
    /** Structured trigger event (shared contract; preferred). */
    triggerEvent?: KeychainTriggerEvent;
  }

  /** POST /api/keychain-snapshot/agent-records/snapshot response. */
  model KeychainSnapshotResult {
    ok: boolean;
    version: int32;
    label: string;
    totalRecords: int32;
    entries: int32;
    supersededRecords: int32;
    driftFindings: int32;
    recordTypeCount: int32;
    trigger: KeychainTriggerEvent | null;
    deduplicated: boolean;
    prevVersion: int32;
  }

  /** GET /api/keychain-snapshot/agent-records/transitions response. */
  model KeychainTransitionsResult {
    count: int32;
    items: KeychainTriggerEvent[];
  }

  /** GET /api/keychain-snapshot/agent-records/rewind response. */
  model KeychainRewindResult {
    ok: boolean;
    version: int32;
    label: string;
    created_at: string;
    trigger: string | null;
    totalRecords: int32 | null;
    entryCount: int32 | null;
    recordTypeCount: int32 | null;
    state_vector: Record<unknown> | null;
    note?: string;
    error?: string;
  }

  // ========================================================================
  // Worker tier (Wave 4 — harness/pty/execution as Moleculer workers)
  // ========================================================================

  /** Health response for a worker service. */
  model WorkerHealth {
    status: string;
    db: boolean;
    active_sessions?: int32;
    schema?: string;
    counts?: Record<unknown>;
  }

  /** A pty session descriptor. */
  model PtySession {
    id: string;
    pid: int32;
    shell: string;
    started_at: string;
    status: string;
    exit_code?: int32 | null;
    cols?: int32;
    rows?: int32;
  }

  /** GET /api/workers/pty response. */
  model PtyList {
    count: int32;
    sessions: PtySession[];
  }

  /** POST /api/workers/pty request body. */
  model PtySpawnRequest {
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<unknown>;
    cols?: int32;
    rows?: int32;
  }

  /** A harness session descriptor. */
  model HarnessSession {
    job_id: string;
    role?: string;
    `model`?: string;
    started_at: string;
    elapsed_ms: int32;
    wind_task_id?: string;
    pid?: int32;
  }

  /** GET /api/workers/harness/sessions response. */
  model HarnessSessions {
    count: int32;
    sessions: HarnessSession[];
  }

  /** POST /api/workers/harness/resolve-context request body. */
  model HarnessResolveRequest {
    wind_task_id: string;
    context?: Record<unknown>;
  }

  /** POST /api/workers/harness/run request body. */
  model HarnessRunRequest {
    wind_task_id: string;
    context?: Record<unknown>;
    work_dir?: string;
    harness_id?: string;
    agent?: string;
    timeout_ms?: int32;
    resolve_only?: boolean;
  }
}
