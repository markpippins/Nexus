> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# CCNF Conformance Test Specification

## 0. Purpose

This document defines the formal test specification for the CER Canonical Normalization Function (CCNF). Each test vector maps to one or more CCNF steps and validates specific invariants.

## 1. Vector Mapping

### 1.1 Core Determinism (I8)

| Vector | Validates |
|---|---|
| `001-simple-node-creation` | Full CCNF pipeline, all 8 steps. All fields populated |
| `002-simple-delta-event` | Delta compression, artifact-scoped state_delta |
| `003-state-mutation` | state_delta with before_hash and patch |
| `004-cross-host-determinism` | Same input → bitwise identical CER. Two different input representations with same semantic meaning |

### 1.2 Field Canonicalization (CCNF Step 2)

| Vector | Validates |
|---|---|
| `005-key-ordering` | Lexicographic key order. Input with reversed key order must produce same output |
| `006-key-ordering-nested` | Recursive lexicographic ordering on nested objects |
| `007-type-normalization-bool` | `True`/`true`/`TRUE` → `true`; `False` → `false` |
| `008-type-normalization-null` | Missing field → explicit `null`; `null` retained |
| `009-string-normalization-nfc` | Unicode NFC normalization. Pre-composed vs decomposed forms |
| `010-string-normalization-whitespace` | Trim leading/trailing whitespace. Collapse internal whitespace |
| `011-timestamp-normalization` | ISO-8601 timestamp → epoch seconds (int64) |
| `012-array-ordering` | Sorted vs ordered arrays. `parent_event_ids` preserved order; other arrays sorted |

### 1.3 Identity Derivation (CCNF Step 3)

| Vector | Validates |
|---|---|
| `013-entity-key-excludes-runtime` | No runtime state in entity_key |
| `014-entity-key-excludes-timestamp` | No timestamps in entity_key |
| `015-entity-key-deterministic` | Same canonical entity signature → same entity_key |
| `016-entity-key-changes-on-scope` | Different scope → different entity_key |
| `017-collapse-key-derivation` | collapse_key is lowercased dot-separated identifier |
| `018-no-identity-collision` | Different semantic entities → different entity_key |

### 1.4 Intent Normalization (CCNF Step 4)

| Vector | Validates |
|---|---|
| `019-intent-controlled-vocabulary` | Mappable intent → controlled vocabulary |
| `020-intent-normalization-failure` | Unmappable intent → `INTENT_NORMALIZATION_FAILURE` |

### 1.5 Artifact Resolution (CCNF Step 5)

| Vector | Validates |
|---|---|
| `021-artifact-resolution-valid` | `type:id` references resolved correctly |
| `022-artifact-resolution-failure` | Symbolic references → `ARTIFACT_RESOLUTION_FAILURE` |

### 1.6 Delta Construction (CCNF Step 6)

| Vector | Validates |
|---|---|
| `023-delta-creation-before-hash-null` | `before_hash` is `null` for creation events |
| `024-delta-multiple-artifacts` | Multiple artifact entries in state_delta |
| `025-delta-scope-violation` | state_delta referencing artifact outside artifact_refs → `DELTA_SCOPE_VIOLATION` |

### 1.7 Serialization Normalization (CCNF Step 7)

| Vector | Validates |
|---|---|
| `026-serialization-field-order` | Fixed field order enforced. Any input field order produces same serialized output |
| `027-serialization-no-optional-omission` | All fields present (null/empty for missing). No omission |
| `028-serialization-no-whitespace` | Compact JSON, no trailing newline, no whitespace variance |

### 1.8 Hash + Signature (CCNF Step 8)

| Vector | Validates |
|---|---|
| `029-hash-deterministic` | Same canonical string → same SHA256 |
| `030-hash-changes-on-any-field` | Any field change → different hash |

### 1.9 Identity Epoch (I11)

| Vector | Validates |
|---|---|
| `031-ccnf-version-isolation` | Same input, different ccnf_version → different entity_key |
| `032-ccnf-version-mismatch` | Input with mismatching ccnf_version → `CCNF_VERSION_MISMATCH` |

## 2. Invariant Coverage

| Invariant | Vectors |
|---|---|
| I1 (round-trip) | 001, 002, 003 |
| I2 (no global state) | 023, 024, 025 |
| I3 (identity immutability) | 013, 014, 015, 016 |
| I8 (CCNF determinism) | 001–032 (all) |
| I11 (identity epoch) | 031, 032 |

## 3. Failure Model

All CCNF errors are hard failures. The test suite must verify that:
- Error types match exactly (`INTENT_NORMALIZATION_FAILURE`, `ARTIFACT_RESOLUTION_FAILURE`, `DELTA_SCOPE_VIOLATION`, `CCNF_VERSION_MISMATCH`, `PARSE_FAILURE`, `TYPE_MISMATCH`)
- No fallback, coercion, or silent correction occurs
- Error output is deterministic across all hosts
