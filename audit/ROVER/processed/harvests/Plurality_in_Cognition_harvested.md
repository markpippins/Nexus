# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Plurality in Cognition.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. Governance as Substrate, Not Wrapper — Below the Agent Level
**Status:** `Agreed`

### Architectural Intent
Invert the conventional governance model: governance is not a wrapper around a capable system (Model → Safety Layer → Governance Layer), but part of the substrate itself (Governance → Identity → State → Authority → Execution). The system literally cannot act without passing through governance primitives — authority, jurisdiction, capabilities, obligations, provenance are built into the actor model itself. A state transition that cannot establish legitimacy does not exist.

### Requirements & Acceptance Criteria
- [ ] Governance must be part of execution substrate, not a wrapper layer
- [ ] Actor model must include: authority, jurisdiction, capabilities, obligations, provenance
- [ ] State transitions must establish legitimacy before execution
- [ ] Safe failure: no governance path → state transition rejected

---

## 2. Constitutional Posture — Procedural Governance over Outcome Governance
**Status:** `Agreed`

### Architectural Intent
Replace outcome-oriented governance ('should the AI do X?') with procedural governance ('can this transition be ratified?', 'can this fact be accepted?', 'can this actor speak on this topic?', 'can this proposal survive review?'). The system answers procedural questions, not ethical ones. The default posture is 'guilty until proven coherent' — legitimacy must be earned through process, not assumed. Procedural systems scale better than ethical systems because they require agreement about process, not outcomes.

### Requirements & Acceptance Criteria
- [ ] Governance questions are procedural: ratification, acceptance, authority, survivability
- [ ] Default posture: proposals are illegitimate until proven coherent through process
- [ ] No outcome-based gatekeeping — only process-based gatekeeping
- [ ] Procedural agreement replaces outcome agreement

---

## 3. Ontological Decomposition by Concept — Not by Technical Layer or Actor Type
**Status:** `Agreed`

### Architectural Intent
Decompose the system by fundamental concepts (Reality, Memory, Authority, Intent, Capability, Legitimacy, Topology, History) rather than by technical concern (API, Database, UI, Queue) or actor (Planner, Worker, Manager). Components are created when a distinction is discovered that should not be collapsed: Store != Shell, Reality != Observation, Fact != Proposal, Authority != Capability, Agenda != Ratification, Memory != History. This yields a more durable foundation because concepts like reality, authority, provenance, and legitimacy are structural properties of any long-lived cognitive system.

### Requirements & Acceptance Criteria
- [ ] Decompose by concept, not by technical layer or actor type
- [ ] Each discovered distinction between two things becomes separate component
- [ ] Concepts: Reality, Memory, Authority, Intent, Capability, Legitimacy, Topology, History
- [ ] No anthropomorphic metaphors — no 'Planner thinks' or 'Reviewer wants'
- [ ] First-class concepts replace human job descriptions

---

## 4. Citizenship Model — Identity, Reputation, Trust, Authority Independently Assigned per Actor
**Status:** `Agreed`

### Architectural Intent
Define a citizenship model where actors have identity (who they are), reputation (track record), trust (confidence level), authority (what they can do), voting rights (participation in decisions), execution rights (ability to commit state changes), and observational rights (what they can see) — all independently assigned. Existence alone is not enough for an actor to act. This replaces the conventional 'agent exists because someone instantiated it' model with a constitutional system where an actor's permissions are a multi-dimensional capability space rather than a binary existence flag.

### Requirements & Acceptance Criteria
- [ ] Identity, reputation, trust, authority, voting rights, execution rights, observational rights — independent assignment
- [ ] No actor acts solely by virtue of existence
- [ ] Multi-dimensional permission space per actor
- [ ] Constitutional system replaces instantiation-based existence model

---
