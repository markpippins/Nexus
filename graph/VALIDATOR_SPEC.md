>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# ExecutionGraph Validator v1 — Four-Dimension Specification

## 1. Overview

The ExecutionGraph Validator ensures that every ExecutionGraph is structurally sound before execution and remains semantically valid during execution.

It operates across four orthogonal dimensions:

| Dimension | Time | Scope | Failure Effect |
|---|---|---|---|
| AEI (Authority Graph) | Pre-lowering, after mode-router | System component topology validity | Abort — no lowering permitted |
| Static | After lowering, before freeze | Structural correctness | Reject artifact creation |
| HAEC (permission) | Inside runtime validation, before R1 | Per-transition permission | DENY → abort transition; CONSTRAIN → attach limits |
| Runtime | During scheduler execution | Behavioral correctness | Mutate execution trajectory |

```
Validation(Graph, Mode) → { OK | FAILURE(list<ValidationFailure>) }
```

Validation is **hard gating logic**, not advisory.

---

## 2. Core Semantics

### 2.1 Four-Dimension Principle

The four dimensions are orthogonal. They do NOT share lifecycle consequences.

```
AEI validation ensures topology validity.
Static validation ensures structural correctness.
HAEC ensures per-transition permission.
Runtime validation ensures behavioral correctness.
```

A graph that passes static validation may still fail at runtime. A runtime failure does not retroactively invalidate static validation. Authority evaluations are separate from both.

A graph that passes static validation may still fail at runtime. A runtime failure does not retroactively invalidate static validation.

### 2.2 Gate Semantics

| Gate | Failure effect | Impact |
|---|---|---|
| STATIC validator | Abort compilation | No ExecutionGraph emitted. No downstream processing. |
| RUNTIME validator | Inject FailureNode or block transition | Execution trajectory modified. Graph continues. |

### 2.3 ValidationFailure Event

```json
{
  "type": "ValidationFailure",
  "domain": "System",
  "phase": "STATIC | RUNTIME",
  "target": {
    "graph_id": "...",
    "node_id": "optional",
    "edge_id": "optional"
  },
  "rule_id": "S5 | R3 | R10 | HAEC | HAEC_DISTRIBUTED_MISMATCH | FATAL_EVALUATION_FAILURE",
  "severity": "WARN | ERROR | FATAL",
  "message": "...",
  "context": {}
}
```

| Field | Rule |
|---|---|
| `phase` | Which lane detected the violation |
| `rule_id` | Canonical rule identifier (S1–S10, R1–R10) |
| `severity` | WARN: log only. ERROR: block transition (runtime) or halt (static). FATAL: halt (static) or emit FailureNode (runtime). |

### 2.4 Key Invariants

```
ValidationFailure ∉ Execution semantics
FailureNode ∈ Execution semantics
```

ValidationFailure events are **annotations on state transitions**, never inputs to state computation.

```
replay(event_log) == state
    — validation events do not affect replay determinism
```

### 2.5 FailureNode Mapping Guardrail

| Condition | Result |
|---|---|
| RUNTIME FATAL + active node context | FailureNode emitted, node transitions to FAILED |
| RUNTIME FATAL + no node context | ValidationFailure only (no orphan AST node) |
| STATIC any severity | No FailureNode (no ExecutionGraph context exists) |

A FailureNode MUST always correspond to a terminal ExecutionNode lifecycle state.

---

## 3. Static Validator (Pre-Freeze)

### 3.1 Purpose

Ensures the ExecutionGraph is structurally correct, fully bound, executable, and deterministic.

### 3.2 Entry Point

```
validate_static(graph: ExecutionGraph) → list<ValidationFailure>
```

Called after graph assembly, before freeze. If any ERROR or FATAL violations are found, compilation aborts and no ExecutionGraph is emitted.

### 3.3 Static Rules (S1–S10)

#### S1 — Node Type Validity

```
∀ node ∈ graph.nodes:
    node.type ∈ {TaskNode, ControlNode, ResourceNode, ObservationNode, SystemNode, FailureNode}
```

Failure → VIOLATION: invalid node type.

#### S2 — Executor Binding Completeness

```
∀ node ∈ graph.nodes:
    if node.type == TaskNode:
        node.executor_selection ≠ null
```

