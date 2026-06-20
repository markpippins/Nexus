> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

# Canonical Event Record (CER) v1

## Related Specifications

| Document | Relationship |
|---|---|
| [`CER_CCNF.md`](./CER_CCNF.md) | Canonical Normalization Function — deterministic transform from raw input to CER |
| [`CER_SNAPSHOT_ENGINE.md`](./CER_SNAPSHOT_ENGINE.md) | Snapshot Engine — compressed state materialization from CER event log |
| [`CCNF_FAILURE_MODES.md`](./CCNF_FAILURE_MODES.md) | Failure mode analysis for CCNF normalization |
| [`EVENT_GRAMMAR.md`](./EVENT_GRAMMAR.md) | Event type taxonomy and causal grammar (all events stored as CER) |
| [`REPLAY_ENGINE.md`](./REPLAY_ENGINE.md) | Temporal reconstruction from CER event log |
| [`VALIDATOR_SPEC.md`](./VALIDATOR_SPEC.md) | V12 — CER validation rules for event log consistency |
| [`DISTRIBUTED_SCHEDULER.md`](./DISTRIBUTED_SCHEDULER.md) | State derivation via CER in distributed scheduling |
| [`OBSERVATION_MODEL.md`](./OBSERVATION_MODEL.md) | Phase 3 — semantic projection over CER event log + ExecutionGraph |

## 0. System Role

CER is the **single canonical event format** for all system events after emission. Raw input exists only as a transient ingestion format. The pipeline is:

```
RAW INPUT
  ↓
CCNF (see CER_CCNF.md)
  ↓
CER PIPELINE (see skills/cer-pipeline/SKILL.md)
  ↓
EVENTLOG (CER canonical store)
```

CER replaces all previous event formats. There is exactly one truth: CER.

## 1. Base Schema v1

```json
{
  "event_id": "uuid",
  "event_version": 1,

  "ccnf_version": 1,

  "system": "nexus",
  "domain": "specification | execution | lowering | system | observation",

  "timestamp": 1730000000,

  "actor": {
    "type": "llm | user | system | agent",
    "id": "string",
    "session_id": "string"
  },

  "intent": {
    "type": "normalized_verb",
    "action": "create | update | delete | execute | validate | emit",
    "target_type": "node | edge | graph | state | artifact",
    "target_id": "type:id"
  },

  "identity": {
    "entity_key": "SHA256 hex",
    "type": "node | event | artifact | rule | graph",
    "scope": "executiongraph.v2 | specification | system",
    "collapse_key": "human-stable-key",
    "alias_keys": ["string"]
  },

  "causality": {
    "parent_event_ids": ["uuid"],
    "causal_chain_id": "uuid",
    "trace_depth": 0,
    "ordered": true
  },

  "artifact_refs": ["type:id"],

  "state_delta": [
    {
      "artifact_id": "type:id",
      "before_hash": "SHA256 hex | null",
      "after_hash": "SHA256 hex",
      "patch": {}
    }
  ],

  "payload": {
    "type": "structured | blob | reference",
    "data": {}
  },

  "compression": {
    "strategy": "full | delta | alias | synthetic",
    "lossless": true,
    "compression_version": 1
  },

  "signature": {
    "hash": "SHA256 hex",
    "signed_by": "optional-key-id | null"
  }
}
```

### 1.1 Field Semantics

| Field | Rule |
|---|---|
| `event_id` | Globally unique, monotonic, assigned at emission |
| `event_version` | Schema version. Backwards compatibility required. Never reused per version family |
| `ccnf_version` | CCNF version used to produce this CER. Defines identity epoch (see I11) |
| `system` | Always `nexus` |
| `domain` | Which plane this event belongs to |
| `timestamp` | Epoch seconds (int64). No timezone, no ISO strings |
| `actor` | Who/what caused this event |
| `intent` | Controlled vocabulary via CCNF Step 4. No free-text intent |
| `identity` | Identity resolution layers (see §3) |
| `causality` | Causal ancestry. `ordered: true` means array order MUST be preserved |
| `artifact_refs` | Resolved `type:id` pairs. Immutable per event. Value-bound, not reference-bound |
| `state_delta` | Artifact-scoped patches. One entry per artifact in `artifact_refs`. See CCNF Step 6 |
| `payload` | Event-specific structured data. Non-intent, non-identity information |
| `compression` | Compression metadata (see §4) |
| `signature` | SHA256 of canonical serialization. See CCNF Step 8 |

## 2. Three Independent Version Axes

### 2.1 Schema Version (`event_version`)

