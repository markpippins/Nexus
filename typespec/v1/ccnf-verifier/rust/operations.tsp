/**
 * ccnf-verifier (Rust) — TypeSpec Operations
 *
 * Reverse-engineered from nexus/rust/wrp/ccnf-verifier. The verifier runs the
 * CCNF pipeline independently of the Go reference and compares hashes against
 * the golden vector corpus (expected-hashes.json), optionally oracle-checking
 * the Go binary. CLI: `ccnf-verifier <vectors-dir>` or `--stdin` (emits
 * `ccnf_hash:<hash>`).
 */
import "./models.tsp";

namespace org.nexus.ccnf.verifier {

  // ─── Contract validation rules (contract/) ───────────────────────────────

  /** Object keys must be non-empty. */
  op validateKey(key: string): void;

  /** Scientific notation is rejected in numeric literals. */
  op validateFloatRepr(value: string): void;

  /** Deterministic key ordering: lexicographic bytewise UTF-8. */
  op sortKeys(keys: string[]): string[];

  // ─── Canonicalization (canonical/) ───────────────────────────────────────

  /**
   * Canonicalize a JSON value: NFC-normalize strings, convert timestamps to
   * epoch int64 (RFC-3339 or numeric), empty collapse_key -> null.
   */
  op canonicalizeFields(value: Record<unknown>): Record<unknown>;

  /** Canonical encoder: compact, sorted, fixed-notation; returns bytes. */
  op encodeCanonical(value: Record<unknown>): bytes;

  /** SHA256 hex over canonical UTF-8 bytes (no trailing newline). */
  op sha256Hex(bytes: bytes): string;

  // ─── CCNF pipeline (ccnf/) ───────────────────────────────────────────────

  /** Structural parse: root object with actor, intent, domain, event_id. */
  op structuralParse(value: Record<unknown>): void;

  /** Embedded ccnf_version must equal the engine version. */
  op checkEmbeddedVersion(value: Record<unknown>, expected: uint32): void;

  /** Normalize intent to the controlled verb vocabulary. */
  op normalizeIntent(value: Record<unknown>): Record<unknown>;

  /** target_id, when present, must be a valid `type:id` reference. */
  op checkTargetId(value: Record<unknown>): void;

  /** Artifact id validity: >= 2 colon-separated non-empty parts. */
  op isValidArtifactId(id: string): boolean;

  /** Build the Cer envelope from the pipeline state (build.rs: build_cer). */
  op buildCer(
    value: Record<unknown>,
    ccnfVersion: uint32,
    entityKey: string,
    identityType: string,
    scope: string,
    collapseKey: string | null,
    aliasKeys: string[],
    artifactRefs: string[],
    stateDelta: Record<unknown>[],
  ): Cer;

  /** Hash of a CER: canonical JSON of the map minus signature. */
  op computeHashFromCer(cer: Cer): string;

  /** Full pipeline: parse -> canonicalize -> normalize -> build -> hash. */
  op runPipeline(input: string, ccnfVersion: uint32): string;

  // ─── Vector verification (verifier/, vectors/) ───────────────────────────

  /** Load golden vectors from a directory (sorted; skips expected-hashes). */
  op loadVectors(dir: string): VectorEntry[];

  /** Load expected hashes (flat keys: `<vector>.canonical_hash[_a|_b]`). */
  op loadExpectedHashes(dir: string): ExpectedHash[];

  /** Extract input / input_a / input_b fields of a vector as JSON strings. */
  op extractVectorInputs(root: Record<unknown>): string[];

  /**
   * Verify vectors: Rust hash vs expected, plus Go oracle triple-check when
   * the binary is available. GATE PASS/FAIL by failed count.
   */
  op verifyVectors(vectors: VectorEntry[], expected: ExpectedHash[], goBinary: string): VerifierSummary;

  /** Compare rust/go/expected triple into a result. */
  op compareTriple(vectorName: string, rustHash: string, goHash: string, expectedHash: string): ComparisonResult;

  /** Structural equality of two JSON values. */
  op cerEqual(a: Record<unknown>, b: Record<unknown>): boolean;

  // ─── Runtime replay validation (runtime/) ────────────────────────────────

  /** Validate a replay input binding against the committed root hashes. */
  op validateReplay(input: ReplayInput): ReplayOutput;
}
