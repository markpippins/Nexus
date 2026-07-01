# Harvested Specification & Code Repository

**Source:** `Model Verification Migration.html` (Bulk Export — Vector State Model, Three-Gate Admission, Commit Policy)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 5 Specification Candidates extracted

---

## 1. Vector Three-Gate Admission Model v0.1
**Status:** `Agreed`

### Architectural Intent
Vector defines a "front door" admission control system for cognitive models. Every model must pass through three verification gates before becoming part of the cognition system. This normalizes heterogeneous models into a homogeneous execution surface — "heterogeneous inside, homogeneous at the boundary."

### Requirements & Acceptance Criteria
- [ ] **Vector is NOT**: a model registry, a router, or a UI layer
- [ ] **Vector IS**: a controlled entry surface into a multi-model cognition substrate — "access control to cognitive execution space"
- [ ] **Three-Gate Admission**:
  1. **Shape Gate** (Representation Compatibility): AST/prompt structure layer. Does the model require structured IR? Does it degrade under flat prompts? Does it need staged decomposition? → Determines: *how cognition must be shaped to enter the system*
  2. **Execution Gate** (Runtime Affinity): CLI/parameter tuning layer. Temperature sensitivity, context handling, stop-token behavior, determinism stability → Determines: *how cognition must be run to remain stable*
  3. **Verification Gate** (BP Canonical Suite): Deterministic WorkRequest test. Pass/fail against canonical intent, reproducibility, regression consistency → Determines: *whether cognition is allowed to exist in the system at all*
- [ ] **Key consequence**: Once a model passes the door → Nebula doesn't care how it works internally, WorkRequests don't care about its quirks, BP only cares about deterministic output alignment
- [ ] **Architectural pattern**: heterogeneous inside, homogeneous at the boundary
- [ ] **The subtle shift**: System is no longer "supporting multiple models" — it's defining a compilation pipeline for cognition into a canonical execution format
  - AST prompts = frontend compiler IR
  - CLI params = backend runtime ABI
  - BP = test suite / CI
  - Vector = admission control system
  - Nebula = where it all materializes as state

### Harvested Code Artifacts
#### Purpose: Three-Gate Admission Model
```
Gate 1: Shape Gate   → "how cognition must be shaped to enter the system"
Gate 2: Execution Gate → "how cognition must be run to remain stable"
Gate 3: Verification Gate → "whether cognition is allowed to exist in the system at all"
```

#### Purpose: Compilation pipeline mapping
```
AST prompts = frontend compiler IR
CLI params  = backend runtime ABI
BP          = test suite / CI
Vector      = admission control system
Nebula      = materialization layer
```

### Unresolved Follow-Ups
- What does a Vector Admission Record (VAR) look like — the structured artifact representing how a model enters the cognition system?
- What is the Model Admission Policy — what qualifies as "good enough entry"?

---

## 2. Vector State Model — Five Coupled Subspaces v0.1
**Status:** `Agreed`

### Architectural Intent
Vector's state is not a single object. It is five coupled subspaces that evolve together: S(t) = ⟨World, Cognition, Execution, Models, Provenance⟩. These are unified by VectorFrame, and Vector acts as a reducer over that frame.

### Requirements & Acceptance Criteria
- [ ] **State tuple**: S(t) = ⟨World, Cognition, Execution, Models, Provenance⟩
- [ ] **1. WORLD STATE** (what "reality" currently is):
  ```json
  WorldState {
    facts: FactGraph,
    entities: EntityGraph,
    active_truths: Set<TruthAssertion>,
    contradictions: Set<Conflict>,
    last_commit_id: Hash,
    commit_frequency_policy: Policy
  }
  ```
  Key idea: "what counts as reality and how often to save it". Reality = committed fact graph snapshot. Frequency = commit policy (event-driven, time-driven, hybrid)
- [ ] **2. COGNITION STATE** (what is being thought about) — Nebula's working surface:
  ```json
  CognitionState {
    active_tasks: DAG<Task>,
    WorkRequests: Queue<WorkRequest>,
    reasoning_stacks: Map<TaskId, ReasoningTrace>,
    hypotheses: Set<Hypothesis>,
    unresolved_intents: Set<Intent>
  }
  ```
  Key idea: NOT execution. "What is currently being held in mind across the system." This is where AST prompts land
