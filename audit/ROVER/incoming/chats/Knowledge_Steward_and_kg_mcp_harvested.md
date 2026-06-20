# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Knowledge Steward and kg-mcp.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. CQRS for Knowledge Graph — Steward as Command Side, kg-mcp as Query Side
**Status:** `Agreed`

### Architectural Intent
Apply CQRS (Command Query Responsibility Segregation) to the Knowledge Graph architecture: Knowledge Steward is the command side — the sole authorized writer for semantic/ontological mutations. kg-mcp is the query side — deterministic, read-only access to the graph. This creates a hard boundary: to mutate meaning, you must go through Steward. To observe meaning, you go through kg-mcp. This separation prevents accidental semantic corruption and enables independent scaling of reads vs writes.

### Requirements & Acceptance Criteria
- [ ] Knowledge Steward: sole authorized writer for semantic/ontological mutations
- [ ] kg-mcp: deterministic, read-only query access to the graph
- [ ] Hard boundary enforced — kg-mcp must never write; Steward must gate all semantic writes
- [ ] Three query layers on kg-mcp: Structural (graph math), Ontological (LOSM semantics), Derived Reasoning (computed views)

---

## 2. Three Write Authority Models — Steward-Owns-All vs Steward-Approves vs Steward-Governs-Semantics
**Status:** `Proposed`

### Architectural Intent
Define three write authority models for the Knowledge Graph and select the appropriate one: (1) Steward owns every write — all mutations go through Steward, simplest but highest bottleneck; (2) Steward approves all writes — separate executors propose mutations, Steward validates and commits; (3) Steward governs semantics only — Steward owns ontology/semantics (concepts, classifications, relationships), while other processes can write operational events, observations, and evidence directly. Model 3 separates 'Observation' from 'Interpretation' — anyone can record what happened, but only Steward decides what it means.

### Requirements & Acceptance Criteria
- [ ] Model 1: Steward owns every write — simplest, highest bottleneck
- [ ] Model 2: Steward approves writes — separate executors propose, Steward validates+commits
- [ ] Model 3: Steward governs semantics only — owns concepts/classifications/relationships; others write observations/events/evidence
- [ ] Model 3 must enforce: Observation (anyone) vs Interpretation (Steward-only) boundary
- [ ] Selection rationale must be documented

---

## 3. Semantic Truth Invariant — Observation vs Interpretation Boundary
**Status:** `Agreed`

### Architectural Intent
Enforce a hard invariant: Steward governs semantic meaning (concepts, classifications, relationships, ontology) while other processes may record objective observations and evidence without requiring authorization. This separates 'what happened' from 'what it means.' Observations are append-only facts — anyone can contribute them. Interpretations are governed mutations — only Steward can change what things mean. This is the semantic equivalent of the Facts/State/Knowledge epistemic layering.

### Requirements & Acceptance Criteria
- [ ] Observations: append-only, anyone can write, objective facts/events/evidence
- [ ] Interpretations: governed, Steward-only, semantic meaning/concepts/classifications/relationships/ontology
- [ ] Boundary must be enforced at the write path — no process except Steward may mutate semantic meaning
- [ ] Observation stream must be replayable — interpretations can be re-derived from observations

---
