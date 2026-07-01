# Harvested Specification & Code Repository

**Source:** `IRL IR Interaction System.html` (Bulk Export — IRL/IR bridge, 5-phase architecture, reference implementation, golden trace system)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 6 Specification Candidates extracted

---

## 1. IRL/IR Interaction Semantics — Probabilistic-to-Deterministic Bridge v0.1
**Status:** `Agreed`

### Architectural Intent
A two-layer interaction classification system: IRL (Interaction Reasoning Layer) provides probabilistic soft-label classification over interaction space, while IR (Interaction Archetypes) provides deterministic hard-constraint enforcement. IRL proposes, IR disposes.

### Requirements & Acceptance Criteria
- [ ] **IRL (Interaction Reasoning Layer)** — Probabilistic, constraint-aware semantic classification layer
  - Answers: "what kind of interaction is this?"
  - 8 probabilistic archetypes (defined in `nexus_irl_taxonomy.md`)
  - Layer A of the three-layer system
  - Acts as Bayesian observer over interaction space
  - Outputs soft labels / probability mass distribution
- [ ] **IR Interaction Archetypes (Deterministic)** — Closed contract governing how the deterministic Append-Only Object Registry (IR) is permitted to evolve
  - Answers: "what interaction contract is legally allowed?"
  - 9 deterministic archetypes: Construction, Execution, Reflection, Reconciliation, Revision, Counterfactual, Audit, Compression, Constraint Injection
  - Defined in `nexus_interaction_taxonomy.md`
  - Acts as type system over interaction space
  - Governs `AUTHORITY_GRAPH_IR.md` (the Append-Only Object Registry)
  - Enforced by `VALIDATOR_SPEC.md` (AEI validation dimensions AEI1–AEI4)
- [ ] **IRL ↔ IR Bridge Pipeline**:
  ```
  User Input → IRL (probabilistic classification: soft labels)
    → Interaction Taxonomy Resolver
    → IR (deterministic archetype selection: hard constraint)
    → Authority Graph mutation rules (VALIDATOR_SPEC)
  ```
- [ ] **Key invariant**: IRL never decides structure. It only proposes probability mass over IR types. This preserves the "closed contract" model
- [ ] **Companion taxonomies**: `terminology-audit.md` (Service Registry), `ARCHITECTURE/message-semantic-taxonomy.md` (Message semantic roles), `EVENT_GRAMMAR.md` (Event types), `VALIDATOR_SPEC.md` (F-class failure taxonomy), `mildred-datamodel-critique.md` (Typed ontology/taxonomy system)

### Harvested Code Artifacts
#### Purpose: IRL↔IR bridge pipeline
```
User Input
  → IRL (8 probabilistic archetypes, Bayesian observer)
  → Interaction Taxonomy Resolver
  → IR (9 deterministic archetypes, type system)
  → Authority Graph mutation rules (VALIDATOR_SPEC)

Key invariant: IRL proposes probability mass; IR makes hard selection.
```

### Unresolved Follow-Ups
- Do `nexus_irl_taxonomy.md` and `nexus_interaction_taxonomy.md` exist on disk?
- What are the 8 IRL archetypes specifically?

---

## 2. Five-Phase Nexus Pipeline Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
The Nexus system is a 5-phase pipeline (not the previously assumed 4 phases) spanning epistemic classification through observation. Phase 0 (IRL/IR Interaction Semantics) is the missing front-end that integrates with the existing Phase 1–3 compiler architecture.

### Requirements & Acceptance Criteria
- [ ] **Phase 0 — Interaction Semantics Layer (IRL/IR)**:
  - `nexus_irl_taxonomy.md` (probabilistic classification)
  - `nexus_interaction_taxonomy.md` (deterministic contract)
  - `VALIDATOR_SPEC.md` (enforcement gate)
  - Output: Validated Interaction Intent Vector
- [ ] **Phase 1 — Specification Compiler** (`PHASE1_SPECIFICATION_COMPILER.md`):
  - Transforms prompts into requirements or WorkRequests
  - Functions like a compiler front-end/optimizer
  - Output: WorkRequestGraph
