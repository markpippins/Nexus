# Harvested Specification & Code Repository

**Source:** `Work Artifact IR Definition.html` (Bulk Export — merges multiple conversations)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 6 Specification Candidates extracted

---

## 1. LOSM System Identity Model v0.1
**Status:** `Agreed`

### Architectural Intent
Define what it means for LOSM to remain "LOSM" across evolution, mutation, learning, and structural drift. Identity is not state (snapshot) but invariant structure — the preserved rules governing how things are allowed to change.

### Requirements & Acceptance Criteria
- [ ] **SystemIdentity = InvariantConstraints + TransitionSemantics + Governance Continuity**, not Snapshot(SystemState)
- [ ] Three identity invariants must be preserved:
  - **Transition Invariants (Algebra Stability)** — Refine/Branch/Merge/Transform/Terminate must always exist; their semantics must remain compatible over time (extendable but not retroactively redefinable)
  - **Kernel Integrity (Truth Continuity)** — Event-sourced history, versioned IR DAG, causal ordering guarantees, non-destructive history append model. History is never rewritten, only extended
  - **Governance Continuity (Authority Semantics)** — Scoped authority model, no direct IR mutation rights, kernel mediation requirement, auditability of all authority actions
- [ ] Identity is defined by invariants over transformations: LOSM(t₁) ≈ LOSM(t₂) iff invariants preserved under all observed transformations
- [ ] `validateSystemIdentity(SystemSnapshot) → IdentityReport` checks: Transition Algebra consistency, Kernel event integrity, Governance rule continuity, Self-model coherence, Learning-layer boundedness
- [ ] Output: `{identityStable: boolean, driftScore: float, violatedInvariants: [], structuralChanges: [], safeEvolution: boolean}`

### Harvested Code Artifacts
#### Purpose: Identity formalism
```
SystemIdentity ≠ Snapshot(SystemState)
SystemIdentity = InvariantConstraints + TransitionSemantics + Governance Continuity

LOSM(t₁) ≈ LOSM(t₂) iff:
  Invariants preserved under all observed transformations
```

### Unresolved Follow-Ups
- Concrete implementation of `validateSystemIdentity()` as a kernel service?
- How to compute driftScore across heterogeneous invariant dimensions?

---

## 2. LOSM Drift Model & Identity Envelope v0.1
**Status:** `Agreed`

### Architectural Intent
Drift is not failure — it is expected motion. Define drift types and the Identity Envelope that bounds them. If drift exceeds the envelope, learning is paused and the system reverts to conservative mode.

### Requirements & Acceptance Criteria
- [ ] **Drift = bounded deviation from historical invariant alignment**, not prevented but bounded and measured
- [ ] Four drift types:
  - **Semantic Drift** — meaning shifts in risk interpretation, ambiguity detection, conflict resolution sensitivity
  - **Structural Drift** — changes in IR shape, projection structure, artifact topology
  - **Policy Drift** — evolution in constraints, governance thresholds, escalation rules
  - **Behavioral Drift** — changes in scheduler preferences, transition frequency, stability sensitivity
- [ ] **IdentityEnvelope = max allowed drift across all dimensions**
- [ ] If envelope exceeded: learning paused, policy adaptation frozen, self-model recalibration restricted, scheduler reverts to conservative mode
- [ ] **IdentityError = SelfModelPrediction − InvariantValidation** — a primary stability signal
- [ ] Learning Layer must obey: No learning update may increase IdentityError beyond threshold
- [ ] Orb visualizes: drift magnitude → identity strain, identity error → system dissonance, envelope proximity → structural safety margin, invariant violations → fracture points

### Harvested Code Artifacts
#### Purpose: Identity envelope and drift model
```
Drift types: Semantic, Structural, Policy, Behavioral
IdentityEnvelope = max allowed drift across all dimensions
If exceeded: learning paused, policy frozen, scheduler conservative

IdentityError = SelfModelPrediction − InvariantValidation
Learning rule: No update may increase IdentityError beyond threshold
```

#### Purpose: Orb identity visualization mapping
```
drift magnitude     → identity strain
identity error      → system dissonance
envelope proximity  → structural safety margin
invariant violations → fracture points
```

### Unresolved Follow-Ups
- How to calibrate IdentityEnvelope thresholds initially?
- How does SelfModel compute its prediction of system identity?

---

## 3. LOSM Minimal Kernel Architecture v0.1 (5+1 Compression)
**Status:** `Agreed`

### Architectural Intent
Compress the entire philosophical stack (12+ layers) into five runtime subsystems + one storage spine. All of LOSM is: an event-sourced state machine over versioned artifacts, driven by validated transitions, interpreted through projections, and governed by policy.