- Changes when base structure changes (new required field, field type change, etc.)
- Backwards compatibility required: old-schema events MUST be readable by new-schema readers
- Transformation via adapters, never mutation. v1 event → v2 reader → normalized CER
- Never reused per version family

### 2.2 Compression Version (`compression.compression_version`)

- Changes when compression algorithm changes (new delta format, new strategy)
- Allows rehydration across formats
- Stored per-event so heterogeneous compression strategies coexist

### 2.3 Domain Version (implicit in `identity.scope`)

- Execution semantics version
- Example: `executiongraph.v2`
- Determines domain-specific identity resolution rules

## 3. Identity Collapse System

### 3.1 Identity Layers

Every entity has 3 identity layers:

```json
"identity": {
  "entity_key": "SHA256(canonical_entity_signature)",
  "collapse_key": "human-stable-key",
  "alias_keys": ["historical-names", "synonyms"]
}
```

**Definitions:**

| Layer | Role | Derived From |
|---|---|---|
| `entity_key` | Hard identity — cryptographic fingerprint | CCNF Step 3: canonical_entity_signature (no runtime/temporal data) |
| `collapse_key` | Semantic identity — stable across time | Stable human identifier. Lowercased, dot-separated, domain-scoped |
| `alias_keys` | Soft identity — historical names, renames | Purely referential. Never used in hashing |

### 3.2 Collapse Rules

#### Rule 1 — Structural Equality Collapse

Two entities collapse if:

```
entity_key(A) == entity_key(B)
```

This is exact match. No interpretation. Same input to SHA256 → same entity_key → same entity.

#### Rule 2 — Semantic Equivalence Collapse

Collapse if:

```
collapse_key(A) == collapse_key(B)
```

AND no breaking field divergence in static_attributes.

Used for:
- Renamed nodes (same role, different identifier)
- Refactored systems (same semantic purpose)
- LLM rephrasing same concept (stable collapse_key catches it)

**Applied at read-time only.** Write-time tagging assigns entity_key from CCNF, which already canonicalizes semantically equivalent input. This rule catches cases where inputs differed but collapse_key matches.

#### Rule 3 — Alias Resolution Collapse

Collapse if:

```
alias_keys(A) ∩ alias_keys(B) ≠ ∅
```

AND no contradiction in `state_delta` history (applying A's state changes then B's does not produce conflict).

Used for:
- "execution-validator" vs "validator"
- "S1-rule" vs "static-rule-1"
- Historical renames

**Applied at read-time only.**

#### Rule 4 — Anti-Collapse Guard

**NEVER collapse if ALL THREE hold:**

1. `causal_chain_id(A) ≠ causal_chain_id(B)` (different causal chains)
2. `state_delta` history diverges semantically (A and B mutated the same field to different values)
3. Both have downstream dependents in the causal dependency index

This prevents graph corruption. Two independently evolved entities that diverged in state AND have dependents must remain distinct.

**Note:** Requires a write-time causal dependency index (see CER Pipeline §Write-Time). Without it, condition 3 is unenforceable and this rule becomes advisory only.

### 3.3 Collapse Engine Versioning (I9)

Semantic collapse (Rules 2 + 3) is versioned. `replay(CER_events)` is a function of `(events + collapse_engine_version)` — changing the version changes collapse outcomes.

```
collapse_engine_version: int
```

- Changes when collapse rules change
- Snapshot validity is scoped to the collapse_engine_version at creation time
- `replay(CER_events)` is a function of `(events + collapse_engine_version)`
- Collapse engine MUST be CCNF-bound: operates on CCNF-normalized structure only

## 4. Compression Strategy System

### 4.1 FULL

Stores everything.

```
compression.strategy = "full"
```

Used for:
- Snapshots
- Causal boundaries
- First event in a causal chain
- Identity merge events
- Semantic boundary crossings

### 4.2 DELTA

Stores only the patch for each artifact.

```json
{
  "compression": { "strategy": "delta" },
  "state_delta": [{
    "artifact_id": "node:123",
    "before_hash": "abc...",
    "after_hash": "def...",
    "patch": { "op": "replace", "path": "/lifecycle_state", "value": "RUNNING" }
  }],
  "ancestor_event_id": "uuid-of-prior-FULL-or-DELTA"
}
```

Used for incremental execution between FULL events.

**Constraint:** Every DELTA event MUST have a FULL ancestor in the same `causal_chain_id` AND `domain` scope. The `ancestor_event_id` field provides the explicit reference — no search-based ancestor resolution is permitted.

### 4.3 ALIAS

No state change. Only identity merge metadata.

