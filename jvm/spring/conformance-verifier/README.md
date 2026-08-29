# Conformance Verifier (W2.04)

An **independently executable JVM verifier** for the W1.09 governance-envelope
replay fixtures. It consumes the same static corpus the Python reference uses
and independently re-derives the W1.04 canonical serialization, evaluation
fingerprints, replay verdicts, and the intentional-drift taxonomy — with
**zero shared code** with the Python reference implementation.

## Why

W1.09 / W1.11 established the governance admission envelope as the **replay
authority**: identical captured inputs must reproduce identical verdicts and
fingerprints across runtimes. This module proves the JVM half of that contract
and is deliberately a clean-room port so a bug in one runtime cannot hide a
bug in the other.

## Contract surface

### Inputs

| Input | Location (repo-relative) | Role |
|---|---|---|
| Replay fixtures `F01..F07` | `python/governance-envelope/replay_fixtures/*.json` | Static captured-input corpus; each attempt carries a full envelope + embedded law/contract registry |
| Agreement manifest | `python/governance-envelope/jvm/expected-digests.json` | Python-emitted bytes: per-vector `evaluation_fingerprint` + `canonical_payload_sha256` |

The verifier reads these **from the Python tree** — they are the shared,
version-controlled agreement surface, not copied into this module.

### Output classes (`com.aibizarchitect.nexus.conformance.verifier`)

| Class | Contract |
|---|---|
| `Canonicalizer` | W1.04 §2 normalization: UUID→8-4-4-4-12, timestamps→RFC3339·6-fp-Z (fail closed on naive), IRIs→RFC3986 §6.2.2, canonical decimals, NFC/BOM/Cf string cleanup, set-ordered array sorting |
| `CanonicalJson` | Compact key-sorted JSON writer with Python `json.dumps(separators, sort_keys, ensure_ascii=False)` byte parity |
| `Fingerprints` | `sha256:` + hex over canonical JSON of the envelope **minus its fingerprint group** (§3.1) |
| `Replayer` | Replay verdicts (`replay_ok`, `stale_doctrine`, `drift_confirmed`, `duplicate_retry`, `fingerprint_mismatch`), as-of law resolution, drift taxonomy |
| `JsonParser` | Strict dependency-free parser with duplicate-key fail-closed semantics |

### Fingerprint schema

```
fingerprint = "sha256:" + hex(SHA-256(canonical_json(envelope minus its own fingerprint group)))
```

see `nexus/docs/governance-envelope-serialization.md` §3 for the full rules.

## Invoke

Build + test (all checks green required):

```bash
mvn -B -f jvm/pom.xml -pl spring/conformance-verifier test
```

Run the standalone verifier (vector parity + verdicts + drift matrix, exit 0/2):

```bash
# from repo root
java -cp jvm/spring/conformance-verifier/target/classes \
  com.aibizarchitect.nexus.conformance.verifier.ConformanceVerifier \
  --fixtures python/governance-envelope/replay_fixtures \
  --manifest python/governance-envelope/jvm/expected-digests.json
```

The backend CI workflow runs the verifier on every PR/push and uploads its
Surefire reports as the `conformance-verifier-reports` artifact
(`.github/workflows/ci.yml`).

## Guarantees asserted

- All **9 emitted JVM disagreement vectors** verify byte-identically
  (evaluation fingerprint + canonical payload SHA-256).
- All **7 intentional-drift mutations** trigger a classified
  `contract | doctrine | frame | input | evaluator | receipt_lineage` signal.
- Corpus verdicts `F01..F07` match the reference expectations.
- Replay is **deterministic** (double-run identical) and **PURE**: no I/O-capable
  classes are reachable in the verifier package (structural scan).
- Fail-closed canonicalization: relative IRIs, naive timestamps, `NaN`,
  duplicate JSON keys all refuse to produce a fingerprint.

Purity note: the verifier genuinely **cannot** mutate PEB/Conduit state —
everything operates on in-memory maps loaded from static JSON with no network,
no database, and no wall-clock.