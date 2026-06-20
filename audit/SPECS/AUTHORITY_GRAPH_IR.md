> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

# Authority Graph Visualization IR v1 — Hybrid Authority Execution Contract

## 1. Purpose

Define an Intermediate Representation (IR) for modeling and visualizing authority graphs within a multi-system execution environment. This IR supports:

- Authority propagation tracking
- Validation and enforcement of causal boundaries
- Visualization of trust, control, and dependency relationships
- Runtime and static analysis of permissioned execution paths

---

## 2. Core Concept

An Authority Graph is a directed labeled graph where:

- **Nodes** represent actors, systems, skills, or execution contexts
- **Edges** represent authority relationships (delegation, derivation, invocation, restriction)

The IR defines a normalized structure for representing this graph independent of runtime or visualization layer.

---

## 3. IR Top-Level Structure

```json
{
  "graph_id": "string",
  "version": "1.0",
  "nodes": [],
  "edges": [],
  "metadata": {}
}
```

---

## 4. Node Schema

```json
{
  "id": "string",
  "type": "actor | system | skill | context | policy",
  "label": "string",
  "attributes": {
    "trust_level": 0.0,
    "authority_scope": "string",
    "lifecycle_state": "active | suspended | deprecated"
  }
}
```

---

## 5. Edge Schema

```json
{
  "from": "node_id",
  "to": "node_id",
  "type": "delegates | invokes | restricts | derives | validates",
  "weight": 0.0,
  "conditions": {
    "runtime": "boolean_expression",
    "static": "boolean_expression"
  }
}
```

---

## 6. Authority Semantics

| Edge Type | Meaning |
|---|---|
| `delegates` | Authority is transferred or shared |
| `invokes` | One node triggers execution in another without transferring authority |
| `restricts` | One node constrains or limits another node's capabilities |
| `derives` | Authority is inherited or computed from another node |
| `validates` | One node enforces correctness or policy compliance on another |

---

## 7. Execution Model Alignment

The IR is designed to align with:

- Event-sourced execution graphs
- Validation pipelines (static + runtime + authority phases)
- Causal boundary enforcement systems
- Skill registry promotion/demotion mechanics

---

## 8. Visualization Targets

The IR supports rendering as:

- Directed force graphs
- Layered authority stacks
- Temporal evolution graphs (diff over time)
- Failure propagation maps

---

## 9. Open Questions

- Should authority be strictly additive, or allow subtraction/revocation over time?
- How should conflicting authority edges resolve at runtime?
- Do we need probabilistic trust propagation or strictly deterministic rules?
- Should policies themselves be first-class nodes with executable semantics?

---

## 10. Next Steps

- Define execution semantics for graph traversal
- Map IR to runtime validator (S/R/AEI rule system)
- Introduce event stream overlay for authority changes
- Design visualization renderer contract (UI-agnostic)

---

## 11. Hybrid Authority Execution Contract (HAEC)

### 11.1 Core Principle

There is exactly one authority decision per execution request.

> **Authority Graph** = determines *permission*
> **Execution Engine** = determines *timing and resource scheduling*

The Execution Engine MUST NOT evaluate authority logic. The Authority Graph MUST NOT perform scheduling logic.

### 11.2 Authority Evaluation Contract

`evaluate_authority()` is a **permission projection** over a pending transition — not a precondition check. It is invoked inside `validate_runtime()` before any R1–R10 rules.

```json
AuthorityResult = evaluate_authority(
  graph,
  event,
  context_snapshot,
  edge_resolution_strategy,
  edge_resolution_strategy_version
)
```

**Evaluation identity** (deterministic key):

```
evaluation_id = hash(
    graph_version +
    event_frame_id +
    target_node_id +
    normalized_context_hash +
    edge_resolution_strategy +
    edge_resolution_strategy_version
)
```

#### AuthorityResult schema

```json
{
  "decision": "ALLOW | DENY | CONSTRAIN",
  "constraints": [],
  "reason_codes": [],
  "authority_snapshot_id": "string",
  "evaluation_id": "string"
}
```

**Rules**:
- MUST NOT depend on runtime queue state, execution timing, or I/O
- MUST be deterministic for a given (graph, context_snapshot, evaluation_id)
- MUST be idempotent — bitwise-identical `AuthorityResult` for identical inputs
- `evaluation_id` MUST be reproducible across distributed nodes

### 11.3 Constraint Model

Constraints are data-only. They MUST NOT contain executable logic.

```
type Constraint = Bound | Filter | Limit | Label | ScopeReduction

Bound = { type: "bound", field: string, min?: number, max?: number }
Filter = { type: "filter", field: string, allowed: value[] }
Limit = { type: "limit", resource: string, max: number }
Label = { type: "label", key: string, value: string }
ScopeReduction = { type: "scope_reduction", path: string[] }

// FORBIDDEN:
//   Expression = { type: "expression", script: "..." }
//   Predicate = { type: "predicate", if: ..., then: ... }
//   ConditionalRule = { type: "conditional", branches: [...] }
```

**Constraint canonical ordering** (for deterministic serialization):

```
1. By constraint type, lexicographically: { Bound, Filter, Limit, Label, ScopeReduction }
2. Within type, by field-major key (primary identifier)
3. Within field-major key, by stable hash of full constraint object
```

### 11.4 Execution Engine Contract

The Execution Engine consumes `AuthorityResult`:

**Allowed**:
- schedule execution, delay execution, retry execution, batch execution