Failure → UNBOUND_EXECUTOR.

#### S3 — WorkRequest Consistency

```
∀ node ∈ graph.nodes:
    node.work_request_id ∈ WorkRequestGraph.work_requests
```

Failure → ORPHAN_NODE.

#### S4 — Dependency Closure

```
∀ edge ∈ graph.edges:
    edge.source ∈ graph.nodes
    edge.target ∈ graph.nodes
```

Failure → INVALID_EDGE_REFERENCE.

#### S5 — Acyclic Dependency Graph

For all `DataDependency` and `ControlDependency` edges:

```
graph must be a DAG
```

Failure → CYCLE_DETECTED.

#### S6 — Control Node Semantics

Control nodes must obey strict typing:

| Control Type | Constraint |
|---|---|
| Fork | ≥2 outgoing edges |
| Join | ≥2 incoming edges |
| Decision | exactly 2 outgoing edges |
| Merge | ≥2 incoming edges |
| Sequence | linear chain only |

Failure → INVALID_CONTROL_STRUCTURE.

#### S7 — Resource Node Validity

```
∀ node ∈ graph.nodes:
    if node.type == ResourceNode:
        node.executor_selection.type == "resource_provider"
```

Failure → INVALID_RESOURCE_BINDING.

#### S8 — Single Root Constraint

```
|graph.roots| = 1
```

Failure → MULTIPLE_ROOTS.

#### S9 — Frozen Topology Rule

```
pre-freeze: graph.mutability = true
post-validation: graph.mutability = false
```

Failure → TOPOLOGY_MUTATION_POST_FREEZE (if mutation attempted after freeze).

#### S10 — Node Expansion Contract

Each WorkRequest MUST expand to exactly:

```
[Prepare, Execute, Finalize]
```

Failure → INVALID_NODE_EXPANSION.

### 3.4 Static Output

If any ERROR or FATAL violations:

```
emit ValidationFailure(...) for each violation
ABORT — no ExecutionGraph produced
```

If all violations are WARN-only or empty:

```
emit warnings
proceed to freeze
```

---

## 4. Runtime Validator (Scheduler-Gated)

### 4.1 Purpose

Ensures correct execution transitions, no illegal state progression, distributed safety invariants, lease correctness, and deterministic scheduling behavior.

### 4.2 Entry Point

```
validate_runtime(
    node: ExecutionNode,
    graph: ExecutionGraph,
    event: Event,
    runtime_state: RuntimeState
) → list<ValidationFailure>
```

Called inside the scheduler tick loop, after observation processing and before commit.

### 4.3 Runtime Rules (R1–R10)

#### R1 — State Machine Validity

Allowed transitions only:

```
pending → READY → CLAIMED → BOUND → RUNNING → SUCCEEDED
                                        ↘ FAILED → READY (retry)
                                                  → terminal
                                        ↘ SKIPPED
                                        ↘ BLOCKED
```

Failure → INVALID_STATE_TRANSITION. Severity: FATAL.

#### R2 — Claim Ownership Rule (Distributed)

```
node.lifecycle_state == CLAIMED
⇒ node.claim.host_id == event.host_id
```

Failure → INVALID_CLAIM_OWNER. Severity: FATAL.

#### R3 — Lease Validity

```
now ≤ claim.timestamp + lease_duration
```

Failure → LEASE_EXPIRED. Severity: ERROR (triggers lease release, node returns to READY).

#### R4 — Single Active Executor Rule

```
∀ node: at most one RUNNING instance globally
```

Failure → DUPLICATE_EXECUTION. Severity: FATAL.

#### R5 — Dependency Readiness

Before a node transitions to RUNNING:

```
∀ dep ∈ node.dependencies:
    dep.lifecycle_state ∈ {SUCCEEDED, SKIPPED}
```

Failure → UNSATISFIED_DEPENDENCY. Severity: ERROR (node remains blocked).

#### R6 — Executor Consistency

```
node.executor_selection ∈ ExecutorRegistry
```

Failure → EXECUTOR_NOT_FOUND. Severity: FATAL (materialize FailureNode).

#### R7 — Event-State Consistency

Each event must align with node state:

