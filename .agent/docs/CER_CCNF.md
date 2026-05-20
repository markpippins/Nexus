# CER Canonical Normalization Function (CCNF) v1

## 0. Purpose

CCNF defines a deterministic transformation from raw event input into a canonical CER payload with stable identity and cryptographic hash. It guarantees:

- **Deterministic identity**: identical inputs always produce identical `entity_key`
- **Replay stability**: same CER stream rehydrated at any time produces identical reconstructed state
- **Distributed consistency**: no runtime dependency on external state, host, or environment
- **Collapse safety**: semantic collapse operates on a stable identity foundation
- **Version isolation**: CCNF version changes create completely disjoint identity spaces

## 1. CCNF Pipeline (formal)

```
RAW INPUT
  ↓
1. Structural Parsing
  ↓
2. Field Canonicalization
  ↓
3. Identity Derivation
  ↓
4. Intent Normalization
  ↓
5. Artifact Resolution
  ↓
6. Delta Construction (artifact-scoped)
  ↓
7. Serialization Normalization
  ↓
8. Hash + Signature
  ↓
CER EVENT
```

## 2. Step 1 — Structural Parsing

All inputs are converted into a strict intermediate schema:

```json
{
  "actor": {},
  "intent": {},
  "payload": {},
  "context": {},
  "raw": {}
}
```

**Rules:**
- No optional fields at this stage. Missing values = explicit `null`.
- Unknown fields MUST go into `raw.unknown` as a structured array.
- Type coercion is NOT permitted at this stage — all type mismatches raise parse failure.
- The parser MUST reject input that cannot be mapped to this schema.

### 2.1 Intermediate Schema Types

```
actor       → {type: string|null, id: string|null, session_id: string|null}
intent      → {action: string|null, target_type: string|null, target_id: string|null}
payload     → object|null
context     → object|null
raw         → {unknown: [ {field, value} ]}
```

## 3. Step 2 — Field Canonicalization

This is where determinism is enforced. After this step, all variation caused by formatting, encoding, or representation is eliminated.

### 3.1 Key Ordering

All JSON objects are sorted by lexicographic key order in UTF-8 binary order. No exceptions. This applies recursively to all nested objects.

### 3.2 Type Normalization

| Input Type | Canonical Form |
|---|---|
| `int` / `float` | JSON number (fixed-point representation; no exponent unless required by precision) |
| `bool` | `true` / `false` (lowercase) |
| `null` | explicit `null` (never omitted) |
| `string` | UTF-8 NFC normalized (see §3.3) |
| `array` | sorted or preserved per §3.4 |
| `object` | lexicographic key order |

### 3.3 String Normalization

All strings MUST:
- Be Unicode NFC normalized
- Trim leading and trailing whitespace
- Collapse internal repeated whitespace to single space (U+0020)
- Preserve case — NO case folding at this stage

### 3.4 Array Ordering

Arrays are sorted lexicographically by element value UNLESS they carry the semantic annotation `ordered: true` (e.g., `parent_event_ids` in causality). Sorted arrays use element-order comparison.

### 3.5 Timestamp Normalization

All timestamps MUST:
- Be epoch seconds (int64)
- Carry no timezone
- Use UTC epoch reference
- ISO-8601 strings are NOT permitted in canonical form

## 4. Step 3 — Identity Derivation

This is where collapse foundation begins. Identity is derived from the canonical entity signature — the stable essence of what the event *is*, excluding runtime variation.

### 4.1 entity_key

```
entity_key = SHA256(canonical_entity_signature)
```

The `canonical_entity_signature` includes only:

```json
{
  "type": "node | event | artifact | rule | graph",
  "normalized_name": "deterministic string",
  "scope": "executiongraph.v2 | specification | system",
  "artifact_refs": ["type:id", ...],
  "static_attributes": {}
}
```

**RULES:**
- NO runtime state included (no lifecycle_state, no timestamps, no host info)
- NO timestamps included (temporal data is in the event, not in the identity)
- NO ordering-sensitive data included (no causal chain position, no event index)
- NO session-specific data (session_id, host_id, lease_id)

### 4.2 collapse_key

```
collapse_key = stable_human_semantic_identifier
```

