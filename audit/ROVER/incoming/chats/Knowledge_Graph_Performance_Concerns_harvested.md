# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Knowledge Graph Performance Concerns.html
**Model:** DeepSeek V4
**Total candidates:** 6
---
## 1. Projection API Contract — Formal Interface Between Work Artifact IR and Consumers
**Status:** `Agreed`

### Architectural Intent
Define a formal Projection API that sits between the Work Artifact IR (truth substrate) and everything that reads it (UI, orb, scheduler, agents, reports). The API splits into 4 invariant getters (direct O(1) reads of stored IR fields), 6 derived projections (pure, deterministic, cacheable computed views), and 2 control surfaces (the only projections allowed to influence execution). This is the layer that turns LOSM from a conceptual architecture into a runtime with a clean separation of truth vs interpretation.

### Requirements & Acceptance Criteria
- [ ] All 4 invariant getters must be O(1), pure, and stable: getIntent, getState, getDecisions, getConstraints
- [ ] All 6 derived projections must be deterministic, cacheable, and idempotent: deriveContext, deriveDiff, deriveRisks, deriveAmbiguities, deriveOutputs, deriveProvenance
- [ ] Control surfaces (computeBlockers, computeNextAction) must be pure, composable, and policy-aware
- [ ] Every projection must satisfy the meta-contract: Purity (no side effects), Determinism (same IR → same projection), Composability, Traceability (point back to IR nodes), Explainability (answer 'Why did you return this?')

### Unresolved Follow-Ups
- What is the caching and invalidation model for derived projections?
- How are projection composition rules enforced at the type level?

---

## 2. Invariant Getters — Direct O(1) Reads of Kernel Truth
**Status:** `Agreed`

### Architectural Intent
Define four invariant getters that provide direct, O(1), pure reads of stored Work Artifact IR fields. getIntent returns the IntentBlock, getState returns the StateBlock, getDecisions returns the DecisionBlock list, and getConstraints returns the ConstraintBlock. These four are the kernel truths — they are the ground-level facts from which all projections are derived. They must never compute, interpret, or transform data.

### Requirements & Acceptance Criteria
- [ ] getIntent(artifactId) → IntentBlock: must return the stored intent without interpretation
- [ ] getState(artifactId) → StateBlock: must return the current state atom
- [ ] getDecisions(artifactId) → DecisionBlock[]: must return the full decision history
- [ ] getConstraints(artifactId) → ConstraintBlock: must return all active constraints
- [ ] All four must be O(1) reads with no computation, no side effects, and no caching dependencies

### Unresolved Follow-Ups
- Are IntentBlock, StateBlock, DecisionBlock, and ConstraintBlock defined as formal TypeSpec schemas?

---

## 3. Derived Projections — Pure Computed Views Over IR + History
**Status:** `Agreed`

### Architectural Intent
Define six derived projections that are pure functions over IR + history. deriveContext computes environmental and lineage assumptions. deriveDiff computes structural, semantic, and state diffs between versions. deriveRisks runs the risk engine over state, constraints, and lineage. deriveAmbiguities runs ambiguity detectors over intent, context, and structure. deriveOutputs returns execution receipts as a projection. deriveProvenance returns actors, timestamps, and the mutation graph. These are interpretations, not stored truth.

### Requirements & Acceptance Criteria
- [ ] deriveContext(artifactId) → environmental + lineage assumptions
- [ ] deriveDiff(artifactId, previousVersionId) → structural + semantic + state diff
- [ ] deriveRisks(artifactId) → risk assessment over state + constraints + lineage
- [ ] deriveAmbiguities(artifactId) → ambiguity detection over intent + context + structure
- [ ] deriveOutputs(artifactId) → execution receipts as projection
- [ ] deriveProvenance(artifactId) → actors + timestamps + mutation graph
- [ ] All must be deterministic, cacheable, and idempotent — same IR always produces same projection

### Unresolved Follow-Ups
- What is the formal schema for each projection's return type?
- How does the risk engine weigh different types of risks (structural, semantic, temporal)?

---

## 4. Control Surfaces — computeBlockers and computeNextAction as OS Brain
**Status:** `Agreed`

### Architectural Intent
Define two control surfaces as the only projections allowed to influence execution. computeBlockers returns the set of conditions preventing forward progress, using state, constraints, risks, ambiguities, and scheduler policy. computeNextAction returns the next required transition from [clarify, replan, execute, validate, escalate, complete]. These must be pure, composable, and policy-aware. computeNextAction is the 'OS brain' — the single point where the system decides what happens next.

### Requirements & Acceptance Criteria
- [ ] computeBlockers(artifactId) → set of blocking conditions using state, constraints, risks, ambiguities, scheduler policy
- [ ] computeNextAction(artifactId) → next transition: clarify | replan | execute | validate | escalate | complete
- [ ] Both must be pure functions — no side effects, no mutation of IR
- [ ] Both must be composable with derived projections: computeBlockers(deriveRisks(artifact))
- [ ] computeNextAction must be the single authoritative source for execution transitions

### Unresolved Follow-Ups
- How is scheduler policy defined — as configuration, learned weights, or hardcoded rules?
- What happens when computeBlockers returns an empty set but computeNextAction returns 'escalate'?

---

## 5. Orb Force Model — Projections as Smoothed Long-Memory Forces
**Status:** `Proposed`

### Architectural Intent
Define how the orb consumes the Projection API. The orb never reads IR directly — it only consumes long-memory smoothed projections. computeBlockers maps to turbulence, deriveAmbiguities maps to epistemic fog, deriveRisks maps to latent heat, deriveDiff maps to structural drift, and deriveProvenance maps to activity churn. These become forces (not colors) that the orb metabolizes over minutes/hours/days, making it feel like weather rather than telemetry.

### Requirements & Acceptance Criteria
- [ ] Orb must never read IR directly — only through smoothed projection surfaces
- [ ] computeBlockers → turbulence force
- [ ] deriveAmbiguities → epistemic fog force
- [ ] deriveRisks → latent heat force
- [ ] deriveDiff → structural drift force
- [ ] deriveProvenance → activity churn force
- [ ] Forces must be temporally smoothed (minutes/hours/days scale)

### Unresolved Follow-Ups
- What is the mathematical smoothing function — exponential moving average, Kalman filter, or custom?
- How are force thresholds calibrated for different system scales?

---

## 6. Agent Interaction Protocol — Read via Projections, Propose Mutations, Kernel Validates
**Status:** `Agreed`

### Architectural Intent
Define the protocol by which agents (DeepSeek, Flash, Copilot, etc.) interact with the system. Agents never mutate IR directly. They read via projections, propose mutations, the kernel validates constraints, the kernel commits state transitions, and projections update automatically. This five-step protocol prevents drift and hallucination from corrupting the truth substrate.

### Requirements & Acceptance Criteria
- [ ] Agent reads must go through projection API only — never direct IR access
- [ ] Agent mutation proposals must be validated by kernel constraints before commit
- [ ] Kernel must reject any mutation that violates constraints
- [ ] State transitions must be atomic — partial mutations are not allowed
- [ ] Projections must update automatically after each state transition

### Harvested Code Artifacts
#### Purpose: Agent interaction protocol steps
```text
Agent Interaction Protocol:
1. Read via projections
2. Propose mutations
3. Kernel validates constraints
4. Kernel commits state transition
5. Projections update automatically
```

### Unresolved Follow-Ups
- What is the Kernel Mutation Protocol schema — how are mutation proposals formatted?
- How are conflicting proposals from multiple agents resolved?

---