```
EventExecutionStarted ⇒ node.lifecycle_state == RUNNING
EventExecutionSucceeded ⇒ node.lifecycle_state == SUCCEEDED
EventExecutionFailed ⇒ node.lifecycle_state == FAILED
```

Failure → EVENT_STATE_MISMATCH. Severity: FATAL.

#### R8 — Distributed Safety (At-Most-Once)

```
∀ node: no two NodeClaimed events with overlapping leases
```

Failure → DOUBLE_CLAIM_DETECTED. Severity: ERROR (first claim wins by event log order).

#### R9 — Failure Node Integrity

```
if node.lifecycle_state == FAILED:
    ∃ FailureNode in graph ∨ event log with matching node_id
```

Failure → MISSING_FAILURE_NODE. Severity: FATAL.

#### R10 — Control Node Execution Semantics

| Control Type | Rule |
|---|---|
| Sequence | Single active successor at a time |
| Parallel | All branches eligible simultaneously |
| Conditional | Exactly one branch active |
| Loop | Re-enqueue until predicate false |

Failure → CONTROL_FLOW_VIOLATION. Severity: ERROR.

### 4.4 Runtime Severity Dispatch

| Severity | Action |
|---|---|
| WARN | Log warning, continue |
| ERROR | Block transition, node stays in current state |
| FATAL + node context | Emit FailureNode, transition node to FAILED |
| FATAL + no node context | Emit ValidationFailure only, no AST mutation |

---

## 5. Validator Architecture

### 5.1 Module Structure

```
validator/
  static/
    node_rules.rs      — S1, S2, S3, S8, S10
    edge_rules.rs      — S4, S5
    control_rules.rs   — S6
    expansion_rules.rs — S9, S10

  runtime/
    state_machine.rs      — R1, R7
    distributed_rules.rs  — R2, R3, R8
    dependency_rules.rs   — R5
    event_consistency.rs  — R6, R9, R10

  shared/
    error_types.rs   — ValidationFailure schema, severity enum
    rule_traits.rs   — Rule trait, validate() interface
```

### 5.2 Pipeline Position

```
WorkRequestGraph
    ↓
Lowering Pass
    ↓
  [assemble graph]
    ↓
  [STATIC VALIDATOR]  ← gate: abort on ERROR/FATAL
    ↓
  [freeze graph]
    ↓
ExecutionGraph (frozen)
    ↓
Scheduler tick loop
    ↓
  [select node → validate → transition → ...]
    ↓
  [RUNTIME VALIDATOR]  ← gate: block or inject FailureNode
    ↓
  [commit]
    ↓
EventLog
```

---

## 6. Relationship to System Components

| Component | Relationship |
|---|---|
| Lowering Pass | Calls `validate_static()` before freeze |
| Scheduler | Calls `validate_runtime()` inside tick loop |
| FailureModel | `ValidationFailure` is F12 in the F-class taxonomy |
| Event System | `ValidationFailure` is a System-domain event |
| Replay Engine | Ignores validation events — pure fold unaffected |
| Observation Engine | May surface validation events as derived views |
| FailureNode | Only produced by RUNTIME FATAL with node context |

### 6.1 Tri-Layer Symmetry

| Layer | Validator Role |
|---|---|
| Compiler | Static validator (reject artifact) |
| Runtime | Runtime validator (mutate trajectory) |
| Replay | Validation ignored (pure fold, no circularity) |
| Observation | Derived views only (no validation input) |

---

## 7. Invariants

| # | Invariant |
|---|---|
| V1 | Static validation ensures structural correctness. Runtime validation ensures behavioral correctness. They do not share lifecycle consequences. |
| V2 | `ValidationFailure` MUST NOT be replay-dependent. Replay ignores validation events. |
| V3 | A `FailureNode` MUST always correspond to a terminal `ExecutionNode` lifecycle state. RUNTIME FATAL without node context → `ValidationFailure` only. |
| V4 | `ValidationFailure ∉ Execution semantics`. `FailureNode ∈ Execution semantics`. |
| V5 | Static validation rejects artifact creation. Runtime validation mutates execution trajectory. |
| V6 | Same input graph + same runtime state → same validation result. |
| V7 | Validation has no observation layer authority. Validator does not produce views. Observation Engine does not validate. |
| V8 | WorkRequestGraph MUST NOT contain routing metadata, execution modes, or execution flags. Requirements objects MUST NOT carry execution authority. WorkRequestGraph is a domain-modeling artifact, not a control-plane artifact. |

