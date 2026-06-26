> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

# CCNF Failure-Mode Catalog (Implementation Reality Layer)

## Related Specifications

| Document | Relationship |
|---|---|
| [`CER_CCNF.md`](./CER_CCNF.md) | CCNF specification — this catalog documents its failure modes |
| [`CER_SPEC.md`](./CER_SPEC.md) | Canonical Event Record format — affected by normalization failures |
| [`CER_SNAPSHOT_ENGINE.md`](./CER_SNAPSHOT_ENGINE.md) | Snapshot Engine — snapshots depend on CCNF stability |

## 0. Purpose

CCNF is the physics layer. If it is wrong, everything downstream is silently wrong. This catalog enumerates every known failure mode for CCNF implementations, with root cause, detection method, and hard enforcement rule.

This is the **implementation correctness layer** — the bridge between spec correctness (already achieved) and running code.

---

## 1. Serialization Drift (CRITICAL)

### Symptom
Two systems produce different `entity_key`, `signature.hash`, or snapshot validation failure despite "logically identical" input.

### Root Cause
Any variation in:
- JSON key ordering
- Whitespace normalization
- Number encoding (float vs int vs scientific notation)
- Unicode normalization mismatch (NFC/NFD/NFKC)
- Timestamp formatting differences
- Different JSON serialization libraries

### Detection
Golden vector mismatch on `SHA256(serialized_CER_string)` or `entity_key` divergence across hosts. The test suite at `.agent/tests/cer-ccnf-conformance/vectors/v1/` contains 32 vectors covering all known drift vectors.

### Enforcement
```
RULE: There is exactly one serialization function in the entire system.
  - Canonical JSON serializer (compact, no whitespace, lexicographic keys)
  - UTF-8 NFC normalization at ingress only
  - Fixed numeric representation (IEEE-754 double, no scientific notation)
  - All timestamps are epoch seconds (int64)
  - The serializer is the ONLY code path that produces canonical output
```

### Conformance Gate
```
assert SHA256(serialize(CCNF(raw))) == expected_hash  // must pass for ALL golden vectors
assert entity_key(CCNF(raw)) == expected_entity_key    // must pass for ALL golden vectors
```

---

## 2. CCNF Partial Execution (Silent Spec Violation)

### Symptom
Events "look valid" but:
- Missing artifact resolution
- Incomplete intent normalization
- Skipped identity derivation

Replay "almost works" but diverges later.

### Root Cause
Emitter bypasses CCNF steps or reorders pipeline. Performance shortcut or "we already know the value" assumption.

### Detection
Validator passes schema, but `replay(snapshot_n) ≠ expected hash chain`.

### Enforcement
```
HARD RULE: CCNF is not a library — it is a mandatory gate.
  No raw event can enter the CER pipeline without:
    - ccnf_version (explicit, in the event header)
    - ccnf_signature (signature.hash is the SHA256 of canonical output)
  
  If ccnf_version is missing from input → reject at pipeline boundary.
  If ccnf_version is present but does not match current CCNF engine → reject.
  If signature.hash cannot be verified → reject.
```

### Conformance Gate
```
assert CCNF.is_mandatory_gate()  // all raw events pass through CCNF before any pipeline logic
assert all_steps_executed(ccnf_output)  // no step was skipped or short-circuited
```

---

## 3. Identity Key Instability (CRITICAL)

### Symptom
Same conceptual entity produces multiple `entity_key` variants, broken collapse behavior, or alias explosion.

### Root Cause
Wrong inclusion in `canonical_entity_signature`:
- Accidental inclusion of runtime state
- Ordering-sensitive fields
- Non-normalized strings
- Implicit context leakage (host name, session id, environment variable)

### Detection
Golden vector mismatch:
```
entity_key(CCNF(raw_input_A)) ≠ entity_key(CCNF(raw_input_A))   // different runs
entity_key(CCNF(raw_input_A on HOST_X)) ≠ entity_key(CCNF(raw_input_A on HOST_Y))  // different hosts
```

