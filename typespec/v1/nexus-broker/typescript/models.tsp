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
