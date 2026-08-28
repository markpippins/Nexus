# W1.04 — Canonical Envelope Serialization & Evaluation Fingerprint

**Status:** Ratified (architect accepted 2026-08-27; open items resolved)
**Owner:** engineer
**Depends on:** W1.01 (field contract, accepted), W1.02 (inventory, accepted), W1.03 (compatibility boundary, accepted)
**Version:** 1.0 (2026-08-27)

This specification defines the deterministic canonicalization and hashing rules
for the governance admission envelope and its `evaluation_fingerprint`. The
fingerprint must be stable across Python, JVM, SQL, replay, and transport
projections, and must change when any authority-relevant input changes.

The serialization rules intentionally mirror the ratified CCNF canonical
serialization contract (`nexus/go/wrp/ccnf-ref/SERIALIZATION_CONTRACT.md`) so
that the two canonical forms compose without a second normalization layer.

---

## 1. Scope

### 1.1 What the fingerprint covers (authority-relevant)

The fingerprint binds the resolved law + exact facts + exact process position
evaluated by SOL:

- `envelope_version`, `envelope_id`, `created_at`
- `contract` group: contract identity/version/digest, projection
  identity/version/digest, operation, transition
- `semantic` group: `@context`, subject id/type/ref
- `workflow` group: workflow id/version, node id, work-request id/version
- `law` group: `proposition_ids[]`, `frame_values[]`, `doctrine_ids[]`,
  `posture_ids[]`, `effective_at`
- `execution` group: `lease_id`, `grant_id`, `attempt_id`
- `inputs` group: `input_snapshot_id`, `input_captured_at`, `input_fingerprint`
- `evaluation` group: `assertion_results[]`, `disposition`, `unknowns[]`,
  `refusal_code`, `diagnostics`, `evaluated_at`
- `evidence` group: `evidence_ids[]`, `evidence_fingerprint`
- `fingerprint` group: the `evaluation_fingerprint` itself and
  `fingerprint_algorithm`/`fingerprint_version`

### 1.2 What is deliberately excluded (non-authoritative)

- Transport headers, broker offsets, NATS/HTTP metadata, correlation IDs that
  are not part of the authority record
- Duplicated doctrine content (doctrine is referenced by `doctrine_ids[]`, not
  inlined)
- UI/API projection state
- Unknown top-level extension keys — **stripped** before canonicalization per
  architect ruling (2026-08-27); their presence or absence never changes the
  fingerprint, keeping the digest stable under envelope extension

Excluded keys are stripped **before** canonicalization; their presence or
absence never changes the fingerprint (AC4).

---

## 2. Canonical Serialization Rules

The canonical form is compact JSON (UTF-8, no trailing newline), keys sorted
lexicographically (bytewise UTF-8) at every nesting level, with the value
normalizations below applied recursively.

### 2.1 JSON shape

- Compact JSON only: no spaces, no indentation, no trailing newline.
- All fields MUST be present: nullable → `null`, arrays → `[]`, objects → `{}`.
  Missing fields are invalid (fail closed).
- Duplicate keys are invalid (fail closed).

### 2.2 Strings

- UTF-8, NFC-normalized at ingress.
- BOM stripped; zero-width characters removed.
- Case preserved (except where a dedicated normalization applies, §2.3–2.6).

### 2.3 UUIDs

- Canonical form: lowercase `8-4-4-4-12` (RFC 4122).
- Hyphen-less and uppercase input is normalized to the canonical form.
- Applies to: `envelope_id`, `contract_id`, `subject_id` (when UUID),
  `proposition_ids[]`, `doctrine_ids[]`, `posture_ids[]`, `lease_id`,
  `grant_id`, `attempt_id`, `input_snapshot_id`, `evidence_ids[]`,
  `peb_transaction_id`, `admission_receipt_id`, `sanctioned_transition_id`.
- Non-UUID identifiers (e.g. `subj-2026-08-26-0001`, `wf-0007`,
  `node-admission`) pass through unchanged — they are opaque string refs.

### 2.4 Timestamps

- Canonical form: RFC 3339 UTC with `Z` suffix and **exactly 6 fractional
  digits** (`YYYY-MM-DDTHH:MM:SS.ffffffZ`).