- [ ] **Phase 1.5 — Lowering Pass** (`LOWERING_PASS.md`):
  - WorkRequestGraph → ExecutionGraph
  - Freeze boundary defined here (topology locked after validation)
  - Output: Frozen ExecutionGraph
- [ ] **Phase 2 — Execution Runtime** (`PHASE2_EXECUTION_RUNTIME.md`):
  - Takes frozen ExecutionGraph and interprets it as a program via deterministic Scheduler
  - Event stream is the verifiable causal trace
- [ ] **Phase 3 — Observation Model** (`OBSERVATION_MODEL.md`):
  - Pure projection layer over (ExecutionGraph + EventLog + ReplayState)
  - Produces derived semantic views for inspection, analysis, debugging
  - Views are ephemeral, session-bound
- [ ] **Two orthogonal axes**: Axis 1 — epistemic classification (what kind of thing is this?); Axis 2 — structural transformation (what does it become in the system?)

### Harvested Code Artifacts
#### Purpose: 5-phase pipeline
```
Phase 0: IRL/IR Interaction Semantics Layer
Phase 1: Specification Compiler (prompt → WorkRequestGraph)
Phase 1.5: Lowering Pass (WorkRequestGraph → Frozen ExecutionGraph)
Phase 2: Execution Runtime (frozen graph → deterministic scheduler → event stream)
Phase 3: Observation Model (projections over ExecutionGraph + EventLog + ReplayState)

Outputs: Intent Vector → WorkRequestGraph → Frozen ExecutionGraph → Event Stream → Ephemeral Views
```

### Unresolved Follow-Ups
- How does Phase 0 relate to the conduit-mcp plan lifecycle (proposed → planning → pending → ...)?
- Is Phase 0 implemented or aspirational?

---

## 3. Cross-Cutting System Invariants Catalog v0.1
**Status:** `Agreed`

### Architectural Intent
Six system invariants run through every spec document in the Nexus corpus. They form the architectural spine against which all component designs must be validated.

### Requirements & Acceptance Criteria
- [ ] **1. Determinism as System Invariant** — Most reused phrase in the corpus
  - "Deterministic reconstruction", "replayable", "same input always produces same output"
  - Covered by: COMPILER_ARCHITECTURE §2, PHASE1 §5, PHASE2 §9, LOWERING §7.1, EXECUTION_GRAPH §3.1, DISTRIBUTED_SCHEDULER §13, REPLAY_ENGINE §3.3, CER_CCNF §10, CCNF_FAILURE_MODES FM#4, VALIDATOR_SPEC V6, ANALYSIS §11.1
- [ ] **2. Append-Only / Immutable Event Log**
  - "Events never own truth", "append-only, immutable, referential", "events are facts"
  - Covered by: CER_SPEC §0, EVENT_GRAMMAR §1, REPLAY_ENGINE §7, DISTRIBUTED_SCHEDULER §5, COMPILER_ARCHITECTURE §5, ARCHITECTURE/messagebox-core-architecture.md, ANALYSIS §27
- [ ] **3. CER Identity Resolution (entity_key)**
  - Three-layer identity system: entity_key → collapse_key → alias_keys
  - entity_key = SHA256(canonical_entity_signature)
  - Covered by: CER_SPEC §3, CER_CCNF §4, CCNF_FAILURE_MODES FM#3, OBSERVATION_MODEL §12, DISTRIBUTED_SCHEDULER §X, REPLAY_ENGINE §17
- [ ] **4. Frozen ExecutionGraph / Freeze Invariant**
  - "Topology immutable", "no nodes added or removed after freezing"
  - Only lifecycle_state, outputs, event_refs MAY mutate
  - Covered by: LOWERING_PASS §5.11, EXECUTION_GRAPH §3.1, PHASE2 §2, COMPILER_ARCHITECTURE §4.3, VALIDATOR_SPEC S9
