# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/IRL IR Interaction System.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. IRL IR Interaction System — Five-Phase Pipeline: Interpretation → Structure → Execution → Observation → Identity
**Status:** `Agreed`

### Architectural Intent
Define the IRL IR Interaction System as a five-phase pipeline that flattens the interaction semantics stack into a clean, sequential model. Phase 1 (Interaction Semantics): define how prompts map to interaction types. Phase 2 (Specification Compiler): compile interaction types into structured IR. Phase 3 (Lowering Pass): freeze IR into immutable execution graphs. Phase 4 (Execution Runtime): execute frozen graphs with deterministic scheduling. Phase 5 (Observation Model): produce CER events and enable replay. Key invariants: determinism, append-only immutable event logs, CER identity resolution, frozen execution graphs, and snapshots.

### Requirements & Acceptance Criteria
- [ ] All 5 phases must be sequentially composable — output of phase N is input to phase N+1
- [ ] Determinism invariant: same input → same IRL → same IR → same execution graph → same CER
- [ ] Append-only event log: CER is authoritative ledger — no mutation, only append
- [ ] Frozen execution graphs: once lowered, the graph is immutable — execution reads frozen state
- [ ] CER identity resolution: every event must be uniquely identifiable and causally linked

### Unresolved Follow-Ups
- How does the IRL vector model (Phase A upgrade) replace heuristic-based interaction classification?
- What is the formal schema for the frozen execution graph?

---

## 2. MEEP — Minimal End-to-End Pipeline Bootstrap
**Status:** `Implemented`

### Architectural Intent
Build the Minimal End-to-End Pipeline (MEEP) as the first concrete bootstrap of the full architecture. MEEP implements: prompt → IRL (interaction realization layer) → IR (intermediate representation) → Spec Compiler → Lowering/Freeze → Scheduled Execution → CER Append → Replay. The initial implementation uses stub/heuristic components that are replaced in later phases. This proves the execution loop before adding complexity — the system runs end-to-end with deterministic replay from day one.

### Requirements & Acceptance Criteria
- [ ] MEEP must execute the full prompt-to-replay loop
- [ ] All stubs must have defined replacement paths (IRL stub → vector model, scheduler → DAG enforcement)
- [ ] Deterministic replay must work from the first implementation
- [ ] Zero external dependencies — self-contained pipeline

### Unresolved Follow-Ups
- What is the formal CER event schema for Phase D?
- How are golden traces versioned as the pipeline evolves?

---

## 3. Golden Trace Test Harness — Behavioral Contract Locking for Regression Safety
**Status:** `Proposed`

### Architectural Intent
Add a deterministic verification layer on top of MEEP using golden traces. A golden trace captures the canonical expected output for a given input: prompt → expected IRL → expected IR → expected execution nodes → expected final state. The comparison engine validates actual vs expected at each stage. Test runner replays golden traces and asserts pass/fail. Key invariant: NO CHANGE IS VALID UNLESS IT PASSES GOLDEN TRACE REPLAY. This turns the pipeline from 'runs prompts' to 'behavioral state is version-controlled'.

### Requirements & Acceptance Criteria
- [ ] Golden trace format: prompt, expected_irl, expected_ir, expected_execution_nodes, expected_final_state
- [ ] Capture function: run pipeline normally, record output as golden trace
- [ ] Comparison engine: compare actual vs expected at each stage, return pass/fail + error list
- [ ] Test runner: load golden trace, run pipeline, compare, assert pass
- [ ] Invariant: no change is valid unless it passes golden trace replay

### Harvested Code Artifacts
#### Purpose: Golden trace format — canonical expected output
```json
{
  "prompt": "create a service that validates transactions",
  "expected_irl": { "construction": 0.6 },
  "expected_ir": "construction",
  "expected_execution_nodes": ["A", "B"],
  "expected_final_state": {
    "A": "processed:construction",
    "B": "processed:validate"
  }
}
```

### Unresolved Follow-Ups
- How many golden traces are needed for adequate coverage — one per interaction type?
- What is the golden trace versioning strategy as the pipeline evolves through phases?

---

## 4. Phase A-E Upgrade Path — From Stub Pipeline to Production Engine
**Status:** `Proposed`

### Architectural Intent
Define the ordered upgrade path from MEEP stubs to production-grade pipeline. Phase A: replace IRL heuristic with real vector model and structured IR selection rules. Phase B: replace naive scheduler with real dependency scheduling and DAG enforcement. Phase C: centralize validation into a single gate across all phases. Phase D: formalize CER with typed event schema and identity keys. Phase E: implement replay determinism tests with golden traces. The order is strict: each phase builds on the stability of the previous one.

### Requirements & Acceptance Criteria
- [ ] Phase A: real IRL vector model — probabilistic interaction classification instead of heuristic matching
- [ ] Phase B: dependency scheduling — topological execution with DAG cycle detection
- [ ] Phase C: single validation gate — one validator across interpretation, compilation, and execution
- [ ] Phase D: CER formal grammar — typed events (Event<T>), identity keys, deduplication rules
- [ ] Phase E: replay determinism — golden traces verified on every change

### Unresolved Follow-Ups
- What is the IRL vector model — embedding-based similarity or rule-based classification?
- How does the single validation gate compose rules from different phases without creating a monolith?

---