**Rules:**
- Lowercased
- Dot-separated namespace
- No punctuation noise (underscores, special chars → dots or omitted)
- Domain-scoped to prevent cross-domain collision

**Example:**
```
executiongraph.validator.rule.s1
specification.prompt.abc123
system.host.host-1
```

### 4.3 alias_keys

- Purely historical / referential
- NEVER used in hashing
- NEVER used in identity generation
- Used only during read-time semantic collapse for resolution

## 5. Step 4 — Intent Normalization

Intent is reduced to a controlled vocabulary. No free-text intent is permitted in canonical CER. Everything else goes into `payload`.

### 5.1 Controlled Vocabulary

```
action      ∈ {create, update, delete, execute, validate, emit}
target_type ∈ {node, edge, graph, state, artifact}
target_id   → resolved artifact reference
```

### 5.2 Rejection Rule

If `raw.intent` cannot be mapped to the controlled vocabulary, the event MUST be rejected with `INTENT_NORMALIZATION_FAILURE`. This is a CCNF-level failure, not a CER pipeline fallback.

## 6. Step 5 — Artifact Resolution

All references must be resolved to `type:id` pairs. No symbolic references, indirect pointers, or runtime lookup dependencies are permitted.

### 6.1 Resolution Rules

| Form | Status |
|---|---|
| `node:abc-123` | ✔ valid |
| `graph:EX-001` | ✔ valid |
| `"current_node"` | ✗ REJECT — symbolic |
| `state.lifecycle` | ✗ REJECT — indirect |
| `$ref: runtime_var` | ✗ REJECT — dynamic |

### 6.2 artifact_refs Structure

```
artifact_refs: ["type:id", ...]
```

Each entry is a string in the form `type:id`. The full set of types is defined by the domain ontology (nodes, edges, graphs, states, artifacts, rules).

## 7. Step 6 — Artifact-Scoped state_delta

state_delta is computed per artifact only. It MUST NOT reference global state.

### 7.1 Definition

For each artifact in `artifact_refs`:

```
state_delta[i] = apply(prev_state[artifact], patch[i]) → new_state[artifact]
```

### 7.2 Schema

```json
{
  "artifact_id": "type:id",
  "before_hash": "SHA256 of prior canonical state | null",
  "after_hash": "SHA256 of new canonical state",
  "patch": {}
}
```

### 7.3 Constraints

- `before_hash` is `null` for creation events (FULL strategy).
- `patch` MUST be computable from `artifact_refs` only. No external state.
- `patch` uses RFC 6902 JSON Patch semantics or equivalent deterministic diff.
- Cross-artifact effects produce multiple `state_delta` entries, not one combined entry.

### 7.4 Invalid Forms

```
❌ state_delta with no artifact_id
❌ state_delta referencing artifacts not in artifact_refs
❌ state_delta.patch requiring external state to apply
❌ before_hash ≠ SHA256(actual prior state) → misalignment detected at replay
```

## 8. Step 7 — Serialization Normalization

This step produces the canonical byte string used for hashing. It is the most important step for hash stability.

### 8.1 Fixed Field Order

CER serialization order is FIXED and MUST NOT vary:

```
event_id
event_version
ccnf_version
system
domain
timestamp
actor
intent
identity
causality
artifact_refs
state_delta
payload
compression
signature
```

### 8.2 No Optional Field Omission

Every field MUST appear. If the value is missing, it MUST be represented as:
- `null` for nullable fields
- `[]` for array fields
- `{}` for object fields

### 8.3 Array Ordering Rule

Arrays are sorted lexicographically UNLESS:
- They are explicitly `ordered: true` (e.g., `parent_event_ids`, `causal_chain_id` prefix)
- They are `state_delta` — ordered by `artifact_id` lexicographically

### 8.4 Canonical JSON Serialization

- No whitespace (compact form)
- No trailing newline
- UTF-8 encoding
- No escape sequences beyond those required by JSON spec

## 9. Step 8 — Hash + Signature

### 9.1 Canonical Hash Input

```
SHA256(serialized_CER_string)
```

Where `serialized_CER_string` is:
- UTF-8 encoded
- Deterministic JSON serialization (Step 7 rules)
- No whitespace variance permitted

