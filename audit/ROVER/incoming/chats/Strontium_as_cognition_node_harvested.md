# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Strontium as cognition node.html
**Model:** DeepSeek V4
**Total candidates:** 5
---
## 1. Voyager Query Language (VQL) — Declarative/Procedural DSL for Graph Hypothesis Generation
**Status:** `Proposed`

### Architectural Intent
Design VQL as a declarative/procedural hybrid DSL for traversing and hypothesizing over the Nebula knowledge graph without mutating truth. VQL emits constrained hypotheses — it reads graph state and produces candidate inferences, relationships, and classifications without committing them. This is the query counterpart to Atten's projection generation: Atten generates projections from canonical state; VQL generates hypotheses from knowledge graph state. Both are read-only over truth, write-only to candidate buffers.

### Requirements & Acceptance Criteria
- [ ] VQL must be read-only over Nebula graph — no mutation of truth
- [ ] Must support declarative pattern matching AND procedural traversal
- [ ] Output must be constrained hypotheses with confidence scores
- [ ] Must integrate with the Memory Consolidation Layer for hypothesis validation
- [ ] Query results must be traceable to source graph nodes

### Unresolved Follow-Ups
- What is the formal syntax — SPARQL-inspired, Cypher-inspired, or custom?
- How does VQL handle conflicting hypotheses from different traversal paths?

---

## 2. Memory Consolidation Layer (MC) — Compressing Graph Noise into Stable Semantic Units
**Status:** `Proposed`

### Architectural Intent
Design a Memory Consolidation subsystem that transforms raw, redundant, or noisy graph elements into stable semantic units (entities, concepts, clusters). This is the graph equivalent of memory consolidation in biological systems — short-term, high-detail memories are compressed into long-term, stable representations. MC identifies redundant nodes, merges equivalent entities, resolves conflicting annotations, and produces consolidated concepts with provenance chains back to source observations.

### Requirements & Acceptance Criteria
- [ ] Must identify and merge redundant graph nodes representing the same entity
- [ ] Must resolve conflicting annotations with provenance tracking
- [ ] Must produce consolidated concepts with confidence scores
- [ ] Consolidation must be traceable — every concept links back to source observations
- [ ] Must run periodically (not continuously) to allow graph accumulation between consolidation cycles

### Unresolved Follow-Ups
- What is the deduplication algorithm — embedding similarity, structural isomorphism, or entity resolution?
- How often should consolidation run — time-based, event-count-based, or threshold-based?

---

## 3. Nebula Time-Travel Visualizer — Graph State Frames for Replayable Cognition Analysis
**Status:** `Proposed`

### Architectural Intent
Design a temporal inspection and replay system for Nebula that represents cognition as a sequence of Graph State Frames. Each frame captures the entire knowledge graph at a point in time, enabling replay and analysis of how the system's structure and knowledge evolved. This is the Nebula equivalent of NBK's Trace replay — but at the knowledge graph level rather than the execution level. Frames are produced at consolidation checkpoints and enable time-travel queries: 'what did the system believe about X at time T?'

### Requirements & Acceptance Criteria
- [ ] Graph State Frames must capture full knowledge graph state at a point in time
- [ ] Frames must be produced at consolidation checkpoints
- [ ] Must support time-travel queries: state at specific time, state changes over interval, delta between frames
- [ ] Must integrate with VQL for hypothesis generation over historical states
- [ ] Visualization must render graph topology changes across frames

### Unresolved Follow-Ups
- What is the storage strategy for Graph State Frames — full snapshots or incremental deltas?
- How far back should frames be retained — bounded window or full history?

---

## 4. Autonomous Goal Formation Engine — Self-Directed Epistemic Exploration Loop
**Status:** `Proposed`

### Architectural Intent
Design a Goal Engine that enables the system to generate internal epistemic objectives based on uncertainty, structural voids, and contradictions in the knowledge graph. This closes the loop on a self-referential exploration strategy: the system identifies what it doesn't know, forms goals to investigate, executes VQL queries or requests new observations, and updates its knowledge graph. Goals are internal — they do not drive execution of work requests; they drive epistemic exploration. The Goal Engine transforms the system from passive knowledge accumulation to active, self-directed curiosity.

### Requirements & Acceptance Criteria
- [ ] Goal formation must be triggered by: uncertainty (low confidence), structural voids (missing edges), contradictions (conflicting annotations)
- [ ] Goals must be internal epistemic objectives — not work requests or execution tasks
- [ ] Goal lifecycle: formed → explored → satisfied or reformulated
- [ ] Must integrate with VQL for hypothesis-driven exploration
- [ ] Goal resolution must feed back into Memory Consolidation for knowledge graph updates

### Unresolved Follow-Ups
- How are goal priorities determined when multiple gaps compete for exploration resources?
- What prevents the Goal Engine from exploring forever — what is the satisfaction criterion?

---

## 5. Fixed-Point Theory — Mathematical Foundation for Self-Stabilizing Epistemic Systems
**Status:** `Proposed`

### Architectural Intent
Formalize Fixed-Point Theory as the mathematical foundation for the self-stabilizing epistemic system. A self-referential knowledge system that observes, consolidates, and forms goals must eventually reach a stable state where new observations no longer produce significant graph changes. The fixed point is reached when: consolidation produces no new concepts, VQL hypotheses are confirmed (not novel), and the Goal Engine generates no new objectives. This makes the system mathematically analyzable — convergence, stability, and completeness can be proven rather than observed.

### Requirements & Acceptance Criteria
- [ ] Define fixed-point condition: Δ(graph) → 0 over successive consolidation cycles
- [ ] Prove convergence: under bounded observation input, the system reaches a fixed point in finite time
- [ ] Prove stability: once at fixed point, small perturbations (new observations) cause bounded graph changes
- [ ] Prove completeness: all deducible knowledge from observations is eventually consolidated
- [ ] Fixed-point analysis must not require the system to actually halt — it's a theoretical property

### Unresolved Follow-Ups
- What mathematical framework — domain theory, lattice theory, or category theory?
- How does the fixed-point property interact with the Goal Engine's exploration — doesn't exploration inherently change the graph?

---