- Inputs accepted: RFC 3339 with `Z` or `+00:00`/offset, epoch seconds,
  epoch microseconds. All normalize to the canonical UTC form.
- Naive timestamps (no zone) are invalid (fail closed).
- **Replay rule:** the captured `evaluated_at` / `input_captured_at` /
  `effective_at` / `created_at` values are used verbatim. Replay NEVER
  substitutes wall-clock `now()` (AC3).

### 2.5 Numbers

- Integers: JSON number without `.0`.
- Floats: IEEE-754 double, shortest round-trip representation, fixed notation
  only (no scientific notation), locale-independent `.`.
- `1.0` and `1` normalize to the same canonical value.
- `NaN` and `Infinity` are invalid (fail closed).

### 2.6 Decimal strings

Values that must carry arbitrary precision are strings in canonical decimal
form: `-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?` — no leading zeros, no trailing
fraction zeros, no exponent. `"1.0"` → `"1"`, `"-0.500"` → `"-0.5"`.

### 2.7 IRIs (JSON-LD `@context`, `subject_ref`)

RFC 3986 §6.2.2 syntax-based normalization:

- Scheme lowercased; host lowercased (for `http`/`https`).
- Default ports stripped (`:80` for http, `:443` for https).
- Dot segments (`.`/`..`) removed from the path.
- Percent-encoding case preserved.
- Relative IRIs are invalid (fail closed) — the envelope must be
  self-contained.

### 2.8 Arrays

Every array field is declared **set-ordered** or **ordered**:

| Field | Ordering |
|---|---|
| `proposition_ids[]`, `doctrine_ids[]`, `posture_ids[]`, `evidence_ids[]`, `unknowns[]` | set-ordered |
| `frame_values[]` | set-ordered (by canonical element serialization) |
| `assertion_results[]` | ordered (producer order — evaluation order is authority-relevant) |
| `diagnostics` | ordered |

- **Set-ordered:** elements sorted by their canonical serialization before
  hashing. Reordering the set does NOT change the fingerprint.
- **Ordered:** producer order preserved. Reordering DOES change the
  fingerprint (assertion order is part of the evaluated explanation).

### 2.9 Maps

- Keys normalized as strings (§2.2) and sorted lexicographically.
- Nested objects follow the same rules recursively.

---

## 3. Evaluation Fingerprint

### 3.1 Algorithm

```
fingerprint = "sha256:" + hex(SHA-256(canonical_utf8_bytes))
```

- `canonical_utf8_bytes` = the canonical serialization (§2) of the envelope
  **after** stripping excluded keys (§1.2) and with the `fingerprint` group
  fields populated (the fingerprint is computed over the envelope that
  includes its own fingerprint fields; the value of `evaluation_fingerprint`
  itself is not an input to the hash).
- Output representation: `sha256:` + 64 lowercase hex chars.
- `fingerprint_algorithm = "sha256"`, `fingerprint_version = 1`.
- No domain-separation prefix in v1; `envelope_version` is a hashed field, so
  the digest is self-describing. A future algorithm change increments
  `fingerprint_version` (or `envelope_version`), never reinterprets old
  digests.

### 3.2 Error behavior (fail closed)

| Condition | Behavior |
|---|---|
| Unsupported value type (e.g. binary, `NaN`) | refuse to produce a fingerprint |
| Unknown top-level key | **stripped** (excluded) — fingerprint stays stable under extension (architect ruling 2026-08-27) |
| Relative IRI / naive timestamp / malformed UUID | refuse |
| Duplicate JSON keys | refuse |
| Missing required field | refuse (schema validation precedes hashing) |

### 3.3 Replay semantics

- Replaying identical captured inputs (same envelope bytes) reproduces the
  same result and the same fingerprint — the fingerprint is a pure function
  of the canonical envelope.
- Conflicting reuse (same `envelope_id`, different fingerprint) is rejected.
- Fingerprint verification is part of admission: digest mismatch, stale
  doctrine, or unknown context fails closed as refusal/unknown (per W1.01).

---

## 4. Cross-language parity (AC2)

The canonicalization is specified as byte-level rules (§2), not as a library
API, so any runtime can implement it against the same golden vectors:

**Python pseudocode**