- [ ] **3. EXECUTION STATE** (what is currently running) — real-time kernel:
  ```json
  ExecutionState {
    running_jobs: Map<JobId, ExecutionHandle>,
    model_calls: Stream<ModelInvocation>,
    step_results: DAG<StepResult>,
    intermediate_outputs: Cache,
    failure_modes: EventLog
  }
  ```
  Key idea: "What is happening right now in compute space." Transient, high-frequency, disposable
- [ ] **4. MODEL STATE** (harness layer abstraction):
  ```json
  ModelState {
    registry: Map<ModelId, ModelDescriptor>,
    execution_profiles: Map<ModelId, ExecutionProfile>,
    adapters: Map<ModelId, IRAdapter>,
    verification_status: Map<ModelId, VerificationRecord>,
    capability_vectors: Map<ModelId, CapabilityEmbedding>
  }
  ```
  Key idea: Models stop being "entities" and become "compiled execution targets with ABI contracts"
- [ ] **5. PROVENANCE STATE** (truth ledger):
  ```json
  ProvenanceState {
    event_log: AppendOnlyLog<Event>,
    state_snapshots: Map<SnapshotId, VectorState>,
    derivation_graph: DAG<CauseEffect>,
    BP_verification_records: Set<VerificationRun>,
    audit_traces: Map<ActionId, Trace>
  }
  ```
  Key idea: Enables answering "why is reality this way?", "what caused this state?", "what changed between commits?"
- [ ] **Unifying object — VectorFrame**:
  ```json
  VectorFrame {
    timestamp: T,
    world: WorldState,
    cognition: CognitionState,
    execution: ExecutionState,
    models: ModelState,
    provenance: ProvenanceState
  }
  ```
- [ ] **Vector = reducer**: `VectorFrame(t+1) = reduce(VectorFrame(t), Events, WorkRequests, ModelOutputs)`

### Harvested Code Artifacts
#### Purpose: Vector State Model tuple
```
S(t) = ⟨World, Cognition, Execution, Models, Provenance⟩

VectorFrame(t+1) = reduce(VectorFrame(t), Events, WorkRequests, ModelOutputs)
```

### Unresolved Follow-Ups
- Do the five subspaces map to any existing schemas in the system?
- Is VectorFrame a formal serialization target or a conceptual model?

---

## 3. Commit Policy — Meta-State Control v0.1
**Status:** `Agreed`

### Architectural Intent
"Vector determines what counts as reality and how often to save it" — this commit policy is meta-state control separate from any individual state subspace. It determines when reality commits happen, what gets snapshotted, and the consistency model.

### Requirements & Acceptance Criteria
- [ ] **CommitPolicy is NOT inside WorldState** — it is a meta-control that governs when WorldState gets committed
- [ ] **CommitPolicy schema**:
  ```json
  CommitPolicy {
    triggers: [
      time_interval,
      execution_boundary,
      BP_verification_pass,
      cognitive_threshold_crossed
    ],
    snapshot_strategy: "incremental" | "full" | "hybrid",
    consistency_model: "strong" | "eventual" | "scoped"
  }
  ```
- [ ] **Triggers**: time_interval (periodic), execution_boundary (per-step), BP_verification_pass (success commits), cognitive_threshold_crossed (significance detection)
- [ ] **Effect**: "This is what makes your system feel 'alive' vs just logged"
- [ ] Combined with VectorFrame reducer: commit policy determines when VectorFrame snapshots are persisted

### Harvested Code Artifacts
#### Purpose: CommitPolicy schema
```json
CommitPolicy {
  triggers: [time_interval, execution_boundary, BP_verification_pass, cognitive_threshold_crossed],
  snapshot_strategy: "incremental" | "full" | "hybrid",
  consistency_model: "strong" | "eventual" | "scoped"
}
```

### Unresolved Follow-Ups
- How does CommitPolicy interact with the WRP EventEnvelope tenant model?
- Is commit policy per-tenant, per-kernel, or global?

---

## 4. Vector as Two-Phase System — Model Prep + Execution Surface v0.1
**Status:** `Agreed`

### Architectural Intent
Vector merges model preparation (CI pipeline) and runtime execution (state kernel) into one continuous surface. This makes model onboarding indistinguishable from runtime behavior tuning — "Vector is both CI pipeline and runtime kernel."

