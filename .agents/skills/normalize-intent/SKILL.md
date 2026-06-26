> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
---
name: normalize-intent
phase: control-plane (pre-routing)
status: implemented
---

# normalize-intent v1.0 — Control Plane Intent Normalization Engine

## 1. Purpose

Deterministic control-plane transformation function that converts raw pipeline intent configuration (`PIPELINE_INTENT.yaml`) into a validated, canonical `ExecutionState` used by `mode-router` to select system execution mode.

Enforces:
- schema validity
- semantic consistency
- operational mode determinism
- routing safety guarantees

Does **not** perform domain modeling, requirement generation, or execution planning.

## 2. Position in System Architecture

```
PIPELINE_INTENT.yaml  (or pipeline-mode.json fallback)
        ↓
normalize-intent   (CONTROL PLANE — exclusive owner)
        ↓
ExecutionState (canonical)
        ↓
mode-router (pure router — no YAML, no validation, no derivation)
        ↓
Execution pipeline
```

## 3. Input Specification

### 3.1 Primary Input — PIPELINE_INTENT.yaml

```yaml
direction: INBOUND | OUTBOUND | BIDIRECTIONAL
processingMode: PLAN | EXECUTE | TRANSFORM | OBSERVE
mutationScope: NONE | LOCAL | GLOBAL
```

### 3.2 Fallback Input — pipeline-mode.json

When `PIPELINE_INTENT.yaml` does not exist:

```json
{
  "mode": "plan" | "execute"
}
```

Mapped as:
- `"plan"` → `{ direction: INBOUND, processingMode: PLAN, mutationScope: NONE }`
- `"execute"` → `{ direction: OUTBOUND, processingMode: EXECUTE, mutationScope: LOCAL }`

### 3.3 Optional Metadata

```
session_id: string
trace_id: string
strict_mode: boolean (default: true)
```

## 4. Output Specification

### 4.1 ExecutionState (Canonical Output)

```
ExecutionState =
  | READ_ONLY_PLAN
  | CODE_EXECUTION
  | RUNTIME_INSTRUMENT
  | TRANSFORM_PIPELINE
  | INVALID_STATE
```

### 4.2 Output Contract

```json
{
  "executionState": "CODE_EXECUTION",
  "normalizedIntent": {
    "direction": "OUTBOUND",
    "processingMode": "EXECUTE",
    "mutationScope": "LOCAL"
  },
  "validationReport": {
    "valid": true,
    "violations": []
  }
}
```

## 5. Core Transformation Rules

### R1 — Schema Validity Rule

`PIPELINE_INTENT.yaml` MUST conform exactly to:

```
direction ∈ {INBOUND, OUTBOUND, BIDIRECTIONAL}
processingMode ∈ {PLAN, EXECUTE, TRANSFORM, OBSERVE}
mutationScope ∈ {NONE, LOCAL, GLOBAL}
```

Violation → `INVALID_SCHEMA`, severity FATAL.

### R2 — Mode Compatibility Matrix

| processingMode | mutationScope | Valid |
|---|---|---|
| PLAN | NONE | ✔ |
| PLAN | LOCAL | ✔ |
| PLAN | GLOBAL | ✖ |
| EXECUTE | ANY | ✔ |
| TRANSFORM | LOCAL | ✔ |
| TRANSFORM | GLOBAL | ✔ |
| OBSERVE | NONE | ✔ |
| OBSERVE | LOCAL/GLOBAL | ✖ |

Violation → `INVALID_MODE_COMBINATION`, severity ERROR.

### R3 — Direction Consistency Rule

| direction | Valid processingModes |
|---|---|
| INBOUND | PLAN, OBSERVE |
| OUTBOUND | EXECUTE, TRANSFORM |
| BIDIRECTIONAL | EXECUTE, OBSERVE |

Violation → `INVALID_DIRECTION_MODE_PAIR`, severity ERROR.

### R4 — Mutation Safety Rule

```
If mutationScope == GLOBAL → processingMode MUST NOT be PLAN
If processingMode == OBSERVE → mutationScope MUST be NONE
```

Violation → `MUTATION_SAFETY_VIOLATION`, severity FATAL.

### R5 — Deterministic Mapping Rule

Every valid intent maps to exactly one ExecutionState. No ambiguity allowed.

Violation → `NON_DETERMINISTIC_INTENT`, severity FATAL.

## 6. ExecutionState Derivation Rules

### ES1 — READ_ONLY_PLAN

Triggered when:
```
processingMode == PLAN
AND mutationScope ∈ {NONE, LOCAL}
```