---

## V11. Authority Graph Validation Lane

### V11.1 Purpose

The Authority Graph lane validates whether the system is architecturally permitted to lower and execute. It is a **compile-time existence gate** — it determines whether lowering is even allowed to begin. Unlike S1–S10 (which validate ExecutionGraph correctness) and R1–R10 (which validate runtime behavior), AEI rules validate the system's component topology.

**Causal position**:

```
normalize-intent
    ↓
mode-router
    ↓
validate_authority  ← HERE (pre-lowering gate)
    ↓
lowering (WorkRequestGraph → ExecutionGraph)
    ↓
validate_static (S1–S10)
    ↓
freeze
    ↓
scheduler → validate_runtime (R1–R10)
```

### V11.2 Definition

**Input**: `SystemContext` — a representation of the system's component graph (module boundaries, cross-references, layer assignments).

**Entry point**: `validate_authority(system: SystemContext) → list<ValidationFailure>`

**When**: After `mode-router` resolves `ExecutionState`, before the lowering pass begins.

**Failure effect**: All violations are FATAL. Any FATAL violation aborts compilation — no `ExecutionGraph` is built. Authority validation is not advisory.

### V11.3 Rule Set — Authority Edge Invariants (AEI1–AEI4)

#### AEI1 — Layer Ordering

Every component-to-component reference MUST respect layer ordering. Influence flows downward only.

```
L0: Control Plane       normalize-intent
L1: Routing             mode-router
L2: Execution           schedulers, runners, lowering
L3: Domain Modeling     requirements-capture, PEB
L4: Observation         replay, OQL, snapshot systems
```

```
for each reference (source → target):
    if layer(source) > layer(target):
        → FATAL: "Layer {source.layer} references layer {target.layer} — violates downward-only flow"
```

#### AEI2 — Forbidden Edge Patterns

Any edge matching the following patterns is INVALID:

| Code | Pattern | Description |
|---|---|---|
| F1 | DOMAIN → ROUTING | `requirements-capture` or PEB → `mode-router` |
| F2 | DOMAIN → CONTROL_PLANE | PEB or `execution-binding` → `normalize-intent` |
| F3 | EXECUTION → ROUTING | `execution-scheduler` or `execution-runner` → `mode-router` |
| F4 | OBSERVATION → any upstream | replay engine or observation engine → any L0–L3 component |
| F5 | EXCEPTION/FAILURE → CONTROL_PLANE | `peb-exception-router` → `mode-router` (severed) |
| F6 | CROSS-LAYER STATE REINTERPRETATION | `RuntimeSnapshot` ↔ `ExecutionState`, etc. |

```
for each reference (source → target):
    if (source in DOMAIN and target in ROUTING):          → FATAL "AEI2/F1"
    if (source in DOMAIN and target in CONTROL_PLANE):    → FATAL "AEI2/F2"
    if (source in EXECUTION and target in ROUTING):       → FATAL "AEI2/F3"
    if (source in OBSERVATION and target in {L0,L1,L2,L3}): → FATAL "AEI2/F4"
    if (source in {EXCEPTION, FAILURE} and target in CONTROL_PLANE): → FATAL "AEI2/F5"
```

#### AEI3 — State Identity

No state term may be shared across layers with different meanings.

```
LAYER_TERMS = {
    "ExecutionState":      "CONTROL_PLANE",
    "RuntimeSnapshot":     "REPLAY",
    "ReconstructedState":  "OBSERVATION",
    "ExecutionFrame":      "KERNEL"
}

for each term usage:
    if term in LAYER_TERMS and layer(usage) != LAYER_TERMS[term]:
        → FATAL: "Term '{term}' used in layer {layer(usage)} but owned by {LAYER_TERMS[term]}"
```

#### AEI4 — Exception Routing Guard

The `peb-exception-router` MUST NOT reference `mode-router` as a routing target. Exceptions are data, not control signals.

