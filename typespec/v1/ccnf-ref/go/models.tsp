/**
 * ccnf-ref (Go) — TypeSpec Models
 *
 * Reverse-engineered from nexus/go/wrp/ccnf-ref (reference implementation of
 * the Canonical Content Normalization Format). Field names use the exact
 * snake_case wire names from SERIALIZATION_CONTRACT.md — key spelling is part
 * of the contract (hashes depend on bitwise-identical JSON).
 * No route or verb decorators live here.
 */
namespace org.nexus.ccnf.ref {

  /** Controlled vocabulary of intent actions (intents.go). */
  enum IntentAction {
    create,
    update,
    delete,
    execute,
    validate,
    emit,
  }

  /** Stable error codes raised by the CCNF pipeline (types.go). */
  enum CcnfError {
    INTENT_NORMALIZATION_FAILURE,
    ARTIFACT_RESOLUTION_FAILURE,
    DELTA_SCOPE_VIOLATION,
    CCNF_VERSION_MISMATCH,
    STRUCTURAL_PARSE_FAILURE,
  }

  /** Identity block of a CER (types.go: Identity). */
  model CerIdentity {
    entity_key: string;
    `type`: string;
    scope: string;
    /** Null when absent — empty string is normalized to null. */
    collapse_key: string | null;
    alias_keys: string[];
  }

  /** One state-delta entry of a CER (types.go: StateDelta). */
  model StateDelta {
    artifact_id: string;
    /** Null for the first write of an artifact (no prior hash). */
    before_hash: string | null;
    /** SHA256 of canonical JSON of the patch. */
    after_hash: string;
    patch: Record<unknown>;
  }

  /**
   * Canonical Event Record (types.go: CER).
   * The hashable envelope: SHA256(canonical_json(CER map minus signature)).
   */
  model Cer {
    event_id: string;
    event_version: int32;
    ccnf_version: int32;
    system: string;
    domain: string;
    /** Epoch seconds (int64); ISO-8601 inputs normalized to this. */
    timestamp: int64;
    actor: Record<unknown>;
    intent: Record<unknown>;
    identity: CerIdentity;
    causality: Record<unknown>;
    artifact_refs: string[];
    state_delta: StateDelta[];
    payload: Record<unknown>;
    compression: Record<unknown>;
    signature: Record<unknown>;
  }

  /**
   * Golden test vector (types.go: Vector). Each vector pins one serialization
   * invariant; vectors/v1/*.json are the committed corpus.
   */
  model Vector {
    name: string;
    ccnf_version: int32;
    invariants_tested: string[];
    description: string;
    input: Record<unknown>;
    expected: VectorExpected;
  }

  /** Expected outcome of a vector (types.go: VectorExpected). */
  model VectorExpected {
    entity_key?: string;
    canonical_hash?: string;
    cer?: Cer;
    error?: string;
  }

  /** Normalized intent form (intents.go) — replaces free-text intent. */
  model NormalizedIntent {
    `type`: "normalized_verb";
    action: IntentAction;
    target_type: string;
    target_id: string;
  }

  /** Resolved artifact entry (artifacts.go). */
  model ResolvedArtifact {
    artifact_id: string;
    patch: Record<unknown>;
  }

  /** Replay event (replay/types.go: CEREvent). */
  model ReplayEvent {
    event_id: string;
    causal_chain_id: string;
    sequence: int64;
    timestamp: int64;
    entity_key: string;
    artifact_id: string;
    state_delta: Record<unknown>;
  }

  /** Per-entity artifact state (replay/types.go: EntityState). */
  model EntityState {
    artifact_states: Record<unknown>;
    last_event_seq: int64;
  }

  /** Folded runtime state (replay/types.go: RuntimeState). */
  model RuntimeState {
    entities: Record<EntityState>;
    version: int64;
  }

  /** Replay cursor (replay/cursor.go). */
  model Cursor {
    index: int32;
  }

  /** Immutable snapshot of replayed state (replay/snapshot/types.go). */
  model Snapshot {
    state: RuntimeState;
    ccnf_version: int64;
    collapse_version: int64;
    rehydration_version: int64;
    timestamp: int64;
  }

  /** Snapshot plus the source event window it was built from. */
  model SnapshotContext {
    snapshot: Snapshot;
    source_events: ReplayEvent[];
  }
}
