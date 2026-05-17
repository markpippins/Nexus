---
name: cer-pipeline
phase: post-emission, pre-storage
status: specified
---

# CER Pipeline Skill

## Purpose

Stateless, deterministic transformation layer between raw event emission and CER canonical store. Also provides CER rehydration on the read path (replay entry point).

This is not a pipeline stage — it is a transformation substrate that all emitters pass through.

## References
- [CER Canonical Normalization Function (CCNF)](../../docs/CER_CCNF.md)
- [CER Specification v1](../../docs/CER_SPEC.md)
- [Event Grammar v3](../../docs/EVENT_GRAMMAR.md)

## Input (Write Path)
- `raw_event: object` — arbitrary structured input from any emitter (scheduler, validator, spec compiler, etc.)
- `ccnf_version: int` — version of CCNF to apply (default 1)
- `current_state_snapshot: {artifact_id → state_hash}` — for state_delta computation

## Output (Write Path)
- `cer_event: CER` — fully formed CER ready for EventLog append
- `causal_dependency_index_update` — delta update for the causal dependency index

## Input (Read Path)
- `cer_events: CER[]` — sequential CER events from EventLog
- `collapse_engine_version: int` — version of collapse rules to apply
- `rehydration_version: int` — version of rehydration semantics

## Output (Read Path)
- `canonical_events: CanonicalEvent[]` — fully rehydrated event stream for replay fold

## Constraints
- MUST NOT perform I/O, external state access, or side effects
- MUST be deterministic: identical input → identical output across all hosts
- MUST reject events that fail CCNF normalization — no fallback, no coercion
- MUST preserve causal order — rehydrated stream is in same order as input
- `entity_key` once assigned is immutable — collapse only produces alias relationships

---

## Write Path

### Step 1: Normalize via CCNF

```python
def normalize(raw_event, ccnf_version=1):
    return CCNF(raw_event, ccnf_version)
    # See CER_CCNF.md for the 8-step pipeline
    # On failure: raise typed error (PARSE_FAILURE, TYPE_MISMATCH, etc.)
    # No fallback, no coercion
```

### Step 2: Assign Identity (Write-Time Tagging Only)

Identity assignment tags the event with its stable identity fingerprint. **No semantic collapse at write time.**

```python
def assign_identity(ccnf_output):
    # entity_key is already derived by CCNF Step 3
    # collapse_key derived from stable human identifier
    # alias_keys attached if available from emitter metadata

    cer = ccnf_output
    cer.identity.entity_key = ...  # from CCNF
    cer.identity.collapse_key = derive_collapse_key(cer)
    cer.identity.alias_keys = extract_alias_hints(cer.intent)

    # Rule: identity assignment is immutable.
    # Once written, entity_key never changes.
    return cer
```

### Step 3: Structural Dedup

Drop byte-identical duplicates only. This catches exactly duplicate emissions (retry artifacts, race conditions).

```python
def structural_dedup(cer, recent_events):
    canonical_form = canonical_serialize(cer)  # CCNF Step 7

    for existing in recent_events:
        if canonical_serialize(existing) == canonical_form:
            return None  # exact duplicate, drop silently

    return cer
```

**Rule:** Only exact byte-level match. No semantic similarity. No fuzzy matching.

### Step 4: Compute Delta (Artifact-Scoped)

```python
def compute_delta(cer, current_state_snapshot):
    deltas = []

    for artifact_id in cer.artifact_refs:
        prior_state = current_state_snapshot.get(artifact_id)
        new_state = cer.payload.data.get(artifact_id)

        if prior_state is None:
            # creation — no before_hash
            deltas.append({
                "artifact_id": artifact_id,
                "before_hash": None,
                "after_hash": SHA256(new_state),
                "patch": new_state  # full replacement
            })
        else:
            # mutation — compute patch
            patch = compute_json_patch(prior_state, new_state)  # RFC 6902
            deltas.append({
                "artifact_id": artifact_id,
                "before_hash": SHA256(prior_state),
                "after_hash": SHA256(new_state),
                "patch": patch
            })

    cer.state_delta = deltas
    return cer
```

### Step 5: Select Compression Strategy

```python
def select_strategy(cer, context):
    # FULL: causal boundaries, first event in chain, identity merge, semantic crossing, snapshots
    if context.is_causal_boundary \
       or context.is_first_event \
       or context.is_identity_merge \
       or context.is_semantic_boundary:
        cer.compression.strategy = "full"
        cer.compression.lossless = True
        cer.compression.compression_version = 1
        return cer

    # DELTA: incremental execution between FULL events
    if context.has_ancestor:
        cer.compression.strategy = "delta"
        cer["ancestor_event_id"] = context.ancestor_event_id
        cer.compression.lossless = True
        cer.compression.compression_version = 1
        return cer

    # ALIAS: identity merge, rename, dedup — no state change
    if context.strategy_hint == "alias":
        cer.compression.strategy = "alias"
        cer.state_delta = []  # no state change
        cer.compression.lossless = True
        cer.compression.compression_version = 1
        return cer

    # default to FULL
    cer.compression.strategy = "full"
    return cer
```

