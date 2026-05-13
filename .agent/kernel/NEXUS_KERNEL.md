# NEXUS KERNEL SPECIFICATION

**Version 1.0**

The Nexus Kernel is not an agent framework or a workflow engine. It is a deterministic graph-rewriting cognitive runtime. Cognition is executed as algebraic reduction semantics over structured ASTs.

This document serves as the absolute canonical specification. Everything else in the system (PEB, skills, runtime, UI) references and compiles down to this standard.

---

## 1. WorkRequest: The Kernel Data Model

A WorkRequest is a typed, versioned, partially-ordered Directed Acyclic Cognitive Object (DCO). It is the intermediate representation (IR) of the kernel, serving as a resumable, auditable process control block.

### 1.1 The 9-Block Schema

1. **IntentBlock (Semantic Root)**: The only human-facing truth anchor. (problem_statement, desired_outcome, domain, priority, abstraction_level).
2. **DecompositionBlock (Cognition AST)**: Bridge between thought and execution. A DAG of operations (strategy, steps, parallelism_model). Steps are atomic (analysis, transformation, generation, validation, execution).
3. **RequirementsBlock**: What must be true for success. (functional, non_functional, system, tool).
4. **ConstraintBlock (Sandbox Definition)**: Hard boundaries that must not be violated. (forbidden_actions, safety, resource_limits, architecture).
5. **SuccessCriteriaBlock (Termination Logic)**: Deterministic stop conditions. (validation_rules, acceptance_tests, completion_conditions, failure_modes).
6. **ExecutionStateBlock (Runtime Truth)**: The process control block. (status, current_step, progress, retries, error_state).
7. **LineageBlock (Cognitive Ancestry Graph)**: Semantic versioning and dependency tracking. (derived_from, supersedes, branches, merge_history).
8. **ArtifactBlock**: Outputs of cognition tying reasoning to the filesystem. (produced_files, intermediate_outputs).
9. **MetadataBlock**: Telemetry and context. (created_at, updated_at, agent_id, mode).

---

## 2. The Cognitive Compiler Passes

The WorkRequest Compiler converts intent into executable reality through rule-bound passes.

- **PASS 1 — Requirements Capture**: Expands implicit goals and classifies domain abstraction to establish a canonical semantic anchor.
- **PASS 2 — Constraint Binding**: Injects explicit hard system boundaries from the PEB into the WorkRequest. Constraints modify what is possible, not what is desired.
- **PASS 3 — Expansion Semantics (Decomposition)**: Transforms intent into an execution DAG. Enforces Atomicity (one cognitive op per node), Dependency (explicit inputs only, no forward dependencies), and Closure (every step is executable with declared inputs). Branching denotes cognitive exploration.
- **PASS 3.6 — Reduction Semantics (Merge Algebra)**: See Section 3.
- **PASS 4 — Fixed Point & Convergence Semantics**: See Section 4.
- **PASS 5 — Lineage Compiler**: Binds the resulting DCO into the semantic ancestry graph, treating branching as hypotheses and supersession as semantic authority replacement.

---

## 3. PASS 3.6: Merge / Recomposition Algebra

This layer collapses multiple parallel branches (hypotheses) into a single coherent system state. Merge is a binary reduction operator over cognition graphs.

### 3.1 The ⊕ Operator

Let $G = (V, E, A)$ be an execution subgraph (Steps, Dependencies, Artifacts).
Let $C$ be the Constraint Set.
$G_1 \oplus G_2 = Reduce(Union(G_1, G_2), C)$

### 3.2 Constraint Dominance Hierarchy (Precedence)

When conflicts arise, resolution is NOT heuristic. Higher priority ALWAYS overrides lower.

1. Safety / Security Constraints
2. System Integrity Constraints
3. Functional Correctness Constraints
4. Performance Constraints
5. Optimization Preferences

### 3.3 Reduction Rules

- **Constraint Dominance**: If constraint $(C_1) > (C_2)$, keep $(C_1)$, discard $(C_2)$. Recompute affected outputs under $(C_1)$. No negotiation.
- **Structural Conflict**: If incompatible, rebuild the dependency subtree. Do not patch.
- **Semantic Conflict**: If meanings differ structurally, insert an explicit `ReconciliationStep(A, B)` node. Conflict becomes computation.
- **Artifact Divergence**: Select `argmax(validity_score, constraint_alignment)`.
- **Identity Rule**: $G \oplus \emptyset = G$
- **Idempotence Rule**: $G \oplus G = G$ (No duplication of cognition)
- **Associativity**: $(G_1 \oplus G_2) \oplus G_3 = G_1 \oplus (G_2 \oplus G_3)$ (Guarantees compositional stability)

---

## 4. PASS 4: Fixed Point & Convergence Semantics

The kernel must determine when cognition stops. This is bounded by finding the fixed point of the transformation operators.

### 4.1 The Fixed Point Operator

Let $\Phi(G) = Reduce(Expand(G))$.
Execution is iterating $\Phi$ until convergence: $G^*$ such that $\Phi(G^*) \equiv G^*$.

### 4.2 Convergence Conditions

A WorkRequest execution is complete ONLY if ALL are true:

1. **Structural Stability**: $Expand(G) = G$. No new decomposition possible.
2. **Reduction Stability**: $Reduce(G) = G$. No unresolved conflicts.
3. **Constraint Satisfaction**: $\forall c \in C, satisfied(c, G) = true$. No violations.
4. **Execution Closure**: $\forall$ terminal nodes, $executed = true$.
5. **Artifact Consistency**: Single canonical output per artifact type.

### 4.3 Invariants

- **No Premature Termination**: A WorkRequest cannot complete if any constraint can propagate new structure.
- **No Infinite Refinement**: If $\Phi(G)$ oscillates, escalate to the Exception Router.
- **Deterministic Convergence**: Same inputs must converge to identical $G^*$.

---

## 5. The Runtime Loop

The `executor.py` acts as the $\Phi$ iterator runtime, while `process.sh` handles scheduling.

1. Initialize WorkRequest from PEB and Intent.
2. `Expand()`: Execute PASS 1, 2, and 3. Produce branched DAG.
3. `Reduce()`: Execute PASS 3.6. Resolve constraints algebraically.
4. Execute terminal nodes materialized from Reduction.
5. Apply PASS 4 Convergence Checks. If converged, exit. If not, feed derived state back into `Expand()`.