- [ ] **5. Snapshots as Derived Compression**
  - "Snapshots are explicitly NOT canonical truth"
  - Derived compression artifacts of CER history — deletable, regenerable
  - Triple-version lock for validity
  - Covered by: CER_SNAPSHOT_ENGINE (canonical), CER_SPEC §5, REPLAY_ENGINE §8, CER_CCNF §12, CCNF_FAILURE_MODES FM#9
- [ ] **6. Authority Graph (Append-Only Object Registry)**
  - Foundational deterministic structural graph for Nexus
  - Governed by "Closed Contract" of interaction archetypes
  - Covered by: AUTHORITY_GRAPH_IR.md, VALIDATOR_SPEC.md (AEI1–AEI4), nexus_interaction_taxonomy.md, LOWERING_PASS.md (validate_authority() pre-lowering gate)

### Harvested Code Artifacts
#### Purpose: Six system invariants
```
1. Determinism          — same input → same output (crosses all phases)
2. Append-Only Events   — events are immutable facts, never modified
3. CER Identity         — entity_key → collapse_key → alias_keys (3-layer)
4. Frozen ExecutionGraph — topology locked after freeze; only state/outputs mutate
5. Snapshots ≠ Truth    — derived compression, deletable/regenerable, triple-version lock
6. Authority Graph      — append-only object registry, closed contract of archetypes
```

### Unresolved Follow-Ups
- Are these invariants formally encoded anywhere (e.g., in tests or schema validation)?
- Is there an invariant priority / conflict resolution rule?

---

## 4. Reference Implementation — Full Pipeline Code Modules v0.1
**Status:** `Agreed`

### Architectural Intent
A complete reference implementation of the Nexus pipeline exists as a set of code modules that demonstrate the IRL → IR → WorkRequest → ExecutionGraph → CER → Replay flow. This is "the first real Nexus system, not a specification."

### Requirements & Acceptance Criteria
- [ ] **14 code modules spanning the full pipeline**:

| Module | Path | Purpose |
|--------|------|---------|
| CLI entry point | `cli/main.py` | `main(prompt)`: orchestrates full pipeline |
| IRL classifier | `irl/classifier.py` | Heuristic-based probabilistic classification (8 archetypes) |
| IR selector | `ir/selector.py` | Picks top archetype as deterministic interaction type |
| WorkRequest builder | `compiler/workrequest.py` | Builds WorkRequest from prompt + IR + intent |
| Semantic decomposition | `compiler/semantic.py` | Decomposes prompt into semantic steps |
| Lowering pass | `lowering/lowering.py` | WorkRequestGraph → ExecutionGraph with freeze |
| Execution graph schema | `schema/exgraph.py` | ExecutionGraph: nodes with id, type, inputs, deps |
| Execution runtime | `runtime/executor.py` | Deterministic simulator iterating over nodes |
| CER event writer | `cer/writer.py` | Append-only event log with timestamps |
| Replay engine | `replay/engine.py` | Pure function: `replay(events) → state` |

- [ ] **Pipeline output** (example):
  ```
  [PROMPT] create a service that validates transactions
  [IRL] {'construction': 0.6, 'execution': 0.2, ...}
  [IR] construction
  [WORKREQUEST] {...}
  [EXECUTION GRAPH] {...}
  [FINAL STATE] {'state': {'A': 'processed:construction', 'B': 'processed:validate'}, 'status': 'REPLAY_SUCCESS'}
  ```
- [ ] **Proven properties**: ✅ Deterministic pipeline spine, ✅ Append-only event log, ✅ Replayable system state, ✅ Freeze boundary exists, ✅ IRL→IR→execution flow
- [ ] **Upgrade order** (strictly sequential):
  - Phase A: Replace heuristics (real IRL vector model, structured IR selection rules)
  - Phase B: Graph correctness (real dependency scheduling, DAG enforcement)
  - Phase C: Validator centralization (single validation gate across phases)
  - Phase D: CER formal grammar (typed event schema, identity keys)
  - Phase E: Replay determinism tests (golden traces)