### Step 6: Sign

```python
def sign(cer):
    canonical = canonical_serialize(cer)  # CCNF Step 7, deterministic field order
    cer.signature.hash = SHA256(canonical)
    cer.signature.signed_by = None  # optional: set if key available
    return cer
```

### Step 6b: Update Causal Dependency Index

The causal dependency index is a **write-time derived artifact** stored alongside the CER log partition. It maps each `(causal_chain_id, entity_key) → {parent_entity_keys, dependent_count}`.

```python
def update_dependency_index(cer, index):
    chain_id = cer.causality.causal_chain_id
    entity_key = cer.identity.entity_key
    parents = cer.causality.parent_event_ids

    if chain_id not in index:
        index[chain_id] = {}

    if entity_key not in index[chain_id]:
        index[chain_id][entity_key] = {
            "parents": set(),
            "dependents": set()
        }

    for parent_id in parents:
        parent_event = resolve_event(parent_id)
        parent_key = parent_event.identity.entity_key
        index[chain_id][entity_key].parents.add(parent_key)
        if parent_key in index[chain_id]:
            index[chain_id][parent_key].dependents.add(entity_key)

    return index
```

### Full Write Path

```python
def process_raw_event(raw_event, ccnf_version, current_state_snapshot,
                      recent_events, dependency_index, context):
    # 1. Normalize via CCNF
    ccnf_output = normalize(raw_event, ccnf_version)

    # 2. Assign identity
    cer = assign_identity(ccnf_output)

    # 3. Structural dedup (exact match only)
    if structural_dedup(cer, recent_events) is None:
        return None  # duplicate, silently dropped

    # 4. Compute artifact-scoped delta
    cer = compute_delta(cer, current_state_snapshot)

    # 5. Select compression strategy
    cer = select_strategy(cer, context)

    # 6. Sign
    cer = sign(cer)

    # 6b. Update dependency index (write-time derived artifact)
    dependency_index = update_dependency_index(cer, dependency_index)

    return cer
```

---

## Read Path (Rehydration)

The rehydration layer converts CER events back into a fully materialized event stream for the replay engine.

### Step R1: Decompress DELTA Events

```python
def decompress_delta(cer_event, prior_event_store):
    if cer_event.compression.strategy != "delta":
        return cer_event  # no-op for non-DELTA

    ancestor = prior_event_store.get(cer_event.ancestor_event_id)
    if ancestor is None:
        raise RehydrationError(f"Orphan DELTA: ancestor {cer_event.ancestor_event_id} not found")

    # Verify ancestor chain
    if ancestor.causality.causal_chain_id != cer_event.causality.causal_chain_id:
        raise RehydrationError("Cross-chain DELTA")
    if ancestor.compression.strategy == "delta":
        raise RehydrationError("Chained DELTA — must trace to FULL ancestor")

    # Reconstruct full state from ancestor + patch
    reconstructed = copy.deepcopy(ancestor.payload.data)
    for delta in cer_event.state_delta:
        reconstructed[delta.artifact_id] = apply_patch(
            reconstructed.get(delta.artifact_id),
            delta.patch
        )
        assert SHA256(reconstructed[delta.artifact_id]) == delta.after_hash

    cer_event.payload.data = reconstructed
    return cer_event
```

### Step R2: Resolve ALIAS Events

```python
def resolve_alias(cer_event):
    if cer_event.compression.strategy != "alias":
        return cer_event

    # ALIAS events carry no state change — only identity metadata
    # The rehydrated output is a zero-state-change event
    cer_event.state_delta = []
    cer_event.payload.data = {}
    return cer_event
```

### Step R3: Expand SYNTHETIC Events

```python
def expand_synthetic(cer_event, source_events):
    if not getattr(cer_event, "synthetic", False):
        return cer_event

    # Verify derivation_source is valid
    for source_id in cer_event.derivation_source:
        if source_id not in source_events:
            raise RehydrationError(f"SYNTHETIC event references missing source: {source_id}")

    # Deterministic expansion is domain-specific
    # This function validates that the synthetic event is a deterministic
    # consequence of its sources, but does NOT recompute it
    return cer_event
```

### Step R4: Apply Semantic Collapse (Rules 2 + 3)

Semantic collapse is applied at read-time only. It produces alias relationships, never identity mutation.

