# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Cognitive Projection Model.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. Pending Folder as Canonical Ingestion Boundary — Deterministic Resumption from Semantic Work Queue
**Status:** `Agreed`

### Architectural Intent
Formalize /Engineering/Pending as the single canonical ingestion boundary for execution cognition. When a model starts a session, it resumes from a stateful queue of unresolved intent — not from conversational memory. Flow: Load(ΔWorkSet) → Reconstruct system intent → Resume partial execution graph. This creates three invariants: (1) persistence of intent outside any model, (2) session = interpretation not creation, (3) execution is decoupled from cognition. Models are workers that resume from a known backlog — they never 'own' the plan.

### Requirements & Acceptance Criteria
- [ ] /Engineering/Pending = open causal graph boundary
- [ ] /Engineering/Active = in-flight execution graph
- [ ] /Engineering/Done = committed mutations
- [ ] Session bootstrap must: Load(ΔWorkSet) → Reconstruct intent → Resume execution
- [ ] No model may own plan state — it lives in filesystem state
- [ ] Deterministic resumption: same pending state always produces same initial interpretation frame

---

## 2. Nebula Drag as Governance Event — Human-Authenticated State Transition Layer
**Status:** `Implemented`

### Architectural Intent
Nebula's drag-from-Backlog-to-ToDo is not a UI interaction — it is a governance event: an explicit human-authored state transition that moves work from epistemic space (Backlog — 'this should be considered') to operational space (ToDo — 'this is now active'). This introduces a new class of primitive: BacklogItem → (user drag) → TransitionEvent{from:BACKLOG, to:TODO, actor:HUMAN, timestamp}. Models can suggest readiness but cannot assert execution readiness — only the user can promote work into real execution space.

### Requirements & Acceptance Criteria
- [ ] Drag event must produce: TransitionEvent with from, to, actor, timestamp
- [ ] TransitionEvent must be as authoritative as any model output
- [ ] Models may suggest readiness — they must not assert execution readiness
- [ ] Backlog = epistemic space; ToDo = operational space
- [ ] Drag boundary must be replayable — reconstruct why work entered execution

---

## 3. Task-Bound Context IR — Scope Envelope + Context Projection + Role Cues
**Status:** `Proposed`

### Architectural Intent
Define a Task-Bound Context IR schema that bridges the gap between Nebula output (requirements text) and DeepSeek/Engineering input (model execution). The IR must contain: (1) Scope Envelope — resolution (feature|module|refactor|system), bounded flag, expansion_allowed flag to prevent DeepSeek from deciding scope implicitly; (2) Required Context Projection — explicit file paths, role signals, interpretation_mode to ensure spec/doc is declared as part of the reasoning contract, not just discoverable; (3) Role Cue Injection — primary and secondary reasoning roles so models don't just 'read files', they read them as something.

### Requirements & Acceptance Criteria
- [ ] Scope Envelope: resolution, bounded flag, expansion_allowed flag
- [ ] Required Context Projection: required_files list, role_signals, interpretation_mode (spec-grounded|exploratory|maintenance)
- [ ] Role Cue Injection: primary and secondary reasoning roles
- [ ] Must prevent models from deciding scope or relevant context implicitly
- [ ] Must be emitted with every Backlog→ToDo transition in Nebula

---

## 4. Governance Layer as Transition Interceptor — Risk Gating Over State Transitions
**Status:** `Proposed`

### Architectural Intent
Position the governance layer (Copilot/Risk Blocker Resolution Protocol) as a transition interceptor that gates state transitions rather than reviewing outputs. Once the system has: pending intent graph, mutation history, execution traces — governance can intervene at plan acceptance, execution staging, and commit boundary. This is proactive governance (prevent invalid transitions) rather than reactive governance (detect problems post-execution). The governance layer sits at the boundary between epistemic and operational state.

### Requirements & Acceptance Criteria
- [ ] Governance must intercept at: plan acceptance, execution staging, commit boundary
- [ ] Must gate transitions, not review outputs — proactive not reactive
- [ ] Must have access to: pending intent graph, mutation history, execution traces
- [ ] Must align with hard constraint enforcement model from Self-audit transcript
- [ ] Nebula drag boundary is the natural governance intervention point

---