### Harvested Code Artifacts
#### Purpose: Pipeline code modules
```
cli/main.py               — orchestration entry point
irl/classifier.py          — probabilistic classification (8 archetypes)
ir/selector.py             — deterministic archetype selection
compiler/workrequest.py    — WorkRequest builder
compiler/semantic.py       — semantic decomposition
lowering/lowering.py       — WorkRequestGraph → Frozen ExecutionGraph
schema/exgraph.py          — ExecutionGraph schema (nodes, deps)
runtime/executor.py        — deterministic simulator
cer/writer.py              — append-only event log
replay/engine.py           — pure function replay
```

### Unresolved Follow-Ups
- Does this reference implementation exist as real code on disk?
- Where is the project root for these modules?

---

## 5. Golden Trace System — MEEP v0.2 Upgrade v0.1
**Status:** `Deferred`

### Architectural Intent
A deterministic verification layer that turns the runnable loop into a real engine by adding golden trace regression testing. "NO CHANGE IS VALID UNLESS IT PASSES GOLDEN TRACE REPLAY" becomes the system contract.

### Requirements & Acceptance Criteria
- [ ] **Structure added**:
  ```
  tests/
    golden_traces/
      trace_01.json
    test_runner.py
  validation/
    golden_compare.py
  ```
- [ ] **Golden Trace format** (`tests/golden_traces/trace_01.json`):
  ```json
  {
    "prompt": "create a service that validates transactions",
    "expected_irl": {"construction": 0.6},
    "expected_ir": "construction",
    "expected_execution_nodes": ["A", "B"],
    "expected_final_state": {"A": "processed:construction", "B": "processed:validate"}
  }
  ```
- [ ] **Comparison engine** (`validation/golden_compare.py`):
  ```python
  def compare(actual, expected):
      errors = []
      if actual["final_state"] != expected["expected_final_state"]:
          errors.append("FINAL_STATE_MISMATCH")
      if actual["ir"] != expected["expected_ir"]:
          errors.append("IR_MISMATCH")
      return {"pass": len(errors) == 0, "errors": errors}
  ```
- [ ] **Test runner** (`tests/test_runner.py`): loads golden trace, runs pipeline, compares, asserts
- [ ] **Key shift**: System is no longer "a pipeline that runs prompts" but "a system whose behavioral state is version-controlled"
  - IRL changes → testable diffs
  - Compiler changes → regression risks
  - Execution changes → observable drift
  - CER changes → audit events
- [ ] **Cardinal rule**: "NO CHANGE IS VALID UNLESS IT PASSES GOLDEN TRACE REPLAY"
- [ ] **Follow-on phases after golden trace stability**:
  - Phase 3: Determinism Hardening (structured IRL vectors, IR schema, formal DAG ordering, strict validator gates)
  - Phase 4: CER Formalization (typed events, identity_key, dedup, replay equivalence proofs)
  - Phase 5: System Scaling (distributed replay, snapshot compression, observation model)

### Harvested Code Artifacts
#### Purpose: Golden trace test structure
```
tests/
  golden_traces/trace_01.json   — canonical expected output
  test_runner.py                 — loads trace, runs pipeline, compares
validation/
  golden_compare.py              — comparison engine (final_state, ir match)

Invariant: NO CHANGE IS VALID UNLESS IT PASSES GOLDEN TRACE REPLAY
```

### Unresolved Follow-Ups
- Has the golden trace system been implemented?
- Are there golden traces for the conduit-mcp pipeline?

---

## 6. Nexus Spec Document Catalog — Cross-Reference Map v0.1
**Status:** `Agreed`

### Architectural Intent
The Nexus system comprises a large corpus of interconnected spec documents. This is a cross-reference catalog linking each concept to its defining documents.

