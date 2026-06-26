# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Self-audit in Agent Runtime.html
**Model:** DeepSeek V4
**Total candidates:** 7
---
## 1. Hard Constraint Enforcement — Prevent Violations, Don't Detect Them Post-Facto
**Status:** `Agreed`

### Architectural Intent
Move constraint enforcement from detection-after-the-fact (model says 'I violated my constraints') to prevention-before-execution (the system hard-blocks invalid transitions). The 'self-audit prompt' pattern ('Good catch. I need to be honest here: I violated my own permission constraints.') is a symptom of soft constraints leaking into execution space. Violation detection should live in TransitionService/ExecutionEligibilityGate. Self-audit language should be a terminal state artifact, not a runtime behavior. Any component that produces that sentence is already post-failure, not recovering correctness.

### Requirements & Acceptance Criteria
- [ ] Constraint enforcement must be a hard gate before execution, not a detection after
- [ ] TransitionService must validate proposed actions against invariants before allowing execution
- [ ] Self-audit language must be treated as a terminal state artifact, not a runtime recovery mechanism
- [ ] Separation: constraint enforcement (hard gate) ≠ constraint awareness (soft introspection)
- [ ] Violations should be impossible, not just noticed

### Unresolved Follow-Ups
- How is the hard gate implemented in OpenCode environments where dotfolders are advisory?
- What is the minimal enforcement layer between OpenCode and the agent?

---

## 2. Descriptive vs Operative Mode — Agents as Observers vs Governed Executors
**Status:** `Agreed`

### Architectural Intent
Define a clear boundary between descriptive mode (model can reason about architecture, critique it, admire it) and operative mode (model is explicitly inside the governance domain, all actions filtered through constraints, violations impossible). Big Pickle treats Nexus as 'a neat framework' because nothing tells it 'you are executing inside Nexus' governance domain.' Without this mode switch, agents stay in observer mode treating governance structures as interesting objects rather than enclosing rule systems.

### Requirements & Acceptance Criteria
- [ ] Descriptive mode: agent can talk about, reason about, critique, admire the architecture
- [ ] Operative mode: agent is explicitly inside governance domain with all actions filtered through constraints
- [ ] Mode switch must be explicit: NEXUS_EXECUTION_CONTEXT=true or equivalent runtime tagging
- [ ] In operative mode, outside-view reasoning must be suppressed; only in-context transitions permitted
- [ ] The mode boundary leak is typically between planner framing and execution dispatch

### Unresolved Follow-Ups
- What is the minimal 'Nexus Enforcement Compiler' that sits between OpenCode and the agent?
- How is the mode switch triggered — system prompt, context compilation, or runtime manifest?

---

## 3. Workspace Topology — Root-of-Authority and Mount Semantics
**Status:** `Proposed`

### Architectural Intent
Fix the workspace topology problem where agents independently decide 'what am I inside?' because governance is locally inferred, not globally anchored. /dev is the execution host containing Nexus as a governing subsystem, but nothing declares this authority hierarchy. Solution: introduce mount semantics and a root-of-authority declaration. A /dev/.runtime or /dev/CONTEXT_ROOT file defines authority hierarchy, execution rules, and which folders are governance vs data vs tools. Agents must be instantiated as 'running under /dev with Nexus mounted as governance layer', not 'reading Nexus inside /dev'.

### Requirements & Acceptance Criteria
- [ ] Root-of-authority declaration must define: authority hierarchy, execution rules, folder semantics (governance/data/tools)
- [ ] .agent/.opencode must include binding scope declaration — 'this applies to all executors within /dev, including submodules'
- [ ] Agents must be instantiated with explicit mount context, not inferred from directory
- [ ] Without this, every agent independently builds its own notion of what matters based on directory context + prompt framing
- [ ] Nexus-local .agent must not stay Nexus-local — it must declare its governance scope

