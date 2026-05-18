# Authority Graph Visualization IR

## 1. Purpose
Define an Intermediate Representation (IR) for modeling and visualizing authority graphs within a multi-system execution environment. This IR is intended to support:

- Authority propagation tracking
- Validation and enforcement of causal boundaries
- Visualization of trust, control, and dependency relationships
- Runtime and static analysis of permissioned execution paths

---

## 2. Core Concept
An Authority Graph is a directed labeled graph where:

- Nodes represent actors, systems, skills, or execution contexts
- Edges represent authority relationships (delegation, derivation, invocation, restriction)

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

Each node represents a unit of authority or execution identity.

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

Edges define directional authority relationships.

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

### 6.1 Delegation
Authority is transferred or shared.

### 6.2 Invocation
One node triggers execution in another without transferring authority.

### 6.3 Restriction
One node constrains or limits another node’s capabilities.

### 6.4 Derivation
Authority is inherited or computed from another node.

### 6.5 Validation
One node enforces correctness or policy compliance on another.

---

## 7. Execution Model Alignment

The IR is designed to align with:

- Event-sourced execution graphs
- Validation pipelines (static + runtime phases)
- Causal boundary enforcement systems
- Skill registry promotion/demotion mechanics

---

## 8. Visualization Targets

The IR should support rendering as:

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
- Map IR to runtime validator (S/R rule system)
- Introduce event stream overlay for authority changes
- Design visualization renderer contract (UI-agnostic)

---

## 11. Hybrid Authority Execution Contract (HAEC)

This section defines the strict, non-ambiguous split between Authority Graph evaluation and Execution Engine behavior. The goal is to eliminate dual-policy drift while preserving separation of concerns.

### 11.1 Core Principle

There is exactly one authority decision per execution request.

> Authority Graph = determines *permission*  
> Execution Engine = determines *timing and resource scheduling*

The Execution Engine MUST NOT evaluate authority logic.
The Authority Graph MUST NOT perform scheduling logic.

---

### 11.2 Authority Evaluation Contract

Authority evaluation is a deterministic function:

```json
AuthorityResult = evaluate_authority(
  graph_id,
  target_node_id,
  execution_context,
  event_frame_id
)
```

### AuthorityResult schema (minimum)

```json
{
  "decision": "ALLOW | DENY | CONSTRAIN",
  "constraints": [],
  "reason_codes": [],
  "authority_snapshot_id": "string"
}
```

Rules:
- The function MUST NOT depend on runtime queue state
- The function MUST NOT depend on execution timing
- The function MUST be deterministic for a given (graph, context, snapshot)

---

### 11.3 Execution Engine Contract

The Execution Engine consumes AuthorityResult:

Allowed behaviors:
- schedule execution
- delay execution
- retry execution
- batch execution

Forbidden behaviors:
- re-evaluating authority graph logic
- modifying AuthorityResult semantics
- introducing policy checks equivalent to graph edges or node attributes

---

### 11.4 Non-Duplication Rule (Hard Constraint)

There MUST NOT be two independent implementations of authority logic.

Specifically:
- NO secondary “if (trustedUser)” style gates in execution engine
- NO shadow policy checks outside Authority Graph evaluation

All permission decisions MUST originate from `evaluate_authority()`.

---

### 11.5 Determinism & Versioning

To prevent drift during graph evolution:

- Every AuthorityResult MUST include `authority_snapshot_id`
- Snapshots MUST represent an immutable view of the graph at evaluation time

Replay rule:
> Replaying an event MUST reproduce identical AuthorityResults when using the same snapshot ID.

---

### 11.6 Conflict Elimination Model

There are only three valid states in the system:

1. **Allowed** → Execution Engine may schedule freely
2. **Denied** → Execution Engine MUST NOT execute
3. **Constrained** → Execution Engine may execute only within provided constraints

The Execution Engine does NOT interpret these states beyond their defined meaning.

---

### 11.7 Failure Modes

If authority evaluation fails:

- Default behavior MUST be DENY (fail-closed)
- Execution Engine MUST NOT attempt fallback heuristics
- Failure MUST be emitted as ValidationFailure event

---

### 11.8 Summary Invariant

> The system has exactly one brain for authority, and exactly one hand for execution.

The brain decides what is permitted.
The hand decides when it happens.
No other decision points exist for authority.


- Define execution semantics for graph traversal
- Map IR to runtime validator (S/R rule system)
- Introduce event stream overlay for authority changes
- Design visualization renderer contract (UI-agnostic)

