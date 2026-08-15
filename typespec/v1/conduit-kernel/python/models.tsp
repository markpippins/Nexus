/**
 * conduit-kernel — TypeSpec Models
 *
 * Reverse-engineered from python/conduit/app (FastAPI WRP kernel).
 * No route or verb decorators live here; the reconciler scans this file and
 * must find none.
 */
namespace org.nexus.conduitkernel {

  /** A work-request identity record. */
  model IdentityResponse {
    @format("uuid")
    identityId: string;
    /** Human-facing identity label (name/email/role). */
    label?: string;
    /** Opaque identity attributes. */
    attributes?: Record<unknown>;
  }

  model IdentityListResponse {
    identities: IdentityResponse[];
  }

  model IdentityUpdateResponse {
    @format("uuid")
    identityId: string;
    updated: boolean;
  }

  /** State graph response — nodes and edges of the WRP state DAG. */
  model GraphResponse {
    nodes: Record<unknown>[];
    edges: Record<unknown>[];
  }

  /** Detail for a single plan. */
  model PlanDetailResponse {
    planNum: string;
    state?: string;
    receipts?: Record<unknown>[];
  }

  /** Replay run summary. */
  model ReplayResponse {
    replayed: int32;
    events?: Record<unknown>[];
  }

  /** Replay comparison between two runs. */
  model CompareResponse {
    differences: Record<unknown>[];
    equal: boolean;
  }

  /** Delta application result. */
  model DeltaResponse {
    applied: boolean;
    delta?: Record<unknown>;
  }

  /** Current state summary. */
  model StateSummary {
    state?: string;
    revision?: string;
  }

  /** Consistency check result. */
  model ConsistencyCheck {
    consistent: boolean;
    issues: string[];
  }

  /** Receipt record. */
  model ReceiptResponse {
    @format("uuid")
    receiptId: string;
    planId: string;
    type?: string;
    payload?: Record<unknown>;
  }

  /** Session record. */
  model SessionResponse {
    @format("uuid")
    sessionId: string;
    status?: string;
    running?: boolean;
    cost?: float;
  }

  model SessionListResponse {
    sessions: SessionResponse[];
  }

  /** Circuit breaker state. */
  model BreakerStateResponse {
    state: string;
    failures?: int32;
    open?: boolean;
  }

  /** Metrics (Prometheus text). */
  model MetricsResponse {
    metrics: string;
  }
}