### Requirements & Acceptance Criteria
- [ ] **Phase 1: Model Preparation + Admission Layer**
  - Model discovery (Ollama scan / registry diff)
  - AST/prompt shaping strategy selection
  - CLI/runtime parameter profiling
  - Deterministic BP verification (canonical WorkRequest suite)
  - Model registration or rejection
  - Question: "Can this model safely and consistently become part of the cognition system?"
  - Equivalence: compile + link + test pipeline
- [ ] **Phase 2: Execution Surface (State Vector Runtime)**
  - Model updates a state vector
  - State vector persists across tasks
  - Execution is incremental, not stateless
  - Nebula observes/shapes that state
  - Vector = state transition engine for cognition
- [ ] **The merged loop**: Vector becomes a filter + runtime + state integrator
- [ ] **Why "front door" is insufficient**: the door never closes — admission is continuous with execution
- [ ] **Key consequence**: adding a model is not configuration — it is a change to the transition function space of the system

### Harvested Code Artifacts
#### Purpose: Two-phase Vector loop
```
Phase 1: Model Prep + Admission (compile + link + test)
  ingest WorkRequest → select model + execution strategy → run BP verification → execute transition → update state vector → persist state

Phase 2: Runtime Execution (state evolution)
  models = transition functions over state
  WorkRequests = constraints on state transitions
  BP = validity checker of transitions
  Vector = place where transitions occur
```

### Unresolved Follow-Ups
- Does the current Vector implementation actually unify these two phases, or are they still separate?
- How does the three-app split (Model/Harness, Vector Runtime, Conduit) reconcile with the unified two-phase model?

---

## 5. Vector Component Architecture — Three-App Split v0.1
**Status:** `Agreed`

### Architectural Intent
The system naturally splits into three independent applications that evolve at different velocities: Model/Harness system, Vector runtime, and Conduit orchestration layer. Each has different change cadence and ownership.

### Requirements & Acceptance Criteria
- [ ] **The split is inevitable** because each component evolves at different velocity
- [ ] **1. Model/Harness System**: ModelState becomes its own product. Handles model discovery, AST profiles, execution profiles, verification records, capability vectors
- [ ] **2. Vector Runtime**: Execution + World + Cognition core. The state transition engine. Owns VectorFrame, commit policy, and the reducer loop
- [ ] **3. Conduit (Orchestration Layer)**: Routing, UI, control surface. The human/systems interface into Vector
- [ ] **Unified understanding**:
  - Vector = reality reducer (deterministic execution substrate)
  - Nebula = cognition interface (interprets, routes, influences intent)
  - BP = truth validator (formal verifier of transitions)
  - Ollama = compute substrate (raw model execution)

### Harvested Code Artifacts
#### Purpose: Three-app split
```
1. Model/Harness System   → ModelState ([model discovery | profiles | verification])
2. Vector Runtime          → Execution + World + Cognition (reducer loop)
3. Conduit (Orchestration) → Routing, UI, control surface

Operational mapping:
  Vector  = reality reducer
  Nebula  = cognition interface
  BP      = truth validator
  Ollama  = compute substrate
```

### Unresolved Follow-Ups
- Does Conduit's current implementation already match this three-app vision, or is this aspirational?
- Where does Nebula-mcp fit — is it part of Nebula (cognition interface) or Conduit (control surface)?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Vector Three-Gate Admission Model | Agreed | Shape/Execution/Verification gates; heterogeneous→homogeneous normalization |
| 2 | Vector State Model — Five Coupled Subspaces | Agreed | S(t)=⟨World,Cognition,Execution,Models,Provenance⟩; VectorFrame reducer |
| 3 | Commit Policy — Meta-State Control | Agreed | Triggers, snapshot strategy, consistency model; "alive vs logged" |
| 4 | Vector as Two-Phase System | Agreed | Model Prep + Execution Surface merged; both CI pipeline and runtime kernel |
| 5 | Vector Component Architecture — Three-App Split | Agreed | Model/Harness, Vector Runtime, Conduit; Nebula/Vector/BP/Ollama mapping |

---

*Extracted from `chats/Model Verification Migration.html`, 16 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