### 9.2 Signature

```json
{
  "hash": "SHA256 hex string",
  "signed_by": "optional-key-id | null"
}
```

### 9.3 Verification Invariant

```
∀ host, environment:
    CCNF(raw) == CCNF(raw)   // bitwise identical CER output
```

## 10. Full CCNF Function

```
function CCNF(raw_event, ccnf_version=1):
    1. e0  = structural_parse(raw_event)
    2. e1  = canonicalize_fields(e0)
    3. e2  = derive_identity(e1)
    4. e3  = normalize_intent(e2)
    5. e4  = resolve_artifacts(e3)
    6. e5  = compute_state_delta(e4, artifact_refs_only)
    7. e6  = serialize_deterministically(e5, ccnf_version)
    8. h   = SHA256(e6)
    9. return CER(e6, hash=h, ccnf_version=ccnf_version)
```

The function is:
- **Pure**: no I/O, no side effects, no external state
- **Total**: defined for all valid inputs; invalid inputs raise typed errors
- **Idempotent**: `CCNF(CCNF(raw)) == CCNF(raw)` for already-canonical CER input
- **Cross-host identical**: any two implementations produce bitwise-identical output for identical input

### I8 — CCNF Determinism

```
∀ host A, host B, raw input R:
    CCNF_A(R) == CCNF_B(R)   // bitwise identical CER events across all hosts
    entity_key_CCNF_A(R) == entity_key_CCNF_B(R)  // identical identity derivation
```

CCNF determinism is the foundation of replay stability, distributed consistency, and collapse safety. A non-deterministic CCNF breaks the entire system.

## 11. Identity Epoch Invariant (I11)

### 11.1 Definition

```
entity_key validity is scoped to CCNF version.
Cross-version comparison is invalid unless explicitly migrated.
```

CCNF v1 and CCNF v2 produce completely incompatible identity spaces. There is no "partial compatibility" or "backwards compatible" mode for identity.

### 11.2 Rationale

Identity systems cannot be partially compatible without drift. A `node:abc` under CCNF v1 and CCNF v2 may have different `canonical_entity_signature` inputs (e.g., new fields in `static_attributes`, different `scope` format), producing different `entity_key` values. Treating them as comparable creates undetectable semantic drift.

### 11.3 Migration Rule

Cross-CCNF-version migration REQUIRES:
1. Explicit mapping table from `(old_entity_key, old_version) → (new_entity_key, new_version)`
2. Both identity spaces coexist during migration window
3. No silent cross-version operation

## 12. Version Anchoring

Every CER implicitly carries `ccnf_version` as part of its canonical structure. It is the first version anchor in the triple-version lock:

```
snapshot validity:
  CCNF_version AND collapse_engine_version AND rehydration_version match exactly
```

## 13. What This Guarantees

| Property | Mechanism |
|---|---|
| Deterministic identity | `entity_key = SHA256(canonical_entity_signature)` — excludes runtime/temporal data |
| Replay stability | Same canonical byte string → same hash → same identity → same replay fold |
| Distributed consistency | CCNF has no host-specific, time-specific, or environment-specific inputs |
| Collapse safety | Identity is stable; semantic collapse operates on known entity_key space |
| Version isolation | CCNF version change = complete identity space break; no silent drift |

## 14. Error Model

| Error | Cause | Handling |
|---|---|---|
| `PARSE_FAILURE` | Raw input cannot be mapped to intermediate schema | Reject event, report to emitter |
| `TYPE_MISMATCH` | Field value does not match expected canonical type | Reject event |
| `INTENT_NORMALIZATION_FAILURE` | Intent cannot be reduced to controlled vocabulary | Reject event |
| `ARTIFACT_RESOLUTION_FAILURE` | Reference is symbolic, indirect, or dynamic | Reject event |
| `DELTA_SCOPE_VIOLATION` | state_delta references artifacts outside artifact_refs | Reject event |
| `CCNF_VERSION_MISMATCH` | Input carries different ccnf_version than engine | Reject event |

All CCNF errors are **hard failures**. The CER pipeline must not fall back, coerce, or silently correct.