```python
def apply_semantic_collapse(events, collapse_engine_version):
    collapse_index = {}  # entity_key → canonical entity_key
    visited_keys = set()

    for event in events:
        key = event.identity.entity_key
        ck = event.identity.collapse_key
        aliases = event.identity.alias_keys

        # Rule 2: collapse_key equivalence
        for existing_key, existing_ck in collapse_index.items():
            if ck is not None and ck == existing_ck:
                entity_match = semantic_field_match(event, existing_key)
                if entity_match:
                    collapse_index[key] = existing_key
                    break

        # Rule 3: alias resolution
        if key not in collapse_index and aliases:
            for existing_key, existing_aliases in collapse_index.items():
                if set(aliases) & set(existing_aliases):
                    state_match = check_state_delta_consistency(event, existing_key)
                    if state_match:
                        collapse_index[key] = existing_key
                        break

        if key not in collapse_index:
            collapse_index[key] = key  # self-canonical

    # Resolve alias cycles (I6: O(n), visited set, no re-entry)
    resolved = {}
    for key, canonical in collapse_index.items():
        visited = set()
        current = canonical
        while current != collapse_index.get(current, current):
            if current in visited:
                raise RehydrationError("ALIAS cycle detected")
            visited.add(current)
            current = collapse_index.get(current, current)
        resolved[key] = current

    # Map events to canonical entity_keys (alias relationships only, no identity mutation)
    for event in events:
        original_key = event.identity.entity_key
        resolved_key = resolved.get(original_key, original_key)
        if resolved_key != original_key:
            event.identity.entity_key = resolved_key

    return events
```

### Full Read Path

```python
def rehydrate(cer_events, collapse_engine_version, prior_event_store):
    events = []

    for cer in cer_events:
        # R1: Decompress DELTA
        cer = decompress_delta(cer, prior_event_store)

        # R2: Resolve ALIAS
        cer = resolve_alias(cer)

        # R3: Expand SYNTHETIC
        cer = expand_synthetic(cer, prior_event_store)

        # Store for future DELTA resolution
        prior_event_store[cer.event_id] = cer

        events.append(cer)

    # R4: Semantic collapse
    events = apply_semantic_collapse(events, collapse_engine_version)

    return events
```

---

## Causal Dependency Index (Write-Time Artifact)

### Format

```
.pipeline/events/cer/{domain}/{causal_chain_id}/
  dependency_index.json
```

### Schema

```json
{
  "causal_chain_id": "uuid",
  "domain": "executiongraph",
  "entities": {
    "entity_key_1": {
      "parents": ["entity_key_a", "entity_key_b"],
      "dependents": ["entity_key_c"]
    }
  },
  "last_updated": "event_id"
}
```

### Purpose

The index enables:
- Anti-collapse guard enforcement (V12.3)
- Dependency-aware replay (skip non-dependent events)
- Snapshot boundary detection (identity merge events)

### Update Rule

Updated synchronously with each CER append. The index is a **derived artifact** — if lost, it can be reconstructed by replaying the CER log.

---

## Error Model

| Error | Phase | Cause | Handling |
|---|---|---|---|
| `CCNF_FAILURE` | Write | Raw input fails CCNF normalization | Reject event, report to emitter |
| `DUPLICATE_EVENT` | Write | Structural dedup match | Silently drop |
| `ORPHAN_DELTA` | Read | DELTA ancestor_event_id not found | Abort rehydration |
| `CROSS_CHAIN_DELTA` | Read | DELTA ancestor in different causal chain | Abort rehydration |
| `CHAINED_DELTA` | Read | DELTA ancestor is also DELTA | Warn, trace to FULL ancestor |
| `SYNTHETIC_SOURCE_MISSING` | Read | SYNTHETIC derivation_source unresolved | Abort rehydration |
| `ALIAS_CYCLE` | Read | Alias resolution does not terminate | Abort rehydration |
| `STATE_DELTA_MISMATCH` | Read | after_hash does not match recomputed state | Abort rehydration |

## Invariants

| # | Invariant |
|---|---|
| P1 | Write path is stateless: no I/O, no side effects, no host-specific output |
| P2 | `entity_key` is immutable after assignment. Collapse produces alias relationships only |
| P3 | Rehydration is deterministic under identical (CCNF_version, collapse_engine_version, store_version) |
| P4 | Rehydration produces events in causal order — same order as input |
| P5 | Every DELTA has a FULL ancestor in the same causal_chain_id — verified on write |
| P6 | Causal dependency index is always a derived artifact — never authoritative |
| P7 | Legacy events are adapted via LegacyCERAdapter, never rewritten |
| P8 | Semantic collapse is read-time only — never stored in EventLog |
