# W1.09 — Cross-runtime replay fixtures & conformance harness

Proves the governance admission envelope is the **replay authority**: identical
captured inputs reproduce identical verdicts and fingerprints; every
permissible divergence produces an intentionally classified drift signal; the
replay evaluator cannot touch PEB/Conduit state because it performs no I/O at
all.

## Layout

| Path | Role |
|---|---|
| `src/governance_envelope/replay.py` | Pure-function replay: as-of law resolution (supersession-by-insertion), fingerprint round-trip, duplicate-retry semantics, drift taxonomy |
| `replay_fixtures/F01..F07*.json` | Static corpus — each attempt carries the complete envelope (fingerprint group filled per W1.04/W1.05 practice: digest over envelope minus its own fingerprint group), expected disposition + fingerprint, receipt/refusal outcome; each file embeds its own versioned law registry + contract registry so resolution is fully offline |
| `bin/run_replay_conformance.py` | Standalone AC2–AC6 harness (determinism double-run, 7-mutation drift matrix, AST purity scan, JVM-parity manifest emission) |
| `tests/test_replay_conformance.py` | pytest-native coverage of the same guarantees |
| `jvm/expected-digests.json` | Cross-runtime agreement surface: per-vector `evaluation_fingerprint` + `canonical_payload_sha256`, byte-stable across runs |

## Fixture classes

F01 allow-with-receipt · F02 reject · F03 refuse/unknown-context (V2 golden) ·
F04 stale doctrine (cited posture superseded before captured `effective_at`) ·
F05 contract-digest drift · F06 duplicate retry (`duplicate_reuse`) ·
F07 doctrine-version change mid-workflow (attempt 1 still replays_ok under its
own snapshot while attempt 2 receives stale_doctrine).

## Conventions to preserve when editing fixtures

- Envelope timestamps keep the trailing `Z`; embedded **registry**
  timestamps are written WITHOUT it (as-of comparisons are lexicographic on
  canonical RFC3339-minus-Z strings).
- The stored fingerprint must equal `evaluate_fingerprint(envelope minus its
  fingerprint group)` — the harness treats any mismatch as a first-class
  `fingerprint_mismatch` failure rather than auto-fixing.

## Run

```bash
python3 bin/run_replay_conformance.py          # full AC2-AC6 suite
python3 -m pytest -q                           # same guarantees pytest-side
```

AC5 proof shape: an AST import scan over `src/governance_envelope/*.py`
asserts no I/O-capable module root (db drivers, docker, sockets, HTTP,
brokers) is imported anywhere in the package — SOL assessment mutates nothing
because it *can* mutate nothing. Drift categories emitted:
`contract | doctrine | frame | input | evaluator | receipt_lineage`.