### Enforcement
```
RULE: entity_key input is a PURE function of CCNF-normalized static fields only.

FORBIDDEN in canonical_entity_signature:
  - timestamps (event-level temporal data)
  - runtime state (lifecycle_state, executor_instance)
  - event ordering (causal chain position, event index)
  - system state (host health, queue depth, lease status)
  - transient IDs (session_id, lease_id, ephemeral handles)

ALLOWED in canonical_entity_signature:
  - entity type (node, event, artifact, rule, graph)
  - normalized_name (deterministic string from intent + scope)
  - scope (executiongraph.v2, specification, system)
  - artifact_refs (resolved type:id pairs)
  - static_attributes (type information, structural metadata only)
```

### Conformance Gate
```
for each golden_vector:
    key1 = CCNF(vector.input).identity.entity_key
    key2 = CCNF(vector.alternate_input).identity.entity_key  // same semantics, different runtime values
    assert key1 == key2  // entity_key is stable across runtime variation
```

---

## 4. Hidden State Leakage (REPLAY BREAKER)

### Symptom
Replay diverges only after long sequences. Early replay OK, late replay diverges.

### Root Cause
Some CCNF step (or pipeline step) depends on external cache, previous execution environment, or implicit global state. The contamination is invisible during unit tests but accumulates over long event sequences.

### Detection
```
replay(events[0..100]) matches snapshot
replay(events[0..200]) diverges from snapshot  // cumulative effect
replay(events[0..N]) diverges more as N grows   // compounding error
```

### Enforcement
```
HARD RULE: Every transformation in CCNF + CER pipeline is a pure function of:

  output = f(input_event, direct_artifact_state_only)

  No hidden dependencies allowed:
    - NO global variables
    - NO file system access
    - NO network calls
    - NO random number generation
    - NO clock reads
    - NO environment variable reads
    - NO previous event state (except where explicitly passed as state_delta input)
```

### Conformance Gate
```
assert CCNF.is_pure()  // all inputs explicit, no I/O, no side effects, no hidden state
```

---

## 5. Numeric Canonicalization Drift

### Symptom
Identical mathematical values produce different hashes.

### Root Cause
- Float precision differences across platforms (CPU architectures, language runtimes)
- Different JSON libraries with different numeric serialization behavior
- Implicit rounding (32-bit vs 64-bit float)
- Locale-dependent formatting (comma vs period as decimal separator)
- Scientific notation vs fixed notation

### Detection
```
SHA256(serialize(input_with_float)) differs across hosts despite same logical value
```

### Enforcement
```
RULE: All numbers in CER are IEEE-754 double precision.

  - No mixed representation allowed (int can be represented as double 1.0, but
    this is NOT recommended — prefer integer representation when possible)
  - No scientific notation in serialized output
  - No implicit rounding or truncation
  - Serialization must preserve canonical numeric form:
    - Integers: serialized as JSON number without decimal point
    - Floating point: serialized with decimal point, NO trailing zeros
    - Example: 42.0 → 42.0 (NOT 42, NOT 4.2e1)
  - Locale-independent serialization (always use '.' as decimal separator)
```

### Conformance Gate
```
assert canonical_form(42) == "42"
assert canonical_form(42.0) == "42.0"
assert canonical_form(1e2) == "100.0"
assert canonical_form(0.1) == "0.1"
```

---

## 6. Unicode / String Normalization Drift

### Symptom
Identical logical strings produce different `entity_key` values.

### Root Cause
- NFC vs NFD Unicode normalization mismatch between systems
- Invisible whitespace differences (zero-width space, non-breaking space, etc.)
- UTF-8 vs UTF-16 conversion artifacts in different language runtimes
- BOM (byte order mark) inclusion or exclusion

