# Harvested Specification & Code Repository

**Source:** `Unit of Update Analysis.html` (Bulk Export — Foundational architectural analysis)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 3 Specification Candidates extracted

---

## 1. Unit of Update Model v0.1
**Status:** `Agreed`

### Architectural Intent
The foundational architectural question: "What is the unit of update?" — what changes when the system mutates state? The critical insight is that **the unit of storage is not the same as the unit of update**, and most systems accidentally conflate them. Seven candidate types are analyzed, each producing a radically different system.

### Requirements & Acceptance Criteria
- [ ] **Seven candidate units of update** with their tradeoffs:
  1. **Document** (intent.md, architecture.md, etc.) — Easy to use, but loses causality
  2. **Fact** (individual KG triple) — Good retrieval, but weak execution history
  3. **Thought** (reasoning artifact) — Hard to validate, very model-dependent
  4. **Event** (something happened) — Excellent auditability, but poor semantic structure alone
  5. **Decision** (architectural conclusion changed) — Captures governance, but not implementation
  6. **WorkRequest** (intent to perform work) — Captures planning, but not resulting state
  7. **State Projection** (materialized view of reality) — Easy to consume, hard to explain provenance
- [ ] **Fundamental insight**: Unit of storage ≠ Unit of update. Most systems conflate them to their detriment
- [ ] **Event Sourcing perspective**: Natural update unit is Event (observed/inferred/decided/executed/verified). Limitation: a million events doesn't tell you what matters
- [ ] **Governance perspective**: Natural update unit is Decision (e.g., `Decision:D-1024`, Statement, Status, Supersedes). Everything else becomes evidence. Limitation: loses operational history
- [ ] **Execution perspective**: Natural update unit is WorkRequest → Plan → Execution → Receipt. Key distinction: Events explain *what* happened, WorkRequests explain *why*. That is a profound distinction

### Harvested Code Artifacts
#### Purpose: Unit of update tradeoff matrix
```
Unit              | What Changes               | Consequence
Document          | intent.md, etc.            | Easy, loses causality
Fact              | KG triple                  | Good retrieval, weak execution
Thought           | reasoning artifact         | Hard to validate
Event             | something happened         | Excellent audit, poor semantics
Decision          | architectural conclusion   | Captures governance, not execution
WorkRequest       | intent to perform work     | Captures planning, not resulting state
State Projection  | materialized view          | Easy to consume, hard to explain provenance
```

#### Purpose: The core insight
```
Unit of storage ≠ Unit of update
Events explain WHAT happened
WorkRequests explain WHY
```

### Unresolved Follow-Ups
- The chart is not yet fully resolved — the system circles but does not formally decide between the candidates. The ultimate answer emerges in the next spec (Projection-Centric Update Architecture).

---

## 2. Projection-Centric Update Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
The definitive answer to the unit-of-update question: **WorkRequests do not update reality directly. They generate events that cause the system's projected model of reality to be updated.** This is the "Projection-Centric" approach and is what the system has already been converging on.

### Requirements & Acceptance Criteria
- [ ] **Core formulation**:
  ```
  Reality Update = Projection( Execution( WorkRequest ) )
  ```
- [ ] More precisely: WorkRequest execution produces events; events update projections of system state
- [ ] **Three simultaneous 'realities'** the system maintains:
  - **(A) Physical reality (execution truth)**: Temporal event history, activity results, receipts
  - **(B) System reality (what the platform believes)**: PGE/PEB projections, knowledge graphs, derived state
  - **(C) Intentional reality (what should be true)**: WorkRequests, plans, decisions
- [ ] **Full execution flow**:
  ```
  WorkRequest → (execution via Temporal) → Event History (truth)
  → Receipt (verified outcome) → Projection Engine (PGE/PEB)
  → Updated System State (belief about reality)
  ```