```json
{
  "compression": { "strategy": "alias" },
  "state_delta": [],
  "identity": {
    "entity_key": "...",
    "alias_keys": ["new-alias"],
    ...
  }
}
```

Used for:
- Renaming
- Deduplication
- Canonicalization pass

### 4.4 SYNTHETIC

Generated event — not emitted by a system component.

```json
{
  "compression": { "strategy": "synthetic" },
  "synthetic": true,
  "derivation_source": ["event_ids that produced this synthetic event"]
}
```

Used for:
- Replay reconstruction
- Inferred causality edges
- Missing event repair

**Constraint:** Every SYNTHETIC event MUST carry `derivation_source` referencing the CER events from which it was derived. The derivation MUST be verifiable by replaying the source events and confirming the synthetic event is a deterministic consequence.

## 5. Snapshot Triggers

Snapshots are NOT time-based. They are triggered by semantic boundaries:

**Condition A — Causal Depth Threshold**

```
trace_depth > N (configurable, default 1000)
```

**Condition B — Identity Merge Event**

A large collapse event was detected (Rule 2 or Rule 3 merge affecting ≥ threshold entities).

**Condition C — Semantic Boundary Crossing**

Domain changes in causal flow:
- specification → execution
- execution → validation
- lowering → execution

**Condition D — Compression Ratio Trigger**

```
event_stream_size / snapshot_size > threshold (configurable)
```

## 6. Three-Phase Truth Model

```
PHASE 1 — GENERATION (CER Pipeline)
  Stateless, deterministic transformation from raw input to CER.
  Emits CER events to EventLog.

PHASE 2 — RECONSTRUCTION (Replay + Rehydration)
  Reads CER events, rehydrates (decompress, collapse, resolve),
  applies pure fold to reconstruct RuntimeSnapshot.

PHASE 3 — COMPRESSION (Snapshot Engine)
  Async, independent scanning process consumes CER event log,
  builds snapshots (materialized entity state at semantic boundaries).
```

**Invariant (I10):** No phase may perform another phase's function.
- Generation does not reconstruct or compress.
- Reconstruction does not generate or compress.
- Compression does not generate or reconstruct.

## 7. Replay Invariant

```
replay(rehydrate(CER_events[0..n])) == snapshot_n
```

Validity requires triple-version lock:

```
snapshot_n is valid iff:
  ccnf_version(SNAPSHOT) == ccnf_version(CER STREAM)  AND
  collapse_engine_version(SNAPSHOT) == collapse_engine_version(READ PATH)  AND
  rehydration_version(SNAPSHOT) == rehydration_version(READ PATH)
```

No partial matching. All three must match exactly.

## 8. Storage Model

```
.pipeline/
  events/
    cer/
      {domain}/
        {causal_chain_id}/
          events.log      ← sequential CER events, one per line (JSON lines format)
          index.json      ← event offset index (mapping event_id → byte offset)
                                    
  snapshots/
    {domain}/
      {causal_chain_id}/
        snapshot_{n}.cer.json     ← materialized snapshot
        snapshot_{n}.hash.json    ← hash chain anchor
```

### 8.1 Separation Rule

Events and snapshots are NEVER colocated in the same logical store. Snapshots are derived artifacts, not event stream data.

### 8.2 Legacy Storage

Raw pre-CER events remain untouched at their original location:

```
.pipeline/events/legacy/{domain}/{YYYY}/{MM}/{event-id}.json
```

These are readable at replay via a backward-compatible CER adapter, but are NEVER rewritten or backfilled. See Backfill Policy (§9).

## 9. Backfill Policy (Legacy Events)

### 9.1 Principle

No full backfill. Legacy events remain untouched.

### 9.2 Two-Phase Adoption

**Phase 1 (Compatibility):**

```
legacy_event → LegacyCERAdapter → CER runtime
```

The adapter applies CCNF at replay time. No rewriting of history.

**Phase 2 (Gradual Promotion):**

Only events that are replayed, validated, or checkpointed into snapshots are persisted as CER. This is a lazy projection:

- Replay engine caches CER-converted events at first access
- Validation system promotes validated legacy events to CER
- Snapshot engine snapshotting legacy ranges produces CER-native snapshots

### 9.3 Audit Invariant

```
Legacy events are never modified.
CER representation of legacy events is always derived (never stored as authoritative).
```

## 10. System Invariant

```
CER = System Truth
Events = CER stream (immutable, append-only, identity-stable)
Snapshots = Derived compression of CER history (deletable, regenerable)
Identity = CCNF-defined with epoch isolation
```
