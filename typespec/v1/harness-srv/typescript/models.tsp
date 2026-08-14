/**
 * harness-srv — TypeSpec Models
 *
 * Reverse-engineered from typescript/harness-srv/src/index.ts.
 * Domain models for the generic execution harness. No route or verb decorators
 * live here; the reconciler scans this file and must find none.
 */
namespace org.nexus.harnesssrv {

  // ── POST /run ───────────────────────────────────────────────────────

  /** Request body for POST /run. */
  model RunRequest {
    /** wind.tasks.id to execute. */
    @format("uuid")
    wind_task_id: string;
    /** Additional context to merge into the task input spec. */
    context?: Record<unknown>;
    /** Working directory override. */
    work_dir?: string;
    /** Harness id override (default: harn-opencode). */
    harness_id?: string;
    /** Agent name override (for opencode). */
    agent?: string;
    /** Execution timeout in ms (default: 300000). */
    timeout_ms?: int32;
    /** Dry run: resolve context only, do not execute. */
    resolve_only?: boolean;
  }

  /** Outcome code as declared by the task. */
  model OutcomeSummary {
    /** Outcome code. */
    code: string;
    /** Outcome description. */
    description: string;
  }

  /** Parsed OUTCOME declaration from the agent's output. */
  model ParsedOutcome {
    /** Matched outcome code. */
    code: string;
    /** Matched outcome id. */
    id: string;
    /** Match confidence: exact | fuzzy | keyword. */
    confidence: string;
  }

  /** Task summary echoed back to the caller. */
  model TaskSummary {
    /** Wind task id. */
    @format("uuid")
    wind_task_id: string;
    /** Wind task name. */
    wind_task_name: string;
    /** Task slug. */
    task_slug: string;
    /** Task scope. */
    scope: string;
  }

  /** Response body for POST /run. */
  model RunResponse {
    /** Job id (uuid). */
    @format("uuid")
    job_id: string;
    /** Resolved agent role. */
    role: string;
    /** Task summary. */
    task: TaskSummary;
    /** Declared outcomes. */
    outcomes: OutcomeSummary[];
    /** Parsed outcome, or null if none declared. */
    outcome: ParsedOutcome | null;
    /** First 300 chars of the resolved prompt. */
    prompt_preview: string;
    /** Effective harness id. */
    harness_id: string;
    /** Process exit code (0 = success, 124 = timeout, 137 = signal-killed). */
    exit_code: int32;
    /** Captured stdout. */
    stdout: string;
    /** Captured stderr. */
    stderr: string;
    /** Wall-clock duration in ms. */
    duration_ms: int64;
    /** Emitted event ids keyed by stage. */
    events: RunEvents;
  }

  /** Emitted event ids. */
  model RunEvents {
    /** harness.started event id. */
    started: string;
  }

  // ── POST /run-direct ────────────────────────────────────────────────

  /** Request body for POST /run-direct. */
  model RunDirectRequest {
    /** Agent role (maps to tackle config_bundle). */
    role: string;
    /** Full prompt text (already assembled). */
    prompt: string;
    /** Model override (opencode-qualified id). */
    `model`?: string;
    /** Working directory override. */
    work_dir?: string;
    /** Agent name override. */
    agent?: string;
    /** Execution timeout in ms (default: 600000). */
    timeout_ms?: int32;
    /** Invocation channel (default: duality). */
    channel?: string;
  }

  /** Response body for POST /run-direct. */
  model RunDirectResponse {
    /** Job id (uuid). */
    @format("uuid")
    job_id: string;
    /** Agent role. */
    role: string;
    /** Process exit code (0 = success, 124 = timeout, 137 = signal-killed). */
    exit_code: int32;
    /** Captured stdout. */
    stdout: string;
    /** Captured stderr. */
    stderr: string;
    /** Wall-clock duration in ms. */
    duration_ms: int64;
    /** First 300 chars of the prompt. */
    prompt_preview: string;
    /** Effective harness id. */
    harness_id: string;
    /** Effective model, or null. */
    `model`: string | null;
    /** Emitted event ids keyed by stage. */
    events: RunEvents;
  }

  // ── POST /resolve-context ───────────────────────────────────────────

  /** Request body for POST /resolve-context. */
  model ResolveContextRequest {
    /** wind.tasks.id to resolve. */
    @format("uuid")
    wind_task_id: string;
  }

  /** Response body for POST /resolve-context. */
  model ResolveContextResponse {
    /** Resolved agent role. */
    role: string;
    /** Resolved task. */
    task: Record<unknown>;
    /** Resolved prompt length in chars. */
    prompt_length: int32;
    /** First 500 chars of the resolved prompt. */
    prompt_preview: string;
    /** Number of procedure cards referenced. */
    procedure_cards: int32;
    /** Resolved harness id. */
    harness_id: string;
    /** Resolved tool ACL. */
    tool_acl: Record<unknown>;
  }

  // ── GET /sessions ───────────────────────────────────────────────────

  /** An active harness session tracked by the runaway watchdog. */
  model ActiveSession {
    /** Job id. */
    @format("uuid")
    jobId: string;
    /** Agent role. */
    role: string;
    /** Model in use, or null. */
    `model`: string | null;
    /** Session start time. */
    startedAt: utcDateTime;
    /** Elapsed seconds since start. */
    elapsedSeconds: int32;
  }

  /** Response body for GET /sessions. */
  model SessionsResponse {
    /** Active sessions. */
    sessions: ActiveSession[];
    /** Number of active sessions. */
    count: int32;
  }

  // ── GET /health ─────────────────────────────────────────────────────

  /** Response body for GET /health. */
  model HealthResponse {
    /** Health status, normally "ok". */
    status: string;
    /** Listening port. */
    port: int32;
    /** Process uptime in seconds. */
    uptime: float64;
  }

  // ── Errors ──────────────────────────────────────────────────────────

  /** Error body returned for malformed requests or failures. */
  model HarnessErrorResponse {
    /** Job id when a job was started. */
    @format("uuid")
    job_id?: string;
    /** Human-readable error message. */
    error: string;
    /** Wall-clock duration in ms when a job ran. */
    duration_ms?: int64;
  }
}