```
for each reference:
    if source == "peb-exception-router" and target == "mode-router":
        → FATAL "AEI4": "peb-exception-router → mode-router is a severed feedback edge"
```

### V11.4 HAEC — Permission Projection (Runtime Sub-Evaluation)

HAEC is NOT a lane. It is a **permission projection** over a pending transition, invoked inside `validate_runtime()` before any R1–R10 rules. See [`AUTHORITY_GRAPH_IR.md`](./AUTHORITY_GRAPH_IR.md) for the full specification.

**Causal position inside runtime validation**:

```
validate_runtime(node, event, state):
    1. evaluate_authority(graph, event, pre_haec_snapshot, ...)
       → AuthorityResult: ALLOW | DENY | CONSTRAIN
    2. if DENY → return FATAL ValidationFailure (rule_id: "HAEC")
    3. if CONSTRAIN → attach constraints to context
    4. continue with R1–R10
```

**HAEC rules integrated into the validator**:

| Rule | Enforces |
|---|---|
| HAEC-R1 | Evaluation identity includes versioned `edge_resolution_strategy` |
| HAEC-R2 | Constraints are data-only (no expressions, predicates, conditional rules) |
| HAEC-R3 | Canonical serialization with constraint ordering by type→field→hash |
| HAEC-R4 | Snapshot captured at frame instantiation; no control-flow from constraints |
| HAEC-R5 | `FATAL_EVALUATION_FAILURE` disjoint from `DENY` — no conversion between them |
| HAEC-R6 | Bitwise idempotency — canonical serialization for distributed agreement |
| HAEC-R7 | Single evaluation per `(event_frame_id, target_node_id)` — no re-evaluation within frame |
| HAEC-R8 | `evaluate_authority()` is pure — no I/O, no state mutation, no context reconstruction |

### V11.5 Four-Dimension Invariant

The four dimensions are isolated:

| Dimension | Question | Effect |
|---|---|---|
| AEI | Is this structure legal? | FATAL → abort |
| HAEC | Is this transition permitted in this exact frame? | DENY → abort transition |
| Static | Is this graph structurally correct? | FATAL/ERROR → reject artifact |
| Runtime | Given permission, does this obey state rules? | FATAL/ERROR → trajectory mutation |

Only Runtime can mutate system state. Only HAEC can authorize a transition. Only AEI can define valid structure. No cross-talk. No fallback interpretation.

### V11.6 Severity Dispatch

All AEI violations are FATAL. No ERROR or WARN level exists for authority validation.

```
function dispatch_authority_violations(violations):
    for v in violations:
        emit_validation_failure_event(v)
    if len(violations) > 0:
        ABORT  // no lowering, no ExecutionGraph
```

### V11.5 Invariant

```
validate_authority() → FATAL  ⇒  no graph generation
```

Authority validation is an existence-level gate. A violation means the system's component architecture is invalid. No downstream processing occurs.

---

## V12. CER Validation Rules

### V12.1 Purpose

The CER validation rules ensure that the Canonical Event Record store is internally consistent, identity-stable, and properly linked. These rules operate on the EventLog as a whole (cross-event validation), not on individual events.

**When**: Continuously — during CER pipeline write path, during snapshot creation, and during replay rehydration.

**Failure effect**: FATAL violations abort the current operation (event ingestion halts, snapshot creation fails, replay aborts). ERROR violations are reported but do not block.

### V12.2 Rule Set

#### V12.1 — Schema Compliance

Every event in the EventLog MUST conform to the CER schema defined in [`CER_SPEC.md §1`](./CER_SPEC.md).

```
for each event in EventLog:
    if missing required field OR type mismatch OR invalid enum value:
        → FATAL "V12.1": "CER schema violation at event {event_id}: {details}"
```

#### V12.2 — Identity Collision Detection

Two events with the same `entity_key` MUST have consistent `state_delta` history. Inconsistency indicates identity collision.

```
for each pair (A, B) where A.identity.entity_key == B.identity.entity_key:
    if A.state_delta conflicts with B.state_delta (same field, different values, both non-null):
        → FATAL "V12.2": "Identity collision: {entity_key} diverged in state_delta at {A.event_id} vs {B.event_id}"
```