### ES2 — CODE_EXECUTION

Triggered when:
```
processingMode == EXECUTE
```

Direction determines scope but ExecutionState is always CODE_EXECUTION.

### ES3 — RUNTIME_INSTRUMENT

Triggered when:
```
processingMode == OBSERVE
AND direction ∈ {INBOUND, BIDIRECTIONAL}
```

### ES4 — TRANSFORM_PIPELINE

Triggered when:
```
processingMode == TRANSFORM
AND mutationScope ∈ {LOCAL, GLOBAL}
```

### ES5 — INVALID_STATE

Triggered when:
- any rule violation (R1–R4) occurs
- no deterministic mapping exists (R5)
- fallback also fails (no PIPELINE_INTENT.yaml AND no pipeline-mode.json)

## 7. Validation Pipeline (Deterministic Order)

```
Step 1: Load input
    try: read PIPELINE_INTENT.yaml
    catch: read pipeline-mode.json → map to intent object
    catch both: return INVALID_STATE, MISSING_INPUT

Step 2: Schema Validation (R1)
    check direction, processingMode, mutationScope enums
    on violation → return INVALID_STATE

Step 3: Mode Compatibility Check (R2)
    check processingMode × mutationScope matrix
    on violation → return INVALID_STATE

Step 4: Direction Consistency Check (R3)
    check direction × processingMode rules
    on violation → return INVALID_STATE

Step 5: Mutation Safety Check (R4)
    check mutation safety constraints
    on violation → return INVALID_STATE

Step 6: ExecutionState Derivation (ES1–ES5)
    apply derivation rules in order
    return canonical ExecutionState

Step 7: Determinism Verification (R5)
    assert single unambiguous mapping
    on violation → return INVALID_STATE
```

## 8. Failure Model

### 8.1 Failure Object

```json
{
  "code": "INVALID_MODE_COMBINATION",
  "severity": "ERROR",
  "message": "PLAN with GLOBAL mutation scope is not allowed",
  "context": {
    "field": "processingMode/mutationScope",
    "values": { "processingMode": "PLAN", "mutationScope": "GLOBAL" }
  }
}
```

### 8.2 Failure Classes

| Code | Rule | Severity | Description |
|---|---|---|---|
| F1 — `INVALID_SCHEMA` | R1 | FATAL | Input violates YAML schema |
| F2 — `INVALID_MODE_COMBINATION` | R2 | ERROR | Invalid processingMode + mutationScope pairing |
| F3 — `INVALID_DIRECTION_MODE_PAIR` | R3 | ERROR | Direction contradicts processing mode |
| F4 — `MUTATION_SAFETY_VIOLATION` | R4 | FATAL | Unsafe mutation configuration detected |
| F5 — `NON_DETERMINISTIC_INTENT` | R5 | FATAL | No single valid ExecutionState mapping exists |

Any failure → ExecutionState = INVALID_STATE.

## 9. Invariants

### I1 — Determinism Invariant

Same input → same ExecutionState always.

### I2 — Purity Invariant

normalize-intent MUST NOT:
- create requirements
- modify execution graphs
- emit domain events
- interact with event store

### I3 — Control-Plane Isolation Invariant

normalize-intent operates ONLY on:
- `PIPELINE_INTENT.yaml`
- `pipeline-mode.json`
- schema rules
- deterministic mapping tables

### I4 — Totality Invariant

All valid inputs MUST map to exactly one ExecutionState.

## 10. Non-Goals

normalize-intent MUST NOT:
- generate WorkRequests
- interact with requirements-capture
- perform decomposition
- schedule execution
- validate execution graphs
- observe runtime state

## 11. System Contracts

### 11.1 mode-router contract

mode-router assumes:
- ExecutionState is already valid, deterministic, and canonical
- normalize-intent has already executed successfully

If normalize-intent is missing or bypassed:
- mode-router behavior becomes undefined
- pipeline loses deterministic routing guarantees

### 11.2 Upstream contract

`PIPELINE_INTENT.yaml` MUST be:
- syntactically valid YAML
- complete (all three fields present)
- non-ambiguous (valid combination)

`pipeline-mode.json` MUST be:
- valid JSON
- `mode` field present with value `plan` or `execute`

## 12. Security / Safety Model

| Rule | Description |
|---|---|
| S1 — No Execution Leakage | normalize-intent must never trigger execution side effects |
| S2 — No Domain Leakage | must not interpret requirements or WorkRequests |
| S3 — No State Mutation | must be pure function over input files |
