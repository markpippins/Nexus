# Harvested Specification & Code Repository

**Source:** `Plans Table Decision.html`
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 6 Specification Candidates extracted

---

## 1. Nebula/Conduit Two-Plane Split v0.1
**Status:** `Agreed`

### Architectural Intent
Hard architectural partition between cognition (Nebula) and execution (Conduit). Nebula owns all pre-commit lifecycle — proposed, draft, exploratory, refined, candidate, ready-for-commit. Conduit only sees committed plans — PlanInstance, ExecutionState, HoldState.

### Requirements & Acceptance Criteria
- [ ] **Nebula (Cognitive/Semantic Layer)** — Proposed plans exist here: incomplete, evolving, cross-referenced, stratified by level, subject to reflection mutation. They are NOT commitments
- [ ] **Conduit (Execution/Commitment Layer)** — Only sees: committed plans, active executions, completed artifacts. Optionally "held" but only as execution suspension state, not reasoning state
- [ ] Conduit is no longer "where plans live" — it becomes "where commitments run"
- [ ] Proposed plans must never enter Conduit tables, Conduit UI, or become Conduit state
- [ ] Nebula plan lifecycle: draft → refined → candidate → ready-for-commit
- [ ] Conduit lifecycle: committed (PlanInstance) → executing (ExecutionState) → completed/failed (HoldState for execution pause only)
- [ ] Commitment is a **one-way projection** from Nebula → Conduit

### Harvested Code Artifacts
#### Purpose: Two-plane system architecture
```
Nebula (upstairs)          Conduit (factory floor)
reversible                 irreversible
reflective                 event-sourced
multi-hypothesis           failure-tolerant but not revision-tolerant
stratified                 strictly state-driven
graph-mutating             commitment boundary
owns pre-commit lifecycle  owns post-commit execution
```

#### Purpose: Plan lifecycle split
```
Nebula:  draft → refined → candidate → ready-for-commit
Conduit: committed → executing → completed/failed
                          → HOLD (execution pause only)
```

### Unresolved Follow-Ups
- What is the exact schema for the "commit threshold evaluation" — how does Nebula decide what is allowed to leak into Conduit?
- Formal event boundary: `PlanCommitted`, `PlanHeldForExecution` events?

---

## 2. Factory Floor / Office Upstairs Metaphor v0.1
**Status:** `Agreed`

### Architectural Intent
Conduit is the factory floor (heat, motion, state changes, things becoming real). Nebula is the office upstairs (drafts, revision, cross-referencing, argument, stratification). Filing cabinets (proposed plans) do not belong on the factory floor.

### Requirements & Acceptance Criteria
- [ ] Conduit = factory floor: you can inspect, pause, redirect, scribble notes on a clipboard — but you don't archive thought-processes there
- [ ] Nebula = office upstairs: spread things out, revise, cross-reference, argue, stratify, decide what is even worth sending down to the floor
- [ ] Filing cabinets on the factory floor cause: people (and agents) mistake in-progress reasoning artifacts for operational truth
- [ ] Execution systems are very bad at holding ambiguity — they resolve it immediately, whether they should or not
- [ ] The factory floor should never need to understand *why* something was decided — only that it is now the thing being built

### Harvested Code Artifacts
#### Purpose: Architectural metaphor
```
Nebula = office upstairs (thinking space)
  → drafts, revision, cross-referencing, stratification
  → cognition, ambiguity, evolution of intent

Conduit = factory floor (execution space)
  → heat, motion, state changes, things becoming real
  → commitment, irreversibility, state transition under pressure
```

#### Purpose: Key invariant
```
The factory floor should never need to understand why something was decided
— only that it is now the thing being built.
```

### Unresolved Follow-Ups
- How to train operators (human and agent) to understand which surface is which?
- What visual indicators prevent surface confusion?

---

## 3. Commitment Boundary & Irreversible Commitment Principle v0.1
**Status:** `Agreed`

### Architectural Intent
Commit is irreversible in meaning, even if execution is not. The only legitimate flow is a one-way projection from Nebula → Conduit. "Unless things go wrong" is handled as a separate recovery mode, not a relaxation of the boundary.

### Requirements & Acceptance Criteria
- [ ] Conduit is the **commitment boundary** — Nebula is everything before commitment (normal path)
- [ ] Exception routing back across the boundary (when things go wrong) is a **different mode** — not a relaxation of the boundary
- [ ] **Never undo commitment** — you only add evidence that commitment failed. Never "demote" execution back into proposal space
- [ ] The "demotion" degeneracy creates a dangerous loop: commit → fail → demote to proposed → re-enter reasoning → become mutable → re-derive execution → collapses the entire semantic separation between what we decided and what went wrong
- [ ] Clean model when things go wrong:
  - Conduit does NOT say "this is a proposed plan again"
  - Conduit says "this committed plan produced a failure trace"
  - Emits: `PlanExecutionFailed`, `PlanQuarantined`, `RepairPlanCreated` (in Nebula, if needed)

### Harvested Code Artifacts
#### Purpose: Commitment irreversibility
```
DO NOT:  commit → fail → demote to "proposed"
CORRECT: commit → fail → emit failure trace
                          → PlanExecutionFailed event
                          → PlanQuarantined state
                          → RepairPlanCreated (in Nebula)
```