### Requirements & Acceptance Criteria
- [ ] Five subsystems:
  1. **Event Spine (Truth Layer)** — Immutable, append-only, fully replayable. Event: `{id, artifactId, type, fromVersion, toVersion, command, transition, timestamp}`. Replaces IR mutation, hidden state, "current object model"
  2. **Artifact Store (Versioned State)** — Never update, always create a new version. ArtifactVersion: `{id, artifactId, intent, state, constraints, decisions}`
  3. **Transition Engine (Algebra Core)** — Physics layer. Transition types: Refine, Branch, Merge, Transform, Terminate. Contains conflict resolution hooks, validity checks, algebra rules
  4. **Policy Engine (Governance Layer)** — `evaluate(command, artifact) → PolicyDecision{allowed, reason, constraints}`. No policy = no execution
  5. **Projection Engine (Read Layer)** — `(artifactId, queryContext) → View`. Examples: getState(), deriveRisks(), computeBlockers(), deriveAmbiguity(), deriveConflict(), deriveDiff(). Projections NEVER mutate
- [ ] Runtime loop:
  ```
  handleCommand(command):
    artifact = loadLatestVersion(command.artifactId)
    policy = evaluatePolicy(command, artifact)
    if !policy.allowed → reject(policy.reason)
    transition = buildTransition(command, artifact)
    validateTransition(transition, artifact)
    newVersion = applyTransition(transition, artifact)
    event = createEvent(command, transition, artifact, newVersion)
    appendEvent(event)
    return newVersion
  ```
- [ ] Write path: Command → Policy → Transition → Event → Version
- [ ] Read path: Events → Projection Engine → UI/Orb/Agents

### Harvested Code Artifacts
#### Purpose: 5-subsystem compression
```
Event Spine      → immutable, append-only, fully replayable
Artifact Store   → never update, always create new version
Transition Engine → Refine/Branch/Merge/Transform/Terminate
Policy Engine    → evaluate(command, artifact) → PolicyDecision
Projection Engine → (artifactId, queryContext) → View
```

#### Purpose: Runtime loop
```
function handleCommand(command: Command) {
  const artifact = loadLatestVersion(command.artifactId)
  const policy = evaluatePolicy(command, artifact)
  if (!policy.allowed) return reject(policy.reason)
  const transition = buildTransition(command, artifact)
  validateTransition(transition, artifact)
  const newVersion = applyTransition(transition, artifact)
  const event = createEvent(command, transition, artifact, newVersion)
  appendEvent(event)
  return newVersion
}
```

### Unresolved Follow-Ups
- Event schema standardization — what fields are mandatory vs optional?
- How does the Transition Engine interact with the kernel's existing morphism system?

---

## 4. LOSM Philosophy-to-Implementation Mapping v0.1
**Status:** `Agreed`

### Architectural Intent
Map every philosophical concept from the earlier LOSM architecture to its concrete implementation component. Prevents over-engineered abstraction layers, duplicated truth models, scheduler/kernel confusion, and phantom metaphysical components.

### Requirements & Acceptance Criteria
- [ ] Mapping table must compress the following:
  - Transition Algebra → `buildTransition` + `validateTransition` in Kernel TransitionEngine
  - Conflict Model → `validateTransition` + policy + projection mismatch signals
  - Thermodynamics (Scheduler) → External system that generates Commands with entropy scoring
  - Stability Model → Projection over event history: `stability = f(eventHistory, velocity, entropy)`
  - Learning Layer → Periodic updates to PolicyEngine rules + Projection heuristics
  - Self-Model → Special projection over Event Spine: `selfModel = project(systemEvents)`
  - Governance Layer → PolicyEngine + scoped command validation
  - Identity Layer → Invariants enforced in Transition validation + event replay consistency

### Harvested Code Artifacts
#### Purpose: Philosophy→Implementation compression
```
Philosophical Layer         → Real Implementation
Transition Algebra          → buildTransition + validateTransition
Conflict Model              → validateTransition + policy + projection mismatch
Thermodynamics              → Scheduler scoring (external)
Stability Model             → Projection over event entropy
Learning Layer              → PolicyEngine updates + Projection heuristics
Self-Model                  → Projection Service (special query)
Governance Layer            → PolicyEngine + auth layer
Identity Layer              → Event replay invariants
```

### Unresolved Follow-Ups
- Does the Self-Model projection need a dedicated service or is it a query pattern?
- How are PolicyEngine updates versioned and governed?

---

## 5. LOSM Service Topology & TypeSpec Contracts v0.1
**Status:** `Agreed`

### Architectural Intent
Define the 4-service architecture with TypeSpec as the single source of truth for contracts. The system is: a TypeSpec-defined, event-sourced execution kernel with strict separation between truth (Kernel), interpretation (Projections), and agency (Scheduler), governed by policy and observable through a thermodynamic UI layer.

### Requirements & Acceptance Criteria
- [ ] **Repo layout:**
  - `losm/contracts/` — TypeSpec (source of truth)
  - `kernel-service/` — Java/Spring (execution engine)
  - `scheduler-service/` — AI/planning layer (Python or Java)
  - `projection-service/` — read/query layer
  - `event-store/` — NATS + persistence adapter
  - `ui/` — Nexus + Orb consumers
  - `losm-ir/` — generated SDKs (TS/Java/Python)
