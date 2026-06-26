# Harvested Specification & Code Repository

**Source:** `/home/codex/dev/chats/Reviewing LOSM Risk Management System.html`

**Chunks processed:** 21  **Failed:** 0

**Total candidates:** 5

---

## 1. Implement SemanticProjection and SemanticProjectionBuilder
**Status:** `Proposed`

### Architectural Intent
Replace MaterializedReplayView with SemanticProjection as the canonical semantic state surface. SemanticProjection accumulates resolved_concepts and resolves_edges from envelopes or graph mutations, preserves trajectory boundaries, and is reconstructible deterministically. The builder supports from_envelopes(envelopes) using current replay_kernel.py semantics (added_nodes→resolved_concepts, removed_nodes→removes from resolved_concepts, emitted_edges→appends resolve edges).

### Requirements & Acceptance Criteria
- [ ] SemanticProjection must have fields: resolved_concepts, resolves_edges
- [ ] SemanticProjectionBuilder must support from_envelopes(envelopes) constructor
- [ ] Added node in envelope must appear in resolved_concepts
- [ ] Removed node in envelope must be absent from resolved_concepts
- [ ] Emitted edges must be preserved in insertion order
- [ ] Multiple trajectories must remain distinguishable via per-trajectory projection shape

### Unresolved Follow-Ups
- Should concept resolution use existing graph mutation primitives or new semantic mutation wrappers?
- What are the exact interaction boundary rules for chunking?
- How does WorkflowIntent bridge semantic IR/projection into CCNF ExecutionRequest while keeping CCNF transport distinct from semantic extraction?

---

## 2. Define Semantic IR as the Canonical Semantic State
**Status:** `Agreed`

### Architectural Intent
Establish Semantic IR (SemanticConcept, ResolveEdge, Trajectory, ProvenanceBundle, SemanticMutation) as the unified, lossless, replay-independent semantic state surface that replaces the three overlapping representations (replay kernel world, graph mutation world, semantic IR world) with a single canonical representation. SemanticProjection is the filtered view of Semantic IR for a specific purpose.

### Requirements & Acceptance Criteria
- [ ] Semantic IR must be deterministic and replayable even if envelopes or kernel change
- [ ] Semantic IR must unify all models (LLM, DSL interpreter, planner, reducer) under one semantic worldview
- [ ] SemanticProjection must be the 'view' of Semantic IR that WorkingSet consumes
- [ ] Every concept and edge must have provenance for full attribution
- [ ] Risk Blockers and Ambiguity Signatures must operate on Semantic IR, not raw text
- [ ] Semantic IR → WorkflowIntent → ExecutionRequest must be the syscall boundary

### Unresolved Follow-Ups
- Need to define formal Semantic IR Schema, SemanticProjection Schema, Graph Mutation Vocabulary, and WorkflowIntent ABI
- Should the conceptual structure be exactly: concepts + resolve_edges + trajectories + provenance + optional mutations?

---

## 3. Formalize LOSM as a Dual-Mode Cognitive Operating System
**Status:** `Agreed`

### Architectural Intent
Recognize that LOSM has evolved from an agentic pipeline into a cognitive operating system with two execution modes: Conduit (governed, temporal-backed, multi-role kernel-mode cognition) and harnessed NATS subscribers (ungoverned, opportunistic, distributed user-mode cognition). The system now consists of Conduit (WorkRequest Processing Unit), Absorb (ingest parser/semantic membrane), Nebula (intent marketplace queue), Vector (state snapshot system/temporal substrate), and the Knowledge Graph (semantic nervous system).

### Requirements & Acceptance Criteria
- [ ] WorkRequests must flow through roles, each embodied by models with their own context slices
- [ ] WorkRequests can contain DAGs of WorkRequests
- [ ] Strategies, tactics, introspection, reflection, and plans must be first-class citizens
- [ ] Absorb must convert HTML→DocLing→structured semantic substrate→Vector snapshots
- [ ] Nebula must stage work items, requests, tasks, requirements, and analysis artifacts as an intent marketplace
- [ ] Vector must snapshot state, WorkRequests, plans, analysis, and knowledge graph state
- [ ] Knowledge Graph must represent Roles, Plans, Strategies, Tactics, Requirements, WorkRequests, DAGs, Snapshots, State, Code, Intent, Interpretations, and Topologies as nodes with typed edges and lifecycle semantics

### Unresolved Follow-Ups
- Need to formalize: canonical ontology, type system for WorkRequests, lifecycle semantics for nodes, evaluation semantics for DAGs, role contracts, graph invariants, execution invariants, reflection/introspection protocols, governance rules for Conduit vs NATS workers
- Should we pick next: Define WorkRequest type system, specify WorkRequest lifecycle, define role contracts, formalize knowledge graph ontology, or define Conduit vs NATS execution semantics?

---

## 4. Implement Structural Risk Management as Governance Substrate
**Status:** `Agreed`

### Architectural Intent
Build a complete end-to-end risk lifecycle (detection → classification → escalation → structured resolution → long-term learning) expressed as schemas, protocols, and graph-level reasoning. Risk is treated as structural pattern matching (compiler mindset) rather than event detection (compliance mindset). The system continuously senses, classifies, escalates, resolves, and learns from risk signals across the entire semantic filesystem.

### Requirements & Acceptance Criteria
- [ ] Risk Blocker Schema must be a typed artifact that routes itself through the governance graph
- [ ] Failure Pattern Matching Protocol must detect structural risk before execution, even when content appears benign
- [ ] Ambiguity Signature Model must detect underspecified, overdetermined, incoherent artifacts and model disagreement
- [ ] Ambiguity Score Function and Localization Algorithm must be defined
- [ ] Ambiguity Resolution Ledger and Clarity Evolution Model must track resolution state
- [ ] Escalation choreography must follow: Tester → Architect → Topologist → Inspector → Steward → Engineering → Human
- [ ] Risk must be represented as a filesystem tree: /Governance/Risk/{Blockers, OpenQuestions, Ambiguity, Resolutions}

### Unresolved Follow-Ups
- Should we define the Report Schema next, or go deeper into how the orb's clarity signal is computed from the ambiguity ledger and resolution history?
- What is the exact schema for the Report Schema that ties risk detection, ambiguity detection, escalation, resolution, and clarity evolution into a single execution loop?

---

## 5. Define Three Layers of Determinism in LOSM
**Status:** `Proposed`

### Architectural Intent
Establish three distinct layers of determinism that the LOSM system must maintain: importer determinism (HTML import produces identical chunking regardless of environment), replay determinism (kernel replay of same envelopes produces identical graph state across runs), and mutation determinism (graph mutation event hashes remain stable and reproducible).

### Requirements & Acceptance Criteria
- [ ] Importer determinism: same HTML input must produce identical markdown and chunking
- [ ] Replay determinism: same envelope sequence must produce identical replay graph state
- [ ] Mutation determinism: mutation event hashes must be deterministic and reproducible across runs
- [ ] All three determinism layers must be independently verifiable via tests

### Unresolved Follow-Ups
- What are the specific sources of non-determinism in each layer?
- Should there be a combined 'full pipeline determinism' test?

---