### Requirements & Acceptance Criteria
- [ ] **Specification Compiler (Phase 1)** — `PHASE1_SPECIFICATION_COMPILER.md` (canonical), `COMPILER_ARCHITECTURE.md` (Phase 1 in 4-phase arch), `WORKREQUEST_SPEC.md` (output), `LOWERING_PASS.md` (Phase 1.5 input), `EXECUTION_GRAPH_SCHEMA.md` (produces WorkRequestGraph), `OBSERVATION_MODEL.md` (pipeline), `ANALYSIS/operator-plane-gap-analysis.md` (reference)
- [ ] **Execution Runtime (Phase 2)** — `PHASE2_EXECUTION_RUNTIME.md` (canonical), `COMPILER_ARCHITECTURE.md`, `EXECUTION_GRAPH_SCHEMA.md`, `LOWERING_PASS.md`, `VALIDATOR_SPEC.md` (R1–R10), `DISTRIBUTED_SCHEDULER.md`, `REPLAY_ENGINE.md`
- [ ] **Observation Model (Phase 3)** — `OBSERVATION_MODEL.md` (canonical), `COMPILER_ARCHITECTURE.md`, `REPLAY_ENGINE.md`, `EXECUTION_GRAPH_SCHEMA.md`, `EVENT_GRAMMAR.md`, `CER_SPEC.md`
- [ ] **Authority Graph** — `AUTHORITY_GRAPH_IR.md` (canonical), `VALIDATOR_SPEC.md` (AEI1–AEI4), `nexus_interaction_taxonomy.md`, `LOWERING_PASS.md` (validate_authority)
- [ ] **Distributed Scheduler** — `DISTRIBUTED_SCHEDULER.md` (canonical), `PHASE2_EXECUTION_RUNTIME.md`, `EXECUTION_GRAPH_SCHEMA.md`, `VALIDATOR_SPEC.md` (R2, R3, R8), `CER_SPEC.md`, `REPLAY_ENGINE.md`
- [ ] **CER System** — `CER_SPEC.md`, `CER_CCNF.md`, `CER_SNAPSHOT_ENGINE.md`, `CCNF_FAILURE_MODES.md`, `EVENT_GRAMMAR.md`, `REPLAY_ENGINE.md`

### Harvested Code Artifacts
#### Purpose: Document cross-reference map
```
Phase 1:  PHASE1_SPECIFICATION_COMPILER → COMPILER_ARCHITECTURE → WORKREQUEST_SPEC → LOWERING_PASS → EXECUTION_GRAPH_SCHEMA
Phase 2:  PHASE2_EXECUTION_RUNTIME → EXECUTION_GRAPH_SCHEMA → VALIDATOR_SPEC → DISTRIBUTED_SCHEDULER → REPLAY_ENGINE
Phase 3:  OBSERVATION_MODEL → REPLAY_ENGINE → EXECUTION_GRAPH_SCHEMA → EVENT_GRAMMAR → CER_SPEC
CER:      CER_SPEC → CER_CCNF → CER_SNAPSHOT_ENGINE → CCNF_FAILURE_MODES → EVENT_GRAMMAR → REPLAY_ENGINE
```

### Unresolved Follow-Ups
- Where are these spec documents physically located?
- Are they in a `docs/` directory or spread across the repo?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | IRL/IR Interaction Semantics — Probabilistic-to-Deterministic Bridge | Agreed | 8 probabilistic IRL → 9 deterministic IR archetypes; IRL proposes, IR disposes |
| 2 | Five-Phase Nexus Pipeline Architecture | Agreed | Phase 0 (IRL/IR) → Phase 1 (Spec Compiler) → Phase 1.5 (Lowering) → Phase 2 (Execution) → Phase 3 (Observation) |
| 3 | Cross-Cutting System Invariants Catalog | Agreed | Determinism, Append-Only Events, CER Identity, Frozen Graph, Snapshots, Authority Graph |
| 4 | Reference Implementation — Full Pipeline Code Modules | Agreed | 10+ code modules covering IRL→IR→WR→ExecutionGraph→CER→Replay |
| 5 | Golden Trace System — MEEP v0.2 Upgrade | Deferred | Golden trace regression testing; "no change valid without passing replay" |
| 6 | Nexus Spec Document Catalog — Cross-Reference Map | Agreed | Document dependency graph across all phases, CER, validator, scheduler |

---

*Extracted from `chats/IRL IR Interaction System.html`, 55 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