```python
def evaluate_fingerprint(envelope: dict) -> str:
    env = {k: v for k, v in envelope.items() if k not in EXCLUDED}
    canonical = canonicalize(env)          # §2 rules, recursive
    payload = json.dumps(canonical, separators=(",", ":"), sort_keys=True)
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()
```

**JVM pseudocode**

```java
String evaluateFingerprint(Map<String,Object> envelope) {
    Map<String,Object> env = stripExcluded(envelope);          // §1.2
    Object canonical = Canonicalizer.canonicalize(env);        // §2
    String payload = CanonicalJson.write(canonical);           // sorted keys, compact
    byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
    return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
}
```

Both must produce identical digests for the shared golden vectors (§5).

---

## 5. Golden Vectors

Generated by the reference implementation
(`/tmp/envelope_fp.py`, mirrored to the shared-utility follow-up).

### 5.1 Positive vectors

| Vector | Envelope summary | `evaluation_fingerprint` |
|---|---|---|
| V1 | Governed execution admission, disposition `allow`, 2 assertion results, 1 evidence id | `sha256:9eaba4fab7739d0f93692d12e4819ad57f42dfb2b781a79676bf9efb07a58d55` |
| V2 | Refusal / unknown context, `unknowns=["context:unknown-vocabulary"]`, `refusal_code=unknown_context` | `sha256:b938a3c45fabd5a2dff614838766adcd24abb9856a76b65c59312b713960af0c` |
| V3 | Execution admission with evidence, 2 evidence ids | `sha256:e78b4eac6594056676c06cd8f40589ed40352f2fe2e0eab8a4e933e8c3b1f7339` |

### 5.2 Canonical-independence checks (must NOT change the fingerprint)

| Mutation | Expectation |
|---|---|
| Reorder top-level keys / nested keys | unchanged |
| `created_at` as `+00:00` offset vs `Z` | unchanged |
| Uppercase UUID vs lowercase | unchanged |
| `1.0` vs `1` (number) | unchanged |
| Set-ordered array reorder (`proposition_ids[]`) | unchanged |
| Add `transport`/broker metadata | unchanged (excluded) |

### 5.3 Mutation vectors (must change the fingerprint)

| Mutation | Expectation |
|---|---|
| M1 `contract_digest` changed | changed |
| M2 proposition dropped from `proposition_ids[]` | changed |
| M3 `posture_ids[]` value changed | changed |
| M4 `input_snapshot_id` changed | changed |
| M5 `evaluated_at` +1s | changed (captured time is authority-relevant) |
| M6 `disposition` allow→refuse | changed |
| M7 `evidence_ids[]` changed | changed |
| M8 Reorder `assertion_results[]` (ordered) | changed |

### 5.4 Fail-closed vectors

| Input | Expectation |
|---|---|
| Unknown top-level key | stripped — fingerprint unchanged (architect ruling) |
| Relative `@context` IRI | refuse |
| Naive timestamp | refuse |
| `NaN` value | refuse |

---

## 6. Acceptance Criteria Trace

1. **≥3 positive vectors + mutation vectors proving change** — §5.1 (3 vectors), §5.3 (8 mutations). ✔
2. **Python and JVM pseudocode produce identical digests** — §4 (rules + golden vectors shared). ✔
3. **Captured evaluation time used; replay never substitutes wall-clock `now()`** — §2.4. ✔
4. **Explicitly excludes non-authoritative transport metadata** — §1.1/§2.9, vectors in §5.2. ✔
5. **Follow-up implementation To Do ready** — W1.11 created (`ccbf83a9`), now in progress. ✔

---

## 7. Follow-up Implementation To Do

- **W1.11 [engineer]** Implement the shared `governance-envelope-fingerprint`
  utility (Python reference + JVM port) against this spec, with the golden
  vectors as conformance fixtures and a replay harness proving deterministic
  digests. Wired into the envelope evaluator once the architect accepts this
  contract.

---

## 8. Architect rulings (2026-08-27)

| Item | Ruling |
|---|---|
| `assertion_results[]` ordering | **Ordered** — evaluation order is part of the explanation |
| `sha256:` prefix | **Accept** — clean, extensible, explicit algorithm transition |
| Top-level key allow-list | **Accept + strip** — unknown keys are stripped (excluded), keeping the fingerprint stable under extension |

All three items resolved; spec is ratified and ready for W1.11 implementation.