# Harvested Specification & Code Repository

**Source:** `LOSM Architecture Assessment.html`
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 7 Specification Candidates extracted

---

## 1. LOSM Package Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
Define the package structure of the LOSM (Language-Oriented State Machine) system after its monolithic-to-modular split. Five packages with strict one-directional dependencies, forming a three-layer architecture.

### Requirements & Acceptance Criteria
- [ ] **losm-ir** — Zero dependencies (pure Pydantic + dataclasses). Contains Graph, Node, Edge, TraceOutput, TraceFamily, ConstraintViolation, all IR models (Plan, Spec, Execution, Validation, Critique, WorkRequest), WorkflowState
- [ ] **losm-kernel** — Depends only on losm-ir. Contains fixed-point engine, morphism composition, constraint system, TBEL, TESL. No persistence, no HTTP, no orchestration
- [ ] **losm-shell** — Depends on losm-kernel + losm-ir. Contains DAGExecutor, PipelineCoordinator, PlanCompiler, StepHandler protocol. Orchestration-only — no business logic
- [ ] **losm-store** — Depends on losm-ir + losm-shell originally; refactored to depend only on losm-ir after validate_transition move. Contains SQLAlchemy models, session, repository, receipt ingestor, branch manager
- [ ] **losm-host** — Depends on losm-shell + losm-store. Thin FastAPI server. All business logic delegated to lower layers
- [ ] All dependency arrows must point in one direction — nothing in a lower layer may know about a higher layer
- [ ] No upward imports, no hidden backdoors, no cyclic "just this one helper" exceptions

### Harvested Code Artifacts
#### Purpose: Package dependency graph
```
losm-ir       ← no dependencies (pure Pydantic + dataclasses)
    ↑
losm-kernel   ← depends on losm-ir only
    ↑
losm-shell    ← depends on losm-kernel + losm-ir
losm-store    ← depends on losm-ir only (after refactor)
    ↑
losm-host     ← depends on losm-shell + losm-store
```

### Unresolved Follow-Ups
- None — package structure is settled.

---

## 2. LOSM Transition Validation Contract v0.1
**Status:** `Agreed`

### Architectural Intent
Define where transition validation logic lives in the LOSM architecture. The key insight: validation rules are not "shell behavior" or "store behavior" — they are shared semantic constraints of the system and belong in the IR layer. Shell owns rules, Store owns facts, validation is a shared semantic constraint.

### Requirements & Acceptance Criteria
- [ ] `validate_transition()` must live in `losm_ir/transition.py`, not in any shell or store package
- [ ] `ValidationResult`, `VALID_TRANSITIONS`, `validate_transition()`, and `TransitionError` are all IR-level constructs
- [ ] The store must import validation from `losm_ir` — zero imports from `losm_shell` are permitted in losm-store
- [ ] Validation is a pure function — table lookup with no I/O — and must remain so
- [ ] Store→shell dependency MUST be eliminated; it is a topological violation

### Harvested Code Artifacts
#### Purpose: Validation module home
```python
# losm_ir/transition.py
ValidationResult, VALID_TRANSITIONS, validate_transition(), TransitionError
```

#### Purpose: Invariant declaration
```text
Shell owns rules, Store owns facts, coordination = shell
Validation = shared semantic constraint of the system, rooted in IR
```

### Unresolved Follow-Ups
- None — validated and resolved via Plans 0024–0026.

---

## 3. LOSM KernelStepHandler Pattern v0.1
**Status:** `Agreed`

### Architectural Intent
Define the StepHandler protocol that separates topology from semantics in the LOSM execution pipeline. The DAGExecutor is a topology engine (knows WHAT order to execute steps). The StepHandler is a semantics engine (knows HOW to execute each step). This separation prevents the system from collapsing into "workflow spaghetti."

### Requirements & Acceptance Criteria
- [ ] **DAGExecutor** = topology engine — responsible for traversal order, dependency resolution, DAG structure. Never knows what a step means
- [ ] **StepHandler** = semantics engine — receives a step and executes it. Never knows about DAG structure
- [ ] **NullStepHandler** — preserves current behavior while establishing the protocol boundary. Default in PipelineCoordinator
- [ ] **KernelStepHandler** — calls into losm-kernel via kernel.apply (morphism dispatch) and kernel.run (program dispatch). 9 tests covering dispatch, transformation, error handling, and cross-call state persistence
- [ ] The `StepHandler` protocol must be an abstract interface that `NullStepHandler` and `KernelStepHandler` both implement
- [ ] `PipelineCoordinator.coordinate()` must accept a `StepHandler` parameter to allow swapping at runtime

### Harvested Code Artifacts
#### Purpose: StepHandler protocol
```python
class StepHandler(Protocol):
    def handle_step(self, step: Step) -> StepResult: ...
```

#### Purpose: KernelStepHandler dispatch
```python
KernelStepHandler:
  - morphism dispatch: kernel.apply(morphism, graph)
  - program dispatch: kernel.run(program, graph)
  - 9 tests: dispatch, transformation, error handling, cross-call state persistence
```

### Unresolved Follow-Ups
- PipelineCoordinator still defaults to NullStepHandler — wiring it for KernelStepHandler is the next activation step.

---

## 4. LOSM State Ontology v0.1
**Status:** `Agreed`

### Architectural Intent
Define the relationship between WorkStatus (operational granularity, 11 states) and WorkflowState (semantic compression, 9 states). These are NOT duplicates — they are a projection relationship. WorkStatus = execution reality (pipeline granularity), WorkflowState = system understanding (semantic compression).

### Requirements & Acceptance Criteria
- [ ] WorkStatus (11 states) — the canonical state enum used by the DB column and transition table. Contains detailed pipeline states
- [ ] WorkflowState (9 states: PLAN_DONE, CRITIQUED, SPEC_READY, etc.) — semantic compression of WorkStatus states
- [ ] Mapping is many-to-one: 11 WorkStatus → 9 WorkflowState
- [ ] A `work_status_to_phase()` projection function maps from WorkStatus to WorkflowState
- [ ] Both enums are maintained — they serve different purposes (operational vs semantic)
- [ ] Ontology documented at `losm-ir/docs/state-ontology-analysis.md` (236 lines)

### Harvested Code Artifacts
#### Purpose: State ontology analysis
```
236-line ontology document at losm-ir/docs/state-ontology-analysis.md
Mapping: 11 WorkStatus → 9 WorkflowState (many-to-one)
work_status_to_phase() projection function added
```

#### Purpose: Mental model
```
WorkStatus ──projection──► WorkflowState
NOT: WorkStatus == WorkflowState (these are not duplicates)
WorkStatus = operational granularity (execution reality)
WorkflowState = semantic compression (system understanding)
```

### Unresolved Follow-Ups
- None — analyzed and documented under Plan 0025.

---

## 5. LOSM Layer Invariants v0.1
**Status:** `Agreed`

### Architectural Intent
Define the invariants that govern the LOSM layer architecture. These are the "no-go" rules that prevent architectural drift. A topological correction (like eliminating the store→shell dependency) is not an incremental improvement — it is a structural fix that prevents systemic degradation.

### Requirements & Acceptance Criteria
- [ ] **No upward imports** — a lower layer must never import from a higher layer
- [ ] **No hidden backdoors** — no "just this one helper" cyclic exceptions
- [ ] **No "borrowed" validation** — validation logic must not be borrowed across layers; it must be rooted at its correct level
- [ ] **Kernel = mathematical layer** — no persistence, no HTTP, no orchestration, only semantic transformations
- [ ] **Shell = orchestration-only** — StepHandler protocol prevents shell from knowing step semantics
- [ ] **Thin host** — FastAPI server delegates all business logic to lower layers; may call any layer below it
- [ ] A topological correction (e.g., store→shell dependency eliminated) is a structural fix, not an incremental improvement

### Harvested Code Artifacts
#### Purpose: Invariant declaration
```python
# Architectural invariants:
# 1. No upward imports
# 2. No hidden backdoors
# 3. Validation rooted in IR
# 4. Kernel = mathematical layer (no persistence, HTTP, orchestration)
# 5. Shell = orchestration-only
# 6. Thin host delegates to all layers below
```

### Unresolved Follow-Ups
- How to enforce these invariants automatically (lint rules, CI checks)?
- Cross-layer dependency monitoring mechanism?

---

## 6. LOSM Kernel Isolation Contract v0.1
**Status:** `Agreed`

### Architectural Intent
Define what the kernel is and is not. The kernel is a replaceable computation core — a mathematical layer that performs semantic transformations. It must never contain persistence, HTTP, orchestration, or any I/O. This isolation is what enables the kernel to be swapped, tested in isolation, and formally verified.

### Requirements & Acceptance Criteria
- [ ] Kernel has zero awareness of: persistence, HTTP, orchestration, application state, external services
- [ ] Kernel depends only on losm-ir for Graph, Node, Edge, ConstraintViolation, TraceOutput, TraceFamily, trace_hash
- [ ] Kernel exposes: fixed-point engine, morphism composition, constraint system, TBEL (Trace-Based Expression Language), TESL (Trace-Based Strategy Language)
- [ ] `storage.py` and `runtime.py` must NOT exist in the kernel package — they were removed as part of the split
- [ ] Kernel operations: `kernel.apply(morphism, graph)`, `kernel.run(program, graph)`, `kernel.validate_graph(graph)` (added to fix broken route)
- [ ] types.py in kernel re-exports from `losm_ir.graph` — kernel uses IR's graph types, does not define its own

### Harvested Code Artifacts
#### Purpose: Kernel interface
```python
class LOSMKernel:
    def apply(self, morphism: Morphism, graph: Graph) -> Graph: ...
    def run(self, program: Program, graph: Graph) -> TraceOutput: ...
    def validate_graph(self, graph: Graph) -> ValidationResult: ...  # added for route fix
```

#### Purpose: Kernel dependency rule
```python
# losm-kernel depends ONLY on losm-ir
# NO: persistence, HTTP, orchestration, I/O, application state
# YES: fixed-point engine, morphism composition, constraints, TBEL, TESL
```

### Unresolved Follow-Ups
- Formal verification strategy for kernel correctness?
- Performance benchmarks for morphism composition at scale?

---

## 7. LOSM Ingestion Governance v0.1
**Status:** `Agreed`

### Architectural Intent
Define how receipts are ingested into the LOSM store, including validation gates and governance events. The ingestion path now respects the validation boundary — it calls validate_transition before mutating state and emits a RECEIPT_REJECTED governance event for invalid transitions. The bypass fallback that previously existed is eliminated.

### Requirements & Acceptance Criteria
- [ ] Ingestion path must call `validate_transition()` BEFORE mutating any state
- [ ] Invalid transitions must emit a `RECEIPT_REJECTED` governance event
- [ ] No bypass fallback for invalid transitions — they must be rejected unconditionally
- [ ] Valid transitions proceed to state mutation in the store
- [ ] The Branch and BranchArtifact models support multi-branch ingestion

### Harvested Code Artifacts
#### Purpose: Ingestion validation gate
```python
# Ingestor flow:
# 1. validate_transition(receipt)  ← from losm_ir.transition
# 2. If invalid → emit RECEIPT_REJECTED governance event → reject
# 3. If valid → mutate state in store → persist
```

### Unresolved Follow-Ups
- Governance event schema for RECEIPT_REJECTED?
- Branch conflict resolution during concurrent ingestion?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | LOSM Package Architecture | Agreed | 5-package structure with strict one-directional deps |
| 2 | Transition Validation Contract | Agreed | Validation belongs in IR, not shell or store |
| 3 | KernelStepHandler Pattern | Agreed | DAGExecutor/StepHandler topology/semantics separation |
| 4 | State Ontology | Agreed | WorkStatus→WorkflowState projection model (11→9) |
| 5 | Layer Invariants | Agreed | No-go rules preventing architectural drift |
| 6 | Kernel Isolation Contract | Agreed | Kernel = mathematical layer, no I/O/orchestration |
| 7 | Ingestion Governance | Agreed | Validation gate + RECEIPT_REJECTED event |

---

*Extracted from `chats/LOSM Architecture Assessment.html`, 33 chunks processed. Rover pipeline: BS4 → chunk → architect extraction → compiled.*
