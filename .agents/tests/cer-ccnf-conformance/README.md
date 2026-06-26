> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# CER CCNF Conformance Test Suite

## Purpose

This test suite validates that any implementation of the CER Canonical Normalization Function (CCNF) produces **bitwise-identical output** for identical input, across all hosts, environments, and serialization libraries.

CCNF determinism (I8) is the foundation of the entire system. If CCNF is even slightly off — whitespace rules, key ordering, numeric normalization — the downstream system breaks silently: divergent `entity_key` across hosts, broken snapshot verification, collapse mismatch, replay drift.

## Test Vectors

### Structure

```
.agents/tests/cer-ccnf-conformance/
  README.md
  spec/
    CONFORMANCE_SPEC.md     — formal test specification
  vectors/
    v1/                     — CCNF version 1 vectors
      001-*.json
      002-*.json
      ...
    expected-hashes.json    — master hash table for all v1 vectors
```

### Vector Format

Each vector file contains:

| Field | Description |
|---|---|
| `name` | Descriptive name of the test case |
| `ccnf_version` | CCNF version this vector targets |
| `invariants_tested` | List of invariants validated by this vector |
| `input` | Raw event input (pre-CCNF) |
| `expected` | Expected output (CER or error) |

**Success case:**
```json
{
  "name": "node-creation",
  "ccnf_version": 1,
  "invariants_tested": ["I8", "I11"],
  "input": { ... },
  "expected": {
    "cer": { ... full CER output ... },
    "entity_key": "sha256-hex",
    "canonical_hash": "sha256-of-serialized-CER"
  }
}
```

**Error case:**
```json
{
  "name": "intent-normalization-failure",
  "ccnf_version": 1,
  "invariants_tested": ["I8"],
  "input": { ... },
  "expected": {
    "error": "INTENT_NORMALIZATION_FAILURE"
  }
}
```

## Running the Tests

1. Load `vectors/v1/` directory
2. For each vector:
   a. Apply CCNF(v1) to `input`
   b. If `expected.error` is set: assert CCNF raises exactly that error
   c. If `expected.cer` is set: assert every field in `expected.cer` matches output
   d. Assert `output.signature.hash == expected.canonical_hash`
   e. Assert `output.identity.entity_key == expected.entity_key`
3. Verify that the master hash table `expected-hashes.json` is consistent with per-vector hashes

## What Each Vector Validates

See `spec/CONFORMANCE_SPEC.md` for the formal mapping between vectors and invariants.

## Adding Vectors

1. Create a new file in `vectors/v1/` following the vector format
2. Compute `expected.entity_key` via CCNF Step 3 rules
3. Compute `expected.canonical_hash` via CCNF Step 7 + Step 8
4. Add the hash to `expected-hashes.json`
5. Update `spec/CONFORMANCE_SPEC.md` if new invariants are covered
