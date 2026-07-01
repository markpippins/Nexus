# Harvested Specification & Code Repository

**Source:** `Multi-Stage Semantic Compiler.html` (Bulk Export — compiler boundary map / "missing spine")
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 4 Specification Candidates extracted

---

## 1. Multi-Stage Semantic Compiler Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
The system is not just a pipeline of agents and events — it is a **multi-stage semantic compiler with strict IR transitions and governance layers**. The "missing spine" document (Pasted text(3).txt) made the phase boundaries explicit for the first time: WR IR (front-end AST) → Lowering Pass → ExecutionGraph (mid-level IR) → Phase 2 runtime, with Validator cross-cutting and CER/CCNF as event substrate.

### Requirements & Acceptance Criteria
- [ ] **Six components** of the compiler architecture:
  1. **WorkRequest IR (Intent Layer)** — front-door semantic IR. Everything begins as "intent crystallization". Lives above execution concerns. Tied to CIRS (authority constraints) and requirements capture boundary. Equivalent to LLVM front-end AST
  2. **ExecutionGraph (Runtime IR)** — lowered, executable program representation. Explicitly frozen. Consumed by Phase 2 runtime, distributed scheduler, replay engine (indirectly). Equivalent to mid-level IR / SSA-like runtime graph
  3. **Lowering Pass (Phase 1.5)** — the most important structural clarification. It is NOT "just a transformation". It is: IR boundary enforcement layer, executor selection engine, dependency resolver, channel materializer, lifecycle expander. This is the **semantic commitment point** — once here, intent is no longer fluid
  4. **Validator (Cross-cutting constraint system)** — static analyzer (S1–S10), runtime verifier (R1–R10), authority graph enforcement (AEI), permission layer (HAEC). NOT a pass — it is a global invariant system
  5. **CER + CCNF (Event substrate)** — everything becomes immutable event state. CCNF ensures deterministic identity. CER becomes the universal trace substrate. This is what makes replay, debugging, and distributed reconstruction possible without ambiguity
  6. **Replay Engine (Temporal IR interpreter)** — effectively the Temporal runtime that interprets compiled ExecutionGraph and replays from CER event history
- [ ] The system is not a pipeline — it is a **compiler with IR transitions**
- [ ] Phase boundaries are real semantic commitments — once intent crosses the Lowering Pass, it is no longer fluid

### Harvested Code Artifacts
#### Purpose: Compiler boundary map (the "missing spine")
```
1. WorkRequest IR       — Intent Layer        (front-end AST equivalent)
2. Lowering Pass        — Phase 1.5           (semantic commitment point)
3. ExecutionGraph       — Runtime IR          (mid-level IR / SSA-like)
4. Validator            — Cross-cutting       (global invariant system)
5. CER + CCNF           — Event substrate     (event-sourced ledger)
6. Replay Engine        — Temporal IR interp  (runtime execution)
```

### Unresolved Follow-Ups
- This is explicitly identified as the "missing spine" — it should be documented as the canonical architectural model
- Are there formal IR transition rules defined anywhere, or do they need to be written?

---

## 2. Lowering Pass / Phase 1.5 — Semantic Commitment Point v0.1
**Status:** `Agreed`

### Architectural Intent
The Lowering Pass (Phase 1.5) is the most critical structural boundary in the entire system. It is where fluid intent becomes frozen execution. It is NOT just a transformation — it is the system's semantic commitment point.

### Requirements & Acceptance Criteria
- [ ] **Role**: IR boundary enforcement layer between WorkRequest IR (fluid intent) and ExecutionGraph (frozen runtime)
- [ ] **Functions**:
  - Executor selection engine — chooses which executor/runtime handles the work
  - Dependency resolver — resolves ordering and data dependencies
  - Channel materializer — creates the actual communication channels between execution steps
  - Lifecycle expander — expands lifecycle hooks (pre/post/error/compensation)
- [ ] **Key property**: Once intent passes through the Lowering Pass, it is no longer fluid. The WorkRequest IR is lowered into a frozen ExecutionGraph
- [ ] **Analogous to**: A compiler's lowering pass between AST and IR
- [ ] Determining what is "lowered" vs what stays as "fluid intent" is the kernel boundary question