#### Purpose: Recovery mode protocol
```
Failure recovery is a SEPARATE mode, not a boundary relaxation:
  Normal path:   Nebula → commit → Conduit → execute → complete
  Recovery path: Conduit → emit failure event → Nebula creates RepairPlan → commit → Conduit executes
```

### Unresolved Follow-Ups
- Formal failure taxonomy for Conduit (execution failure, validation failure, environmental failure, semantic mismatch)?
- How does the recovery path avoid becoming a hidden backdoor between cognition and execution?

---

## 4. Proposed as Quarantine Mechanism v0.1
**Status:** `Agreed`

### Architectural Intent
The "hold for triage" / push-back-to-proposed pattern is not really a state transition — it is a quarantine mechanism. "Proposed" in Conduit has quietly become a dead-letter queue for execution ambiguity.

### Requirements & Acceptance Criteria
- [ ] Pushing plans back to proposed status to get them off the production line is not a state transition — it is a quarantine mechanism
- [ ] In a clean split:
  - Conduit gets `HOLD` (execution-suspended)
  - Nebula gets `PROPOSED / DRAFT / EXPLORATORY`
  - These are not the same concept
- [ ] Conduit HOLD state: execution pause only, no reasoning content, no draft semantics
- [ ] Conduit stops needing to understand plans at all — it only needs: a plan ID, an execution contract, a state machine

### Harvested Code Artifacts
#### Purpose: State quarantine reframing
```
Current (anti-pattern):
  Conduit "proposed" = dead-letter queue for execution ambiguity

Target (clean):
  Conduit gets HOLD        = execution-suspended (no reasoning content)
  Nebula gets PROPOSED      = draft/exploratory (full reasoning traces)
```

### Unresolved Follow-Ups
- Migration plan for existing "held/proposed" plans in Conduit?
- What happens to plans currently in the dead-letter queue?

---

## 5. Conduit as Contract Processor v0.1
**Status:** `Agreed`

### Architectural Intent
Conduit stops needing to understand plans at all — it only needs: a plan ID, an execution contract, and a state machine. All reasoning, cross-referencing, and stratification becomes irrelevant to Conduit.

### Requirements & Acceptance Criteria
- [ ] Conduit only stores and displays plans that have passed "commitment threshold"
- [ ] Conduit only consumes `CommittedPlanCreated` events
- [ ] Conduit's understanding of a plan is limited to: plan ID, execution contract, state machine state
- [ ] Conduit does not participate in the cognition loop — Nebula tells Conduit what to execute
- [ ] Conduit may not store reasoning traces, draft state, cross-references, or stratification levels

### Harvested Code Artifacts
#### Purpose: Conduit execution contract
```
Conduit minimal plan knowledge:
  plan_id          ← opaque identifier
  execution_contract ← what must happen
  state_machine    ← current execution state (committed → executing → completed/failed/hold)
  NO: reasoning, cross-references, stratification, draft state
```

### Unresolved Follow-Ups
- What is the exact structure of the execution contract?
- How does Conduit reject a commit if the contract is invalid?

---

## 6. Thinking Systems vs Execution Systems v0.1
**Status:** `Agreed`

### Architectural Intent
The architectural line is about keeping thinking systems tolerant of ambiguity and execution systems hostile to ambiguity. That separation keeps both layers stable when things get noisy.

### Requirements & Acceptance Criteria
- [ ] Thinking systems (Nebula): must tolerate ambiguity, multi-hypothesis reasoning, contradiction, incomplete information
- [ ] Execution systems (Conduit): must reject ambiguity, resolve uncertainty immediately, operate under strict state machines
- [ ] A hybrid space (where Conduit shows proposed plans in the Nebula sense) creates friction — the two modes of operation are incompatible in the same surface
- [ ] The commitment threshold is the only gate where intent becomes real — it is the moment between "thinking" and "action"
- [ ] Keeping the two planes separate is what prevents: execution surface contamination, state ambiguity, and cognitive overload for operators (human and agent)

### Harvested Code Artifacts
#### Purpose: System design principle
```
Thinking systems (Nebula):
  tolerant of ambiguity, multi-hypothesis, contradiction-capable

Execution systems (Conduit):
  hostile to ambiguity, strict state machines, immediate resolution

Boundary rule:
  Never let execution systems display thinking artifacts.
  Never let thinking systems control execution state.
```

### Unresolved Follow-Ups
- What is the minimal "commit threshold" evaluation criteria?
- Who or what evaluates the threshold — a human operator, a Planner agent, or an automatic gate?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Nebula/Conduit Two-Plane Split | Agreed | Pre-commit cognition vs post-commit execution |
| 2 | Factory Floor Metaphor | Agreed | Office upstairs vs factory floor |
| 3 | Commitment Boundary | Agreed | Irreversible commit, failure as separate mode |
| 4 | Proposed as Quarantine | Agreed | Proposed = dead-letter, replaced by HOLD |
| 5 | Conduit as Contract Processor | Agreed | Conduit only needs ID + contract + state machine |
| 6 | Thinking vs Execution Systems | Agreed | Ambiguity-tolerant vs ambiguity-hostile |
| 7 | | | |

---

*Extracted from `chats/Plans Table Decision.html`, 16 chunks processed. Rover pipeline: BS4 → chunk → architect extraction → compiled.*