**Forbidden**:
- re-evaluating authority graph logic
- modifying `AuthorityResult` semantics
- introducing policy checks equivalent to graph edges or node attributes

### 11.5 Non-Duplication Rule (Hard Constraint)

There MUST NOT be two independent implementations of authority logic:

- NO secondary `if (trustedUser)` style gates in execution engine
- NO shadow policy checks outside `evaluate_authority()`
- All permission decisions MUST originate from `evaluate_authority()`

### 11.6 Determinism & Versioning

- Every `AuthorityResult` MUST include `authority_snapshot_id`
- Snapshots MUST represent an immutable view of the graph at evaluation time
- Replaying an event MUST reproduce identical `AuthorityResult` when using the same snapshot ID

### 11.7 Conflict Elimination Model

Three valid states:

| Decision | Meaning | Execution Engine Response |
|---|---|---|
| `ALLOW` | May schedule freely | Continue R1–R10 |
| `DENY` | MUST NOT execute | Immediate `ValidationFailure: HAEC` |
| `CONSTRAIN` | Execute only within provided constraints | Attach constraints to context, continue R1–R10 |

The Execution Engine does NOT interpret these states beyond their defined meaning.

### 11.8 Failure Modes

**FATAL_EVALUATION_FAILURE** — execution-level failure, not an authority decision:

```
When: Graph snapshot missing, context normalization failure,
      evaluation_id cannot be computed, AuthorityGraph edge lookup fails

Behavior:
  - validate_runtime() treats as immediate FATAL ValidationFailure
  - rule_id: "FATAL_EVALUATION_FAILURE"
  - Event frame left intact for diagnostic inspection
  - Execution engine MUST NOT retry or fall back to ALLOW
  - Only operator intervention or graph restore can unblock
```

**Invariant**: Authority decision space is disjoint from execution failure space.

```
FATAL_EVALUATION_FAILURE MUST NOT be convertible into DENY.
- No fallback mapping from "cannot evaluate" → "denied"
- System health and authority decisions are separate observability domains
```

### 11.9 Pre-HAEC Snapshot Discipline

```
The pre-HAEC snapshot is captured at frame instantiation time, not at evaluation time.
evaluate_authority() is pure over an already-frozen input.
It is NOT allowed to trigger snapshot creation.

evaluate_authority() MUST NOT reconstruct, recompute, or re-normalize context internally.
It MUST consume: pre-HAEC snapshot only.
```

### 11.10 Purity Boundary

```
evaluate_authority() MUST NOT perform I/O, state mutation, or external system calls.

Allowed:
  - Deterministic graph lookup (within pre-HAEC snapshot)
  - Deterministic hashing
  - Deterministic rule evaluation over snapshot fields

Forbidden:
  - Database reads outside the pre-HAEC graph snapshot
  - Network calls
  - Runtime state inspection outside the pre-HAEC snapshot
  - Logging that influences control flow
```

---

## 12. Distributed Integration

### 12.1 Authority Agreement Rule

In distributed mode, for each event transition:

```
1. Claiming host computes: evaluation_id, local AuthorityResult
2. evaluation_id is included in the NodeClaimed event
3. Peers verify: recompute AuthorityResult from evaluation_id
4. If peer's result differs from claimed host's result:
   → reject execution pre-dispatch
   → emit ValidationFailure { rule_id: "HAEC_DISTRIBUTED_MISMATCH" }
```

### 12.2 Canonical Serialization

```
AuthorityResult MUST use a canonical serialization scheme before hashing or comparison.

Canonical form requirements:
  - Fields ordered lexicographically by name
  - Arrays sorted deterministically (by key field, or by value for scalar arrays)
  - No whitespace variation (compact JSON or equivalent binary form)
  - Same precision for all numeric fields (fixed-point, not floating)
```

### 12.3 Frame Scope Atomicity

```
An event_frame_id defines a single atomic authority evaluation scope.
No sub-frames, retries, or partial executions may redefine or subdivide
this scope for HAEC purposes.

A retry is not a new frame — it is the same frame re-executed.
HAEC MUST NOT be re-evaluated within the same event_frame_id.
```

---

## 13. System Architecture Layering

The system has four layers:

| Layer | Responsibility | Component |
|---|---|---|
| AEI | Structural validity over system graph | `validate_authority()` — pre-lowering |
| HAEC | Permission projection over frame-local transition | `evaluate_authority()` — inside `validate_runtime()` |
| Runtime | State transition correctness (R1–R10) | `validate_runtime()` — scheduler tick |
| Integrity (implicit) | Determinism, reproducibility, distributed agreement | Canonical serialization, snapshot discipline, `FATAL_EVALUATION_FAILURE` handling |

Each layer consumes the previous layer without re-evaluating its semantics.

```
Dimension   | Question                                          | When                  | Effect
────────────┼──────────────────────────────────────────────────┼───────────────────────┼─────────────────
AEI         | Is this structure legal?                         | Pre-lowering          | FATAL → abort
HAEC        | Is this transition permitted in this exact frame?| Inside validate_runtime, before R1 | DENY → abort transition
Runtime     | Given permission, does this obey state rules?    | Scheduler tick (R1–R10) | FATAL/ERROR → trajectory mutation
```

**Invariants**:
- Only Runtime can mutate system state
- Only HAEC can authorize a transition
- Only AEI can define valid structure
- No cross-talk, no fallback interpretation