- [ ] **Kernel Service (Spring Boot)** — Only write authority. API: `POST /command`, `POST /transition/validate`, `GET /artifact/{id}/version/latest`. Kernel never calls projections — it only validates, transitions, and emits events
- [ ] **Event Store (NATS + persistence)** — Truth backbone. Topics: `losm.command`, `losm.event`, `losm.transition`, `losm.policy`. Postgres append-only Event table
- [ ] **Projection Service** — Entire UI brain. API: `GET /projection/state/{artifactId}`, `GET /projection/risks/{artifactId}`, `GET /projection/conflicts/{artifactId}`, `GET /projection/ambiguity/{artifactId}`, `GET /projection/diff/{artifactId}`, `GET /projection/blockers/{artifactId}`. Internal: Event Stream → Rebuilder → View Models
- [ ] **Scheduler Service** — AI brain/control system. Inputs: projection API, event history summary, self-model snapshot. Outputs: ONLY Commands (never transitions, never writes state). Loop: pull projections → evaluate entropy gradients → generate candidate commands → rank actions → emit best command to kernel
- [ ] **UI/Orb** — Pure projection consumer. Only calls Projection Service. Never kernel, never event store directly
- [ ] **Critical Boundary Rules (Never Allowed):**
  - UI → Kernel write ❌
  - Scheduler → direct Event write ❌
  - Projection → mutation ❌
  - Kernel → projection calls ❌
  - Self-model → direct state edits ❌
- [ ] **Critical Boundary Rules (Allowed):**
  - Scheduler → Command → Kernel → Event Store → Projection → UI ✅

### Harvested Code Artifacts
#### Purpose: 4-service architecture
```
losm/contracts/           ← TypeSpec (source of truth)
kernel-service/     ← Java/Spring (write authority)
scheduler-service/  ← AI brain (generates Commands only)
projection-service/ ← read model engine
event-store/        ← NATS + Postgres (truth backbone)
ui/                 ← pure projection consumer
```

#### Purpose: Projection service API
```
GET /projection/state/{artifactId}
GET /projection/risks/{artifactId}
GET /projection/conflicts/{artifactId}
GET /projection/ambiguity/{artifactId}
GET /projection/diff/{artifactId}
GET /projection/blockers/{artifactId}
```

#### Purpose: Scheduler loop
```
1. pull projections
2. evaluate entropy gradients
3. generate candidate commands
4. rank actions
5. emit best command to kernel
```

### Unresolved Follow-Ups
- NATS topic schema and serialization format?
- Generated SDK versioning strategy from TypeSpec?
- How does the Scheduler authenticate to the Kernel?

---

## 6. LOSM Runtime MVP Stack v0.1
**Status:** `Agreed`

### Architectural Intent
Define the absolute minimal buildable system — the MVP that collapses all architectural philosophy into real running code. Everything else is evolution.

### Requirements & Acceptance Criteria
- [ ] MVP stack consists of:
  1. **Event Store** (Postgres + NATS) — truth backbone
  2. **Kernel Service** (Spring Boot) — execution engine, only write authority
  3. **Projection Service** (Java or Node) — read model engine
  4. **Scheduler** (Python/LLM agent) — command generation
  5. **Simple UI** (reads projections) — pure consumer
- [ ] No additional services, no abstraction layers, no philosophical infrastructure
- [ ] Repo scaffold: TypeSpec root → Spring Boot kernel skeleton → projection service → NATS event contracts → scheduler agent loop
- [ ] "Everything else is evolution" — the stack is designed to be built incrementally from this base

### Harvested Code Artifacts
#### Purpose: MVP stack definition
```
MVP:
  Event Store    ← Postgres + NATS
  Kernel Service ← Spring Boot
  Projection Svc ← Java or Node
  Scheduler      ← Python/LLM agent
  Simple UI      ← reads projections
```

### Unresolved Follow-Ups
- What is the minimal viable Event schema for MVP?
- Should the first Scheduler be a simple loop or a real LLM agent?
- How much of the Transition Algebra is needed for MVP vs deferred?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | System Identity Model | Agreed | Identity = invariant + semantics + governance |
| 2 | Drift Model & Identity Envelope | Agreed | 4 drift types, envelope, identity error |
| 3 | Minimal Kernel Architecture (5+1) | Agreed | 5 subsystems, runtime loop, read/write paths |
| 4 | Philosophy→Implementation Mapping | Agreed | Every concept → concrete component |
| 5 | Service Topology & TypeSpec Contracts | Agreed | 4 services, boundary rules, 11 API endpoints |
| 6 | MVP Stack | Agreed | Postgres+NATS + Kernel + Projection + Scheduler + UI |

---

*Extracted from `chats/Work Artifact IR Definition.html`, 22 chunks processed (Bulk Export containing multiple sessions). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
