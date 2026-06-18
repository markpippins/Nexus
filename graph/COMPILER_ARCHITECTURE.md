>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# WorkRequest Compiler — Architecture

## Purpose

This document describes the internal architecture of the **WorkRequest Compiler**, the system responsible for transforming structured development intent into deterministic AI-driven implementation.

Where `README.md` explains *what* the compiler is, this document explains *how it works*.

---

# 1. Architectural Model

The WorkRequest Compiler follows a **four-phase compiler + runtime + introspection architecture**:

```
Phase 1: Specification Compiler (Intent Front-End)
  Prompt → Requirements → WorkRequests → WorkRequestGraph

Phase 1.5: Lowering Compiler (Middle-End)
  WorkRequestGraph → ExecutionGraph

Phase 2: Execution Runtime (Back-End)
  ExecutionGraph → Scheduler → Events → Outputs

Phase 3: Observation Layer (Introspection)
  EventLog + ExecutionGraph → Replay → Interpretation → View AST
```

Each phase has strict responsibilities. The boundaries between them are stable, versioned intermediate representations:

| Boundary | IR | Direction |
|---|---|---|
| Phase 1 → Phase 1.5 | WorkRequestGraph (intent IR) | Abstract → Concrete |
| Phase 1.5 → Phase 2 | ExecutionGraph (executable AST) | Frozen → Interpreted |
| Phase 2 → Phase 3 | EventLog + ExecutionGraph + ReplayState | Executed → Derived |

### 1.1 Layer Architecture

The system is organized into three architectural layers with strict separation:

```
CONTROL PLANE (pre-pipeline compiler infrastructure)
  PIPELINE_INTENT.yaml ──→ normalize-intent ──→ ExecutionState ──→ mode-router
  - Not a pipeline phase
  - Pipeline stages begin only after ExecutionState is produced
  - normalize-intent is the exclusive owner of intent interpretation

EXECUTION PIPELINE (Phases 1 → 1.5 → 2)
  Phase 1:   Specification Compiler
  Phase 1.5: Lowering Compiler
  Phase 2:   Execution Runtime
  - All phases operate within the context established by the control plane

OBSERVATION LAYER (Phases 3 → ...)
  Replay Engine → Observation Engine → View AST
  - Pure read-only projection over execution history
  - Does not participate in execution or compilation
```

| Layer | Responsibility | Components |
|---|---|---|
| **Control Plane** | Pre-pipeline compiler infrastructure — validates intent, derives ExecutionState, routes | `normalize-intent`, `mode-router`, `pipeline-intent` |
| **Execution Pipeline** | Builds and executes computation from ExecutionState | Phases 1, 1.5, 2 |
| **Observation Layer** | Interprets execution history without affecting it | Replay Engine, Observation Engine |

**Global invariant**: Pipeline stages begin ONLY after ExecutionState is produced. normalize-intent is NEVER a pipeline stage. mode-router is NEVER a pipeline stage.

---

# 2. System Invariant

```
Artifacts = System State
Events = Causal Trace over Artifact transitions
Graphs = Interpretations of Artifacts + Events
```

- **Artifacts** (`PROMPT_RECORDS`, `RESPONSE_RECORDS`, `WORKREQUESTS`, etc.) are authoritative state
- **Events** are a derived, append-only, reconstructible causal index — they never own truth
- **Graphs** (RequirementGraph, WorkRequestGraph, ExecutionGraph) are interpretations derived from artifacts and events

---

# 3. Phase 1: Specification Compiler

## 3.1 Purpose

Deterministically transform unstructured user intent into structured, auditable WorkRequests. No execution occurs here.

## 3.2 Stages

| Stage | Input | Output |
|---|---|---|
| Prompt Ingestion | User prompt | `PROMPT_RECORDS/{id}`, `PromptSubmitted` event |
| Requirement Extraction | Prompt artifact | `REQUIREMENTS/{id}`, `RequirementCreated/Refined/Validated` events |
| WorkRequest Generation | Requirement graph | `WorkRequestGraph` (IR-2), `WorkRequestCreated` event |

## 3.3 Constraints

- No execution of any kind
- No side effects beyond artifact creation
- Fully deterministic and replayable
- May include refinement loops (merge, split, validate)

## 3.4 Output

The single handoff artifact to Phase 2 is the **WorkRequestGraph** (IR-2).

See [`PHASE1_SPECIFICATION_COMPILER.md`](./PHASE1_SPECIFICATION_COMPILER.md) for the full specification.

---

# 4. Phase 1.5: Lowering Compiler

## 4.1 Purpose

Transform the abstract WorkRequestGraph into the concrete, executable ExecutionGraph (runtime AST). Lowering is a deterministic compiler pass — it selects executors, expands lifecycles, projects dependencies, resolves data channels, and initializes runtime state.

## 4.2 Stages

