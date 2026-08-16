/**
 * ccnf-verifier (Rust) — TypeSpec Models
 *
 * Reverse-engineered from nexus/rust/wrp/ccnf-verifier — the independent Rust
 * pipeline verifier that cross-checks the Go reference against golden vectors
 * (and, when the oracle is available, against the Go binary itself).
 * No route or verb decorators live here.
 */
namespace org.nexus.ccnf.verifier {

  /** Verifier error taxonomy (error.rs). */
  enum VerifierError {
    InvalidInput,
    JsonParse,
    CcnfVersionMismatch,
    ArtifactResolution,
    Io,
  }

  /**
   * CER as built by the Rust pipeline (ccnf/build.rs: Cer).
   * NOTE — golden-vector compatibility quirks: the Go reference serializer
   * emits `null` for identity.collapse_key, identity.alias_keys,
   * artifact_refs and state_delta (type-handling limitations), so the Rust
   * builder mirrors those as null instead of [] / actual values.
   */
  model Cer {
    event_id: string;
    event_version: uint32;
    ccnf_version: uint32;
    system: string;
    domain: string;
    timestamp: int64;
    actor: Record<unknown>;
    intent: Record<unknown>;
    entity_key: string;
    identity_type: string;
    scope: string;
    collapse_key: string | null;
    alias_keys: string[];
    causality: Record<unknown>;
    artifact_refs: string[];
    state_delta: Record<unknown>[];
    payload: Record<unknown>;
    compression: Record<unknown>;
  }

  /** Default compression envelope written by build_cer. */
  model CompressionEnvelope {
    strategy: "full";
    lossless: true;
    compression_version: int32;
  }

  /** Causality envelope normalized by build_causality. */
  model CausalityEnvelope {
    causal_chain_id: string;
    parent_event_ids: string[];
    trace_depth: int32;
    ordered: boolean;
  }

  /** Golden vector on disk (vectors/mod.rs: VectorEntry). */
  model VectorEntry {
    name: string;
    path: string;
    input: Record<unknown>;
  }

  /** One expected hash from expected-hashes.json. */
  model ExpectedHash {
    name: string;
    hash: string;
  }

  /** Triple comparison (rust vs go vs expected) per vector. */
  model ComparisonResult {
    vector_name: string;
    rust_hash: string;
    go_hash: string;
    expected_hash: string;
    hashes_match: boolean;
    go_matches_expected: boolean;
  }

  /** Aggregate result of a verify-vectors run. */
  model VerifierSummary {
    total: int32;
    passed: int32;
    failed: int32;
    results: ComparisonResult[];
  }

  // ─── Runtime replay (runtime/replay/types.rs) ────────────────────────────

  /** Byte-valued state key. */
  scalar StateKey;

  /** Byte-valued state value. */
  scalar StateValue;

  /** Key/value write set of one replay event. */
  model StateDeltaWrites {
    writes: Record<StateValue>;
  }

  /** One replayed event. */
  model ReplayEvent {
    event_id: string;
    prev_event_id: string;
    delta: StateDeltaWrites;
    delta_hash: string;
  }

  /** Replay request envelope. */
  model ReplayInput {
    events: ReplayEvent[];
    cer_root_hash: string;
    trace_root_hash: string;
    replay_binding_hash: string;
    ccnf_version: uint32;
    semantics_version: uint32;
    event_count: uint64;
  }

  /** Folded runtime state. */
  model RuntimeState {
    data: Record<StateValue>;
    version: uint64;
  }

  /** Replay result. */
  model ReplayOutput {
    final_state: RuntimeState;
    event_count: uint64;
    cer_root_hash: string;
    trace_root_hash: string;
    replay_binding_hash: string;
  }
}
