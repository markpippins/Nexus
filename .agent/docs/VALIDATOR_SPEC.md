# ExecutionGraph Validator v1 — Dual-Lane Specification

## 1. Overview

The ExecutionGraph Validator ensures that every ExecutionGraph is structurally sound before execution and remains semantically valid during execution.

It operates in two orthogonal lanes:

| Lane | Time | Scope | Failure Effect |
|---|---|---|---|
| Static | After lowering, before freeze | Structural correctness | Reject artifact creation |
| Runtime | During scheduler execution | Behavioral correctness | Mutate execution trajectory |

```
Validation(Graph, Mode) → { OK | FAILURE(list<ValidationFailure>) }
```

Validation is **hard gating logic**, not advisory.

---

## 2. Core Semantics

### 2.1 Dual-Lane Principle

The two lanes are orthogonal. They do NOT share lifecycle consequences.

```
Static validation ensures structural correctness.
Runtime validation ensures behavioral correctness.
```

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
  "rule_id": "S5 | R3 | R10",
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

### V11.4 Severity Dispatch

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