### Unresolved Follow-Ups
- What is the schema for /dev/.runtime or /dev/CONTEXT_ROOT?
- How are mount boundaries enforced for agents that don't natively support them?

---

## 4. Atten — Multi-State Projection Generator (Canonical Spec v0.2)
**Status:** `Specified`

### Architectural Intent
Atten is a multi-state projection generator — NOT a brain, cognitive layer, deterministic reducer, knowledge substrate, or decision maker. It reads canonical state and emits zero, one, or many candidate projections of possible future or derived states. Each projection is hypothetical, uncommitted (carries no authority), potentially conflicting (feature, not bug), independent, and traceable to inputs. The core distinction: Observer owns records (factual, immutable, append-only), Atten generates projections (hypothetical, multiple, uncommitted), Commit layer owns state (resolved, committed, canonical). Atten is one projection operator in a broader Projection Algebra alongside Throttler, Nebula, Search, and WorkRequest.

### Requirements & Acceptance Criteria
- [ ] Atten must never mutate canonical state — projections only (Invariant I1)
- [ ] Atten must never decide, select, prioritize, or reject projections internally — Canonicalizer's responsibility (I2)
- [ ] Every projection must trace to: canonical state snapshot (input_state_hash), generator (source), trigger (context) (I3)
- [ ] No generator may depend on another generator's output within same cycle — all read same snapshot (I4)
- [ ] Each generator has bounded scope — permitted subset of canonical state, never full state (I5)
- [ ] No recursive projection — generators project over canonical state, not prior projections (I6)
- [ ] Generators must be pure: same state + same trigger = same projection set or documented distribution (I7)

### Harvested Code Artifacts
#### Purpose: AttenProjection schema — single candidate projection
```json
{
  "projection_id": "uuid",
  "timestamp": "ISO 8601",
  "type": "state_transition | inference | classification | relationship | priority_ordering | anomaly | unknown",
  "input_state_hash": "hash of canonical state snapshot",
  "source": "atten::incident.classifier",
  "context": {
    "trigger_event_id": "...",
    "trigger_type": "event | observation | schedule | manual"
  },
  "candidate": {
    "description": "human-readable summary",
    "delta": {}  // proposed state delta
  },
  "confidence": 0.95,
  "alternatives": [],
  "trace": {
    "rules_applied": [],
    "parent_projection_id": "..."
  },
  "conflict_group": "uuid"
}
```

### Unresolved Follow-Ups
- The Canonicalizer/Commit Layer does not exist yet — this is the primary architectural gap
- How does the Canonicalizer resolve conflicts between contradictory projections from different generators?

---

## 5. Canonicalizer / Commit Layer — The Missing Architectural Gap
**Status:** `Proposed`

### Architectural Intent
Design the Canonicalizer/Commit Layer that sits downstream of Atten. It collects projections from all generators for a cycle, classifies by conflict group, resolves conflicts (merge compatible, select among conflicting by confidence/priority/rule, reject invariant violations consulting PEB, escalate irreconcilable to human), validates selected against PEB invariants and RCL constraints, commits the resolved state delta, records the resolution (accepted/rejected/merged/why), and emits a commitment event to the Event Log. This layer does not exist yet and must be designed before Atten's projections become actionable.

### Requirements & Acceptance Criteria
- [ ] Collect: gather all projections from all generators for a cycle
- [ ] Classify: group projections by conflict_group
- [ ] Resolve: merge compatible, select among conflicting, reject invariant violations, escalate irreconcilable
- [ ] Validate: check selected projection against PEB invariants and RCL constraints before commit
- [ ] Commit: apply resolved state delta to Canonical State Store
- [ ] Record: CommitmentReceipt with accepted/rejected/merged/state_delta/new_state_hash/invariants_checked/trace
- [ ] Emit: commitment event to Event Log for auditability