- [ ] **You are never updating reality.** You are updating the system's *belief* about reality after execution of intent
- [ ] **Two options** — explicitly choose:
  - **Option A — Reality-centric** (risky): WorkRequest updates reality; PGE mirrors reality. Philosophically brittle
  - **Option B — Projection-centric** (what you're already doing — STABLE): WorkRequest updates execution; execution emits truth events; PGE updates belief state
- [ ] **Why this matters**: If you treat "reality" as singular:
  - CIR resolution becomes ambiguous
  - Conflicting receipts become impossible to model
  - Partial failure states break the ontology
  - Distributed execution becomes philosophically inconsistent
  - But as layered: Temporal = physical truth, WorkRequest = intent, PGE = belief — everything stabilizes
- [ ] **Sharpened formulation**:
  > "We update the system's projected state of reality as a result of WorkRequest execution."
  >
  > "WorkRequest execution produces events; events update projections of system state."

### Harvested Code Artifacts
#### Purpose: Projection-centric update formula
```
Reality Update = Projection( Execution( WorkRequest ) )

Three 'realities':
  (A) Physical reality     — Temporal, events, receipts  (execution truth)
  (B) System reality       — PGE/PEB, KGs, derived state (platform belief)
  (C) Intentional reality  — WorkRequests, plans, decisions (what should be true)
```

#### Purpose: Execution-to-projection flow
```
WorkRequest
  ↓ (execution via Temporal)
Event History (truth)
  ↓
Receipt (verified outcome)
  ↓
Projection Engine (PGE / PEB)
  ↓
Updated System State (belief about reality)
```

### Unresolved Follow-Ups
- The projection-centric model needs to be formally adopted in architecture docs (currently it's what the system does but not what it says it does)
- How does the CIR (Contradiction/Inconsistency Resolution) pipeline interact with the three-reality model — does it operate at the belief layer?

---

## 3. Belief-Maintenance System Model v0.1
**Status:** `Agreed`

### Architectural Intent
The deepest architectural insight to emerge from the unit-of-update analysis: the system is not a task system, not an event system — it is a **belief-maintenance system driven by executable intent**. A reality projection system with causal grounding in WorkRequests.

### Requirements & Acceptance Criteria
- [ ] The system converges on something very close to: **a belief-maintenance system driven by executable intent**
- [ ] It is NOT:
  - A task system (tasks don't capture why)
  - An event system (events don't capture semantics)
  - A document system (documents lose causality)
  - A governance system (decisions lose operational history)
- [ ] It IS:
  - A **reality projection system** with causal grounding in WorkRequests
  - PGE = governance memory
  - Execution Context = causal history
  - WorkRequest IR = executable intent
  - CIRs = unresolved semantic pressure
- [ ] Key invariant: WorkRequests explain **why** something happened (not just what)
- [ ] The "fixed point" the system has been hunting: what gets updated is the system's projected model of reality conditioned on WorkRequest execution
- [ ] This model stays stable because it separates:
  - What happened (physical truth — Temporal events, receipts)
  - Why it happened (intentional truth — WorkRequests, plans, decisions)
  - What we believe about it (system truth — PGE/PEB projections, KGs)

### Harvested Code Artifacts
#### Purpose: System identity
```
NOT: task system, event system, document system, governance system
IS:  belief-maintenance system driven by executable intent
IS:  reality projection system with causal grounding in WorkRequests
```

#### Purpose: System component mapping
```
PGE                    = governance memory
Execution Context      = causal history
WorkRequest IR         = executable intent
CIRs                   = unresolved semantic pressure
```

### Unresolved Follow-Ups
- This model has profound implications for how the system is described and documented — the architecture docs should be updated to reflect the "belief-maintenance" framing
- How does the concept of "belief maintenance" interact with the deterministic system guarantees Conduit is supposed to provide?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Unit of Update Model | Agreed | 7 candidates analyzed; storage ≠ update; Events=what, WorkRequests=why |
| 2 | Projection-Centric Update Architecture | Agreed | Reality Update = Projection(Execution(WorkRequest)); 3-layer reality; Option B stable |
| 3 | Belief-Maintenance System Model | Agreed | System identity as belief-maintenance driven by executable intent; not task/event system |

---

**Note:** This transcript contains the deepest architectural foundations of the entire system. Spec #2 (Projection-Centric Update) is the definitive answer to the unit-of-update question. Spec #3 (Belief-Maintenance System) redefines what the system fundamentally *is*. These should influence how all other specs in the system are framed.

*Extracted from `chats/Unit of Update Analysis.html`, 21 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