**Exception**: ALIAS events (compression.strategy == "alias") are excluded — they carry no state_delta and explicitly tag identity merges.

#### V12.3 — Anti-Collapse Guard Integrity

Rule 4 from CER_SPEC.md MUST be enforceable. If the causal dependency index exists, verify that no invalid cross-chain collapse occurred.

```
Requires: causal dependency index (write-time derived artifact)
If index exists:
    for each collapsed entity pair (A, B):
        if A.causality.causal_chain_id != B.causality.causal_chain_id
        AND state_delta diverges semantically
        AND both have downstream dependents in index:
            → FATAL "V12.3": "Anti-collapse guard violation: {entity_key}"
If index does not exist:
    → WARN "V12.3": "Causal dependency index missing — anti-collapse guard unenforceable"
```

#### V12.4 — Orphan DELTA Detection

Every DELTA event MUST have a FULL ancestor in the same `causal_chain_id` AND `domain scope`, reachable via the `ancestor_event_id` chain.

```
for each event where compression.strategy == "delta":
    ancestor = resolve_event(event.ancestor_event_id)
    if ancestor is null:
        → FATAL "V12.4": "Orphan DELTA: {event_id} ancestor_event_id {ancestor_event_id} not found"
    if ancestor.causality.causal_chain_id != event.causality.causal_chain_id:
        → FATAL "V12.4": "Cross-chain DELTA: {event_id} ancestor in different causal chain"
    if ancestor.compression.strategy == "delta":
        → ERROR "V12.4": "Chained DELTA: {event_id} ancestor is also DELTA (must trace to FULL)"
```

#### V12.5 — ALIAS Cycle Detection

`alias_keys` MUST NOT form a cycle and MUST resolve to a unique primary `entity_key`.

```
for each event where compression.strategy == "alias":
    visited = set()
    current = event.identity.entity_key
    while current in alias_index:
        if current in visited:
            → FATAL "V12.5": "ALIAS cycle detected: {visited}"
        visited.add(current)
        current = alias_index[current].entity_key
    // Must terminate at unique primary key
```

#### V12.6 — AEI↔CER Cross-Validation

Compile-time AEI structural identity MUST be consistent with CER runtime identity resolution. A mismatch between what the architecture says should exist and what the identity system observes is FATAL.

```
for each entity_key referenced in both AEI constraints and CER store:
    if AEI.type != CER.identity.type:
        → FATAL "V12.6": "AEI/CER type mismatch for {entity_key}: AEI={AEI.type} CER={CER.type}"
    if AEI.scope != CER.identity.scope:
        → FATAL "V12.6": "AEI/CER scope mismatch for {entity_key}: AEI={AEI.scope} CER={CER.scope}"
```

#### V12.7 — CCNF Version Anchor

Every CER MUST carry a `ccnf_version` that matches the current CCNF engine version, OR an explicit migration path must exist.

```
for each event in EventLog:
    if event.ccnf_version != CURRENT_CCNF_VERSION:
        if migration_path_exists(event.ccnf_version, CURRENT_CCNF_VERSION):
            continue  // explicit migration allowed
        else:
            → FATAL "V12.7": "CCNF version mismatch: event={event.ccnf_version} engine={CURRENT_CCNF_VERSION}"
```

### V12.3 CER Validation Module

```
validator/
  cer/
    schema_compliance.rs    — V12.1
    identity_collision.rs   — V12.2
    anti_collapse_guard.rs  — V12.3
    orphan_delta.rs         — V12.4
    alias_cycle.rs          — V12.5
    aei_cer_crosswalk.rs    — V12.6
    ccnf_version_anchor.rs  — V12.7
```

### V12.4 Relationship to Other Validator Layers

| Layer | Covers | Interaction |
|---|---|---|
| AEI (V11) | Compile-time structural identity | V12.6 cross-validates AEI ↔ CER |
| Static (S1–S10) | Graph structural correctness | Independent — CER does not validate graphs |
| HAEC | Per-transition permission | Independent — CER does not authorize transitions |
| Runtime (R1–R10) | Behavioral correctness | Independent — CER events are input to replay, not runtime state |

CER validation is a **horizontal consistency layer** — it validates the event store itself, not the execution semantics.
