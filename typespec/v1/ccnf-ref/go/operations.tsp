/**
 * ccnf-ref (Go) — TypeSpec Operations
 *
 * Reverse-engineered from nexus/go/wrp/ccnf-ref. These are the reference
 * pipeline functions (not an HTTP surface): they document the exact
 * transformation stages a CCNF input must pass through, in order, to produce
 * a CER and its hash.
 */
import "./models.tsp";

namespace org.nexus.ccnf.ref {

  // ─── Normalization & identity ────────────────────────────────────────────

  /** Normalize free-text/structured intent into the controlled verb form. */
  op normalizeIntent(input: Record<unknown>): NormalizedIntent;

  /** Derive (entityKey, type, scope) from domain + intent + actor. */
  op deriveIdentity(input: Record<unknown>): CerIdentity;

  /** Derive "target_type:target_id" collapse key, or null when absent. */
  op deriveCollapseKey(input: Record<unknown>): string | null;

  /** Derive alias keys (currently always empty). */
  op deriveAliasKeys(input: Record<unknown>): string[];

  /** Resolve payload.data into sorted artifact refs + patches. */
  op resolveArtifacts(input: Record<unknown>): ResolvedArtifact[];

  /**
   * Compute state deltas: before_hash (null on first write),
   * after_hash = SHA256(canonical_json(patch)).
   */
  op computeStateDeltas(input: Record<unknown>, refs: string[]): StateDelta[];

  /** Delta artifact ids must stay within the intent target's scope prefix. */
  op validateDeltaScope(deltas: StateDelta[], input: Record<unknown>): void;

  // ─── CER serialization & hashing ─────────────────────────────────────────

  /** Build the wire map of a CER (serialize.go: BuildCERMap). */
  op buildCerMap(cer: Cer): Record<unknown>;

  /** Serialize a CER with the canonical JSON encoder. */
  op serializeCer(cer: Cer): bytes;

  /** Parse a CER from canonical JSON (cer.go: ParseCER). */
  op parseCer(raw: bytes): Cer;

  /** SHA256 over canonical JSON of the CER map minus signature. */
  op computeHash(cer: Cer): string;

  /** Signature envelope {hash, signed_by} — excluded from the hash. */
  op buildSignature(cer: Cer): Record<unknown>;

  // ─── Canonical JSON encoder (serializer.go) ──────────────────────────────

  /**
   * Canonical JSON: bytewise-UTF-8 key sort, compact, fixed-notation floats
   * (scientific rejected), NFC strings, epoch-second timestamps.
   */
  op canonicalJson(value: Record<unknown>): bytes;

  // ─── Replay (replay/) ────────────────────────────────────────────────────

  /** Fold all events into a runtime state. */
  op replay(events: ReplayEvent[]): RuntimeState;

  /** Replay from a cursor (cursor.Index; out-of-range handled per rules). */
  op replayFromCursor(events: ReplayEvent[], cursor: Cursor): RuntimeState;

  /** Replay events[start:end] (clamped; empty range -> initial state). */
  op replayRange(events: ReplayEvent[], start: int32, end: int32): RuntimeState;

  /** Apply a single event to a state (merge delta into entity artifacts). */
  op applyEvent(state: RuntimeState, event: ReplayEvent): RuntimeState;

  /** Fold events left-to-right over the initial state. */
  op fold(events: ReplayEvent[]): RuntimeState;

  /** Advance the cursor by one event. */
  op cursorStep(cursor: Cursor): Cursor;

  /** Jump the cursor to an index (negative -> 0). */
  op cursorJump(cursor: Cursor, index: int32): Cursor;

  /** Snapshot a runtime state with its versions. */
  op snapshot(state: RuntimeState, sourceEvents: ReplayEvent[]): SnapshotContext;
}
