# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Report Schema Analysis.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. Role Lease with Semantic Execution Policy — GROUNDED/FUSION/HYBRID per Role Instance
**Status:** `Agreed`

### Architectural Intent
Replace global 'system mode' (GROUNDED/FUSION) with per-role lease semantic execution policy. A RoleLease becomes: {role, authority, capabilities, semantic_policy (GROUNDED | FUSION | HYBRID), validity_window}. Each active role-instance decides how it is allowed to interpret — Planner may get FUSION, Validator gets GROUNDED, Executor gets STRICT GROUNDED, Explorer gets HYBRID. This is a capability-scoped semantic execution graph rather than a global interpreter state machine. Moves from 'system state' to 'capability contract per actor instance'.

### Requirements & Acceptance Criteria
- [ ] RoleLease includes semantic_policy as first-class field
- [ ] GROUNDED: schema-valid IR only, no extrapolation
- [ ] FUSION: conceptual blending, narrative continuity allowed
- [ ] HYBRID: fusion allowed but tagged/fenced
- [ ] No global mode — each lease has independent policy

---

## 2. Roundtable Arbitration Model — Partitioned Authority + Posture over Shared Knowledge Graph
**Status:** `Agreed`

### Architectural Intent
Define a roundtable arbitration model where multiple role leases with different semantic policies evaluate the same artifact. Each roundtable member has: (1) Structural authority — subgraph/domain slice they own in the knowledge graph, (2) Posture toward artifact — conservative (reject unless strictly valid), permissive (accept if coherent under projection), adversarial (try to break it), exploratory (accept with tagged uncertainty). Members produce both boolean objections (hard reject) and vectorized risk projections (graded signal space).

### Requirements & Acceptance Criteria
- [ ] Each member: {domain_slice, authority (Read|Write|Validate|Execute), posture (Strict|Balanced|Exploratory|Adversarial)}
- [ ] Members produce: boolean objections + vectorized risk projections
- [ ] Authority-based: each member owns a slice of truth
- [ ] Posture modifies evaluation logic per member
- [ ] No free-floating interpretations — every evaluation is role-bound

---

## 3. Two-Phase Decision System — Hard Validation Gate + Risk Projection Surface
**Status:** `Agreed`

### Architectural Intent
Separate artifact acceptance into two phases: Phase 1 (Hard Validation) — binary gate where any REJECT from any roundtable member fails the artifact immediately. This covers correctness, safety, schema compliance. Phase 2 (Risk Projection) — soft surface where members produce concerns, uncertainty estimates, and domain-specific risk vectors. These are aggregated into a RiskProfile: RiskProfile = aggregate(member.risk_vectors), and the decision is accept_if(RiskProfile <= threshold_vector). This separates objection (hard stop) from risk (graded signal space).

### Requirements & Acceptance Criteria
- [ ] Phase 1: ∀ member, member.evaluate(artifact) != REJECT → pass, else fail
- [ ] Phase 2: aggregate risk vectors → RiskProfile, compare to threshold
- [ ] Objections are hard stops, risk vectors are graded signals
- [ ] RiskProfile must be mergeable across members
- [ ] Threshold vector configurable per artifact type or context

---

## 4. Multi-Authority Typed Graph Commit Protocol — Distributed Validation over Partitioned State Space
**Status:** `Agreed`

### Architectural Intent
Define artifact acceptance as a distributed commit protocol over a partitioned knowledge graph. The artifact is a proposed state delta: {delta: GraphMutation, provenance: ExecutionReceipt, intent: WorkRequestIR, confidence: float, projected_effects: [EffectVector]}. Each roundtable member evaluates: 'Is delta valid in my slice?', 'Does this violate my constraints?', 'What risk does this introduce into adjacent partitions?'. The system becomes a commit lattice: propose state delta → distribute to authority partitions → collect objections + risk vectors → compute commit eligibility → commit, reject, or escalate.

### Requirements & Acceptance Criteria
- [ ] Artifact = proposed state delta with provenance and intent
- [ ] Distribution to authority partitions by domain ownership
- [ ] Each member evaluates against own slice + adjacent partitions
- [ ] Commit eligibility = no objections AND risk within threshold
- [ ] Escalation to higher arbitration tier when local arbitration fails

---