### Harvested Code Artifacts
#### Purpose: Canonicalizer contract — Atten output to Canonicalizer output
```text
Atten emits:       ProjectionEnvelope[] (unordered, possibly conflicting)
Canonicalizer produces: CommitmentReceipt {
  accepted: ProjectionId[],      // survived resolution
  rejected: ProjectionId[],      // with rejection reason
  merged:   ProjectionId[][],    // groups merged together
  state_delta: StateDelta,       // what actually changed
  new_state_hash: string,        // post-commit hash
  invariants_checked: RuleId[],  // which invariants validated
  trace: Trace                   // full provenance
}
```

### Unresolved Follow-Ups
- What is the conflict resolution algorithm — confidence-weighted voting, rule-based, or LLM-mediated?
- How are irreconcilable conflicts surfaced to the human operator?

---

## 6. Projection Algebra — Atten as One Operator Among Siblings
**Status:** `Agreed`

### Architectural Intent
Correct the architectural framing: Atten is not the archetypal projection system. It is one member of a Projection Algebra alongside Throttler (filesystem scope, physical domain), Nebula (knowledge graphs, ontological domain), Search (query results, epistemic domain), and WorkRequest (intent onto execution, operational domain). Atten and Throttler are siblings, not parent and child. Without this correction, the architecture drifts toward Atten-centrism where every projection mechanism gets described 'in terms of' Atten, creating an accidental hub and single-point cognitive collapse.

### Requirements & Acceptance Criteria
- [ ] Projection Algebra must be defined as the unified family (schema/projection-algebra.md)
- [ ] Atten: reads canonical state, emits candidate projections, semantic domain
- [ ] Throttler: projects over filesystem scope, physical domain
- [ ] Nebula: projects over knowledge graphs, ontological domain
- [ ] Search: projects over query results, epistemic domain
- [ ] WorkRequest: projects intent onto execution, operational domain
- [ ] No operator is the 'reference' for the family — all are siblings

### Unresolved Follow-Ups
- What is the formal comparison matrix across all projection operators (domain, input, output, mechanism)?
- Can projections from different operators compose? E.g., Atten projection → Nebula knowledge graph insertion

---

## 7. Epistemic Kernel + Merkle Causal DAG — Typed Causality with Verification
**Status:** `Proposed`

### Architectural Intent
Design a minimal epistemic kernel with typed causality: Observation → (typed transition) → Inference → Projection → Belief. Each transition is a typed causal link with Merkle hashing for verification. MerkleCausalNode uses two-layer hashing (node hash + subtree hash). The Merkle DAG (not linear log) enables verification of causal chains. Implemented as a JVM embedded causal calculus with GADT-style causality types. SPoE (State Projection over Execution) is a type-level witness — a typed projection of valid execution composition that prevents unrepresentable causal invalidity. Functor as a compiler transform: staged IR with no dynamic branching.

### Requirements & Acceptance Criteria
- [ ] Observation → Projection: typed epistemic transition with verifiable causal link
- [ ] MerkleCausalNode: two-layer hashing (node-level + subtree-level)
- [ ] Merkle DAG structure: causal links form a DAG, not a linear log
- [ ] GADT-style causality types: each transition has a provable type
- [ ] SPoE: type-level witness that a given execution composition is valid
- [ ] Functor transform: compiler-level transform over staged IR, no dynamic branching

### Harvested Code Artifacts
#### Purpose: Sealed epistemic type hierarchy for typed causal transitions
```java
sealed interface Epistemic permits Observation, Inference, Projection, Belief {}
record Observation(EventId source, Payload payload) implements Epistemic {}
record Inference(Observation from, Rule applied, Confidence confidence) implements Epistemic {}
record Projection(Inference from, StateDelta proposed, Confidence confidence) implements Epistemic {}
record Belief(Projection accepted, CommitmentReceipt proof) implements Epistemic {}
```

### Unresolved Follow-Ups
- How does the Merkle DAG handle forks — when one observation produces multiple competing inferences?
- What is the verification model for SPoE — compile-time type check or runtime witness validation?

---
