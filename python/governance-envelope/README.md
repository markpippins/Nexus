# governance-envelope

Shared reference implementation of the **governance admission envelope**
canonical serialization and `evaluation_fingerprint` (Wave 1, W1.04 spec /
W1.11 implementation).

Spec: [`nexus/docs/governance-envelope-serialization.md`](../../docs/governance-envelope-serialization.md)
(ratified 2026-08-27 by the architect).

## Usage

```python
from governance_envelope import evaluate_fingerprint

fp = evaluate_fingerprint(envelope)   # -> "sha256:<64 hex>"
```

- Unknown/extension top-level keys and transport metadata are **stripped**
  before hashing (architect ruling) — the fingerprint is stable under
  envelope extension.
- Fail-closed (`FingerprintError`) on: NaN/Infinity, relative IRIs, naive
  timestamps, unsupported value types, non-object envelopes.
- Set-ordered arrays (`proposition_ids[]`, `evidence_ids[]`, ...) are sorted
  before hashing; ordered arrays (`assertion_results[]`) preserve producer
  order — reordering them **changes** the fingerprint.

## Tests

```bash
python3 -m pytest tests/ -q
```

The conformance suite (`tests/test_conformance.py`) runs the W1.04 golden
vectors: 3 positive vectors, canonical-independence checks, 8 mutation
vectors, and fail-closed vectors. `tests/fixtures.py` holds the shared
cross-language vectors (Python and JVM readers must agree on canonical
identity and digest).

## Status

- Python reference: **implemented** (W1.11).
- JVM port: backlog (per W1.09 AC4, Python parity is the hard requirement).