| Stage | Input | Output |
|---|---|---|
| Validate | WorkRequestGraph | Validated IR or LoweringError |
| Select executors | WR capabilities | `ExecutorSelection` per WR |
| Expand nodes | Each WR | `[Prepare, Execute, Finalize]` nodes |
| Project dependencies | WR edges | ExecutionNode edges |
| Resolve data channels | Data edges | Explicit artifact paths |
| Lower constraints | Declarative constraints | `SchedulingHints` |
| Assemble | All nodes + edges | Frozen `ExecutionGraph` |

## 4.3 Constraints

- Fully deterministic — same input always produces same output
- No execution of any kind
- No side effects beyond event emission and the ExecutionGraph artifact
- The output ExecutionGraph must be frozen (topology immutable)

## 4.4 Output

- Frozen `ExecutionGraph` — all nodes in `pending` state with executors selected
- Lowering event trace (`ExecutionGraphCreated`, `ExecutorSelected`, `ExecutionNodeGenerated`, `DependencyLowered`, `LoweringComplete`)

See [`LOWERING_PASS.md`](./LOWERING_PASS.md) for the full specification.

---

# 5. Phase 2: Execution Runtime

## 5.1 Purpose

Interpret the frozen ExecutionGraph as a program. The Scheduler is a deterministic AST interpreter — it evaluates readiness, acquires executors, dispatches work, processes runtime events, and produces a verifiable causal trace.

## 5.2 Stages

| Stage | Input | Output |
|---|---|---|
| Acquire executors | ExecutionGraph with `executor_selection` | `BoundExecution` per ready node |
| Interpret | Scheduled ExecutionGraph | Node lifecycle transitions |
| Produce trace | All transitions | Event stream + artifacts |

## 5.3 Constraints

- Must not reinterpret Phase 1 intent
- Must not re-select executors (lowering selects, scheduler acquires)
- Every lifecycle transition must emit an event
- Faults are graph nodes (FailureNode), not runtime exceptions

## 5.4 Output

- Completed `ExecutionGraph` (all nodes terminal)
- Full Execution Event DAG (reconstructible causal chain)
- `RESPONSE_RECORDS` / output artifacts

See [`PHASE2_EXECUTION_RUNTIME.md`](./PHASE2_EXECUTION_RUNTIME.md) for the full specification.

---

# 5. Event System

Events form the causal spine of the system. They are:

- **Append-only**: never modified after emission
- **Referential**: point to artifacts, do not duplicate them
- **Domain-partitioned**: `Specification`, `Lowering`, `Execution`, `System`
- **Reconstructible**: can be rebuilt from artifacts if the event log is lost
- **Not authoritative**: artifacts are the source of truth

### 5.1 Observation Views

Phase 3 introduces an **Observation View AST** which is explicitly NOT part of the event system. Views are ephemeral semantic interpretations derived from EventLog + ExecutionGraph + ReplayState.

```
ObservationView ≠ Event
ObservationView ∉ EventLog
ObservationView.lifetime ≤ session
```

See [`OBSERVATION_MODEL.md`](./OBSERVATION_MODEL.md) for the full specification.

See [`EVENT_GRAMMAR.md`](./EVENT_GRAMMAR.md) for the full event grammar, type system, and structural rules.

---

# 6. Pipeline Structure

The system has four canonical pipeline definitions and a registry:

| File | Role |
|---|---|
| `skill-pipeline.specification.json` | Phase 1 stages |
| `skill-pipeline.execution.json` | Phase 1.5 + Phase 2 stages |
| `skill-pipeline.observation.json` | Phase 3 stages |
| `skill-pipeline.json` | Registry — routes to pipeline files |

---

# 7. Component Overview

| Component | Layer | Role |
|---|---|---|
| `executor.py` | All | Compiler frontend & orchestration |
| `process.sh` | Execution Pipeline | Runtime executor |
| `normalize-intent` | **Control Plane** | **Exclusive owner of ExecutionState derivation — validates PIPELINE_INTENT.yaml, enforces R1–R5, emits canonical ExecutionState** |
| `mode-router` | **Control Plane** | **Pure router — consumes canonical ExecutionState, selects execution pipeline. No YAML interpretation, no schema, no derivation.** |
| `pipeline-intent` | **Control Plane** | **Authors PIPELINE_INTENT.yaml from user context and project analysis** |
| Specification skills | Execution Pipeline (Phase 1) | Compiler passes (archive-prompt, requirements-capture, work-request-emission) |
| Lowering skills | Execution Pipeline (Phase 1.5) | Compiler pass (execution-lowering) |
| Execution skills | Execution Pipeline (Phase 2) | Runtime passes (execution-scheduler, executor-binding, execution-runner, distributed-coordination) |
| Replay skills | Observation Layer | Temporal reconstruction (event-replay) |
| Observation skills | Observation Layer (Phase 3) | Semantic interpretation (observation-engine) |
| Validator skills | Cross-cutting | Static (S1–S10) + Runtime (R1–R10) + **Authority Graph (AEI1–AEI4)** — pre-lowering existence gate (executiongraph-validator) |
| WorkRequestGraph | Boundary 1→1.5 | Handoff artifact |
| ExecutionGraph | Boundary 1.5→2 | Handoff artifact |
| EventLog | Boundary 2→3 | Handoff artifact |

---

# 8. Execution Lifecycle (End-to-End)

```
Pre-step (Control Plane):
 0. normalize-intent validates PIPELINE_INTENT.yaml (R1–R5), derives canonical ExecutionState
 0a. mode-router routes ExecutionState → execution pipeline selection
 0b. validate_authority(system) — compile-time existence gate
     checks AEI1–AEI4 against system component graph
     FATAL violation → abort, no lowering permitted

Pipeline lifecycle:
 1. Prompt submitted → Phase 1 starts
 2. Requirements extracted from prompt
 3. WorkRequestGraph emitted (handoff to Phase 1.5)
 4. Phase 1.5 receives WorkRequestGraph
 5. Validate: acyclic, capabilities known, inputs satisfiable
 6. Lower: select executors, expand [Prepare, Execute, Finalize], project dependencies
 7. Static validator: validate structural soundness (S1–S10). Halt on ERROR/FATAL.
 8. ExecutionGraph emitted (frozen, handed to Phase 2)
 9. Phase 2 receives ExecutionGraph
10. Scheduler tick loop: evaluate readiness, claim nodes (distributed), acquire executors, [HAEC permission projection → AuthorityResult], dispatch, observe, [runtime validator R1–R10], transition
11. All nodes terminal (SUCCEEDED | FAILED | SKIPPED | BLOCKED)
12. ExecutionGraphCompleted event emitted
13. Outputs produced (RESPONSE_RECORDS, artifacts)
14. EventLog complete (append-only, immutable)
15. Replay Engine: fold events → reconstruct state at any point
16. Debugger: inspect, causal trace, dependency chain
17. Checkpoints cached for fast incremental replay
18. Observation Engine: project semantic views from (ExecutionState + EventLog + ExecutionGraph)
19. View AST emitted (ephemeral) → UI / CLI / analytics
```

A WorkRequest may execute multiple times. The compiler supports incremental re-execution.

---

# 9. State Management

State is stored locally within each pipeline workspace:

```
.pipeline/
  PROMPT_RECORDS/
  RESPONSE_RECORDS/
  WORKREQUESTS/
  EVENTS/
    Specification/
    Execution/
    System/
```

Design principle: state lives with work, not tooling.

### 9.1 Observation Views

Phase 3 views are explicitly **not stored** in `.pipeline/`. They are ephemeral, session-bound projections derived from event log + execution graph + replay state. See [`OBSERVATION_MODEL.md`](./OBSERVATION_MODEL.md).

---

# 10. Project Root Resolution

The compiler must:
- Detect repository root
- Detect subproject boundaries
- Resolve artifact locations
- Replicate pipeline structure correctly

---

# 11. Failure Philosophy

Failures are expected and must be recoverable.

Required properties:
- Rerunnable execution
- Append-only records
- No destructive overwrites
- Deterministic restart

The compiler behaves more like `git` than a script. Failures are events, not exceptions.

---

# 12. Guiding Architectural Principle

Traditional development separates:
- planning
- implementation
- documentation

The WorkRequest Compiler unifies them into a three-layer architecture with five execution phases:

```
CONTROL PLANE (pre-pipeline compiler infrastructure)
  PIPELINE_INTENT.yaml ──→ normalize-intent ──→ ExecutionState ──→ mode-router
  - Pipeline stages begin only after ExecutionState is produced
  - normalize-intent is exclusive owner of intent interpretation
  - mode-router is a pure router, not an interpreter

EXECUTION PIPELINE (Phases 1 → 1.5 → 2)
  Phase 1: Intent Compiler (intent → structure)
      ↓
  WorkRequestGraph (stable IR)
      ↓
  Phase 1.5: Lowering Compiler (structure → executable program)
      ↓
  ExecutionGraph (frozen AST)
      ↓
  Phase 2: Runtime Interpreter (program → execution → trace)
      ↓
  EventLog (append-only truth)
      ↓
  Replay Engine (temporal reconstruction → past state)

OBSERVATION LAYER (Phase 3)
  Phase 3: Observation Engine (semantic interpretation → View AST)
      ↓
  UI / CLI / Analytics / Debug Tools
```

> **Thinking, building, verifying, and recording become one continuous compilation process.**

---

## 13. Validator Integration

The ExecutionGraph Validator is a cross-cutting component with two entry points:

| Lane | Entry Point | Called By | Effect on Failure |
|---|---|---|---|
| Static | `validate_static(graph)` | Lowering pass (after assembly, before freeze) | Abort compilation — no ExecutionGraph emitted |
| Runtime | `validate_runtime(event, node, state)` | Scheduler tick loop (before commit) | Block transition or inject FailureNode |

Validation is not a phase or stage — it is a hard enforcement gate embedded within existing stages. See [`VALIDATOR_SPEC.md`](./VALIDATOR_SPEC.md) for the full specification.

---

**Status:** Active Design
**Priority:** Stability before abstraction