### Harvested Code Artifacts
#### Purpose: Lowering Pass responsibilities
```
Lowering Pass (Phase 1.5):
  - IR boundary enforcement layer
  - Executor selection engine
  - Dependency resolver
  - Channel materializer
  - Lifecycle expander

This is the semantic commitment point.
Once here, intent is no longer fluid.
```

### Unresolved Follow-Ups
- What is the exact interface between WR IR and the Lowering Pass — does the pass receive structured IR or raw intents?
- How does the Lowering Pass handle failed resolution (unresolvable dependencies, ambiguous executor selection)?

---

## 3. Validator as Global Invariant System v0.1
**Status:** `Agreed`

### Architectural Intent
The Validator is NOT a compiler pass — it is a **global invariant system** that operates at all phases. It combines static analysis (pre-execution checks), runtime verification (in-execution checks), authority graph enforcement (who is allowed to do what), and permission layer governance.

### Requirements & Acceptance Criteria
- [ ] **Four subsystems**:
  - **Static analyzer (S1–S10)**: Pre-execution checks on WorkRequest IR and ExecutionGraph
  - **Runtime verifier (R1–R10)**: In-execution checks during Phase 2 runtime execution
  - **Authority graph enforcement (AEI)**: Ensures actors have authority for their actions
  - **Permission layer (HAEC)**: Hierarchical permission enforcement
- [ ] Cross-cutting: Validator runs across ALL phases, not between them
- [ ] NOT a transformation pass — it enforces invariants without changing state
- [ ] Operates on: WorkRequest IR (static), ExecutionGraph (static), runtime execution (dynamic), event history (forensic)

### Harvested Code Artifacts
#### Purpose: Validator subsystems
```
Validator (Global Invariant System):
  - Static analyzer      (S1–S10)   — pre-execution checks
  - Runtime verifier     (R1–R10)   — in-execution checks
  - Authority graph      (AEI)      — actor authority enforcement
  - Permission layer     (HAEC)     — hierarchical permission governance
```

### Unresolved Follow-Ups
- What are the S1–S10 static checks? What are the R1–R10 runtime checks?
- How does AEI integrate with the role-governance model from AGENTS.md?

---

## 4. CER + CCNF Event Substrate v0.1
**Status:** `Agreed`

### Architectural Intent
CER (Canonical Event Record) and CCNF (Canonical Canonical Normalization Form) form the second major architectural backbone. Everything that happens in the system becomes immutable event state. This enables replay, debugging, and distributed reconstruction.

### Requirements & Acceptance Criteria
- [ ] **CCNF** ensures deterministic identity for every event — no ambiguity about what happened
- [ ] **CER** becomes the universal trace substrate — every mutation is an append
- [ ] **Properties**: Everything becomes immutable event state; deterministic identity; universal trace substrate
- [ ] **Enables**: Replay from event history, debugging via event timeline, distributed reconstruction without ambiguity
- [ ] This is the event-sourced ledger layer
- [ ] **Relationship to Multi-Stage Compiler**: CER captures every IR transition, every lowering decision, every execution result

### Harvested Code Artifacts
#### Purpose: Event substrate role
```
CER + CCNF:
  Everything becomes immutable event state
  CCNF ensures deterministic identity
  CER becomes the universal trace substrate

Enables:
  - Replay from history
  - Debugging via timeline
  - Distributed reconstruction without ambiguity
```

### Unresolved Follow-Ups
- How does CER relate to the `receipt` system in conduit-mcp?
- Is CCNF already defined somewhere or does it need to be designed?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Multi-Stage Semantic Compiler Architecture | Agreed | 6-component compiler model; "missing spine" |
| 2 | Lowering Pass / Phase 1.5 — Semantic Commitment Point | Agreed | Where fluid intent becomes frozen execution |
| 3 | Validator as Global Invariant System | Agreed | Static + runtime + authority + permission subsystems |
| 4 | CER + CCNF Event Substrate | Agreed | Event-sourced ledger; replay; distributed reconstruction |

---

**Note:** The "missing spine" document (Pasted text(3).txt) referenced in this transcript appears to be a key architectural document that the user shared with ChatGPT. It may exist as a separate file worth locating and preserving.

*Extracted from `chats/Multi-Stage Semantic Compiler.html`, 7 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
