# CANONICAL GRAPH STATE ENCODING (version 1)

## Abstract

This document defines the canonical serialization contract for `GraphState`
hashes. Both the Python `GraphState.compute_hash()` and the Rust CCNF verifier
MUST produce identical SHA256 output for the same structural input.

## Responsibility

| Side       | Component                                  | Purpose                         |
| ---------- | ------------------------------------------ | ------------------------------- |
| Python     | `GraphState.ccnf_canonical_json()`        | Canonical JSON serialization    |
| Python     | `GraphState.ccnf_hash()`                   | SHA256 over canonical JSON      |
| Rust       | `ccnf-verifier --stdin`                    | SHA256 over canonical JSON      |

## Encoding Rules

### Rule 1: Sort keys
Object keys MUST be sorted lexicographically (UTF-8 byte order) before
serialization.

### Rule 2: No spaces, newlines, or trailing commas
Compact JSON: `separators=(",", ":")`. No trailing commas. No extra whitespace.

### Rule 3: UTF-8 encoding
All strings encoded as valid UTF-8. SHA256 operates on UTF-8 bytes.

### Rule 4: No scientific notation
Numbers MUST NOT use scientific notation. Integers serialized as integers,
floats as compact float without trailing zeros (e.g., `3.14`, not `3.140`).

## Canonical Structure

```
Input:  GraphState { nodes: Map<ID, Properties>, edges: Map<ID, Properties> }

Encoding:
  1. Sort nodes by ID (lexicographic, UTF-8)
  2. Sort edges by ID (lexicographic, UTF-8)
  3. For each node/edge, serialize properties with sorted keys
  4. Produce canonical JSON: {"nodes": {...}, "edges": {...}}
  5. SHA256 over UTF-8 bytes of canonical JSON

Both Python and Rust MUST produce identical bytes before hashing.
```

## Version Control

This is version 1 of the canonical encoding. Any change to the encoding format
MUST increment the version number and update this document before changing code.

## Compliance Test

```bash
# Python produces canonical JSON and hash
python3 -c "
from graph_models import GraphState
s = GraphState(nodes={'n1': {'type': 'concept'}}, edges={})
print(s.ccnf_canonical_json())
print(s.ccnf_hash())
"

# Rust verifier accepts same JSON and produces matching hash
echo '{"edges":{},"nodes":{"n1":{"type":"concept"}}}' | cargo run --release -- --stdin
# Expected: ccnf_hash:<same-hex-string>
```

## Invariant

```
Python-SHA256(GraphState) = Rust-SHA256(CCNF-canonical-JSON)
```

When this holds:
- Python structural layer is formally equivalent to Rust canonical truth
- Semantic experimentation (projection layer) is safe — cannot corrupt canonical state
- Silent divergence from Rust truth model is impossible