### Detection
```
entity_key("café") on host A ≠ entity_key("café") on host B
// both display as "café" but one is pre-composed and one is decomposed
```

### Enforcement
```
HARD RULE: All strings are normalized at CCNF ingress using UTF-8 NFC normalization.

  - NFC is the ONLY normalization form permitted
  - All strings are trimmed of leading/trailing whitespace
  - Internal whitespace collapsed to single space (U+0020)
  - Zero-width characters (U+200B, U+FEFF) are stripped at ingress
  - No BOM in serialized output
  - Case is preserved (NO case folding at CCNF stage)
```

### Conformance Gate
```
assert normalize_string("café") == normalize_string("cafe\u0301")  // NFC: é must be single codepoint
assert normalize_string("  hello  world  ") == "hello world"       // trimmed and collapsed
assert normalize_string("\uFEFFtest") == "test"                     // BOM stripped
```

---

## 7. Delta Chain Breakage (CRITICAL)

### Symptom
DELTA event cannot reconstruct state. Missing or mismatched `ancestor_event_id`.

### Root Cause
- Missing FULL ancestor in same causal chain
- Out-of-order ingestion (event log index ≠ causal order)
- Broken event sequencing (missing intermediate events)
- Cross-chain DELTA reference (ancestor in different `causal_chain_id`)

### Detection
```
Validator V12.4 — Orphan DELTA Detection:

  for each event where compression.strategy == "delta":
      if resolve_event(event.ancestor_event_id) is null:
          → FATAL: "Orphan DELTA"

  if ancestor.causality.causal_chain_id != event.causality.causal_chain_id:
      → FATAL: "Cross-chain DELTA"
```

### Enforcement
```
HARD RULE: DELTA is never valid unless ancestor_event_id resolves in:
  - Same causal_chain_id
  - Same domain scope
  - Prior position in the event log

  No search-based ancestor resolution — ancestor_event_id is explicit.
  No cross-chain DELTA stitching.
```

### Conformance Gate
```
assert delta.ancestor_event_id resolves to FULL ancestor in same chain
assert no orphans: for every DELTA, trace ancestor chain to a FULL
```

---

## 8. Alias Cycle Explosion

### Symptom
Rehydration enters infinite loop. Alias resolution never terminates. Stack overflow in collapse phase.

### Root Cause
Circular alias relationships. Event A's `alias_keys` points to B, B's points to C, C's points back to A. The collapse engine enters an infinite traversal.

### Detection
```
Validator V12.5 — ALIAS Cycle Detection:

  visited = set()
  current = event.identity.entity_key
  while current in alias_index:
      if current in visited:
          → FATAL: "ALIAS cycle detected"
      visited.add(current)
      current = alias_index[current].entity_key
```

### Enforcement
```
HARD RULE: Alias graph must be a DAG.

  - Every alias relationship has exactly one target (target.entity_key)
  - Targets MUST exist in the CER log (no dangling alias targets)
  - Cycles are rejected at write time (not at read time)
  - ALIAS compression events that introduce a cycle are rejected by the CER pipeline
```

### Conformance Gate
```
assert has_topological_order(alias_graph)  // alias graph is a DAG
assert no_cycles(alias_graph)              // no directed cycles
assert all_targets_exist(alias_graph)      // no dangling references
```

---

## 9. Version Skew (SUBTLE BUT DEADLY)

### Symptom
Snapshots fail validation only under certain deployments. Replay works on one host, fails on another.

### Root Cause
Mismatch between `CCNF_version`, `collapse_engine_version`, and `rehydration_version` across write path, read path, and snapshot engine. The triple-version lock is not enforced at the integration boundary.

### Detection
```
snapshot.validation.ccnf_version != current_ccnf_version
snapshot.validation.collapse_engine_version != current_collapse_engine_version
snapshot.validation.rehydration_version != current_rehydration_version
```

### Enforcement
```
HARD RULE: Triple-version lock must be identical across:

  - Write path (CER pipeline)
  - Read path (rehydration + replay)
  - Snapshot engine (async compression)

  No partial matching. All three must match exactly.
  If any version differs → snapshot is invalid and MUST be regenerated.
```

### Conformance Gate
```
assert write_path.versions == read_path.versions == snapshot_engine.versions
assert snapshot.validation.triple_version == (ccnf_v, collapse_v, rehydration_v)
assert no_partial_matching: if any version differs → invalid
```

---

## 10. Causal Index Incompleteness (STRUCTURAL FAILURE)

### Symptom
Anti-collapse guard (Rule 4) cannot be evaluated. Merge decisions become undefined. The system cannot determine whether two entities have downstream dependents.

### Root Cause
Missing or partial causal dependency graph. The index was not written, was truncated, or was not reconstructed after recovery.

### Detection
```
Validator V12.3 — Anti-Collapse Guard Integrity:

  if index does not exist:
      → WARN: "Causal dependency index missing — anti-collapse guard unenforceable"
```

### Enforcement
```
HARD RULE: Causal dependency index is a MANDATORY write-time artifact.

  - Updated synchronously with each CER event append
  - Without it, no event in that causal chain is considered valid
  - The index IS regenerable from the CER log (via replay), but this
    MUST happen before any collapse decisions are made for that chain
```

### Conformance Gate
```
assert dependency_index.exists_for(causal_chain_id)  // index must exist
assert dependency_index.is_consistent_with(cer_log)  // index matches actual event graph
```

---

## SYSTEM-WIDE SUMMARY

### Two Layers of Correctness

| Layer | Covers | Achieved |
|---|---|---|
| **Layer 1 — SPEC CORRECTNESS** | CCNF, CER, replay, snapshot semantics | Yes — all documents complete |
| **Layer 2 — IMPLEMENTATION CORRECTNESS** | Serialization, identity, delta, alias, version alignment, purity | This document — enforceable via golden vectors |

### Failure Mode Severity

| Severity | Failure Modes | Action |
|---|---|---|
| CRITICAL | Serialization Drift, Identity Instability, Delta Breakage | Abort write path immediately on detection |
| SUBTLE BUT DEADLY | Version Skew | Enforce triple-version lock at every integration boundary |
| REPLAY BREAKER | Hidden State Leakage | Pure function enforcement + long-sequence replay tests |
| SILENT SPEC VIOLATION | CCNF Partial Execution | Mandatory gate with signature verification |
| STRUCTURAL FAILURE | Causal Index Incompleteness | Mandatory write-time artifact |
| RECOVERABLE | Numeric Drift, Unicode Drift | Normalized at CCNF ingress, caught by golden vectors |
| FATAL | Alias Cycle Explosion | Rejected at write time by DAG enforcement |

### Final Invariant

```
If all 10 failure modes are structurally prevented:

  correctness is not computed — it is enforced structurally

  invalid states cannot exist
  not just "detected later"
  but prevented at construction time
```

### Enforcement Location Summary

| Failure Mode | Detected By | Enforced At |
|---|---|---|
| Serialization Drift | Golden vector mismatch | Single canonical serializer |
| CCNF Partial Execution | Missing ccnf_version/signature | Pipeline ingress gate |
| Identity Instability | Cross-host entity_key mismatch | Pure function over static fields only |
| Hidden State Leakage | Late replay divergence | Pure function with explicit inputs |
| Numeric Canonicalization | Hash mismatch on numeric values | Fixed numeric rules |
| Unicode Drift | Hash mismatch on string values | NFC normalization at ingress |
| Delta Breakage | Orphan DELTA detection | V12.4 validator rule |
| Alias Cycle | Cycle detection in alias graph | V12.5 validator rule |
| Version Skew | Triple-version lock mismatch | Integration boundary enforcement |
| Causal Index | Missing index warning | V12.3 + mandatory index rule |
