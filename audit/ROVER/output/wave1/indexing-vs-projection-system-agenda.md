# Harvested Specification & Code Repository

**Source:** `Indexing vs Projection System.html` (Bulk Export — Indexing vs Projection analysis, Nebula/KG two-layer split)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 4 Specification Candidates extracted

---

## 1. Indexing vs Projection Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
DeepSeek proposed an "indexing" system (Query → Classify → Store) for harvest candidates, but analysis reveals it's actually describing a **projection engine over a graph-annotated event log**, not a traditional index. The three distinct layers are: raw canonical store (source of truth), derived semantic layer (classification), and materialized views (markdown/graph/cross-reference projections).

### Requirements & Acceptance Criteria
- [ ] Three distinct architectural layers, not one:
  - **Layer 1: Raw canonical store** — harvests table in Nebula. Immutable operational records
  - **Layer 2: Derived semantic layer** — domain classifications, enrichments, labels. Built by classifying candidates
  - **Layer 3: Materialized views** — projections, markdown indexes, graph links. Regenerated from Layers 1+2
- [ ] The "indexing" term is misleading — what's actually being built is a **projection engine**:
  - Raw event store (harvest table) → semantic reduction operator → materialized views
  - The classification step is the actual "kernel": Candidate → DomainVector
- [ ] The LLM is used as an **non-deterministic labeling function inside a deterministic system** — this is a good pattern only if treated as untrusted enrichment, not truth
- [ ] Three indexing strategies are mixed without naming them:
  - **Batch ETL index** (curl script) — good for bootstrap, bad for evolution
  - **Heuristic classifier** (keyword regex) — deterministic, debuggable, low fidelity
  - **LLM classifier** — high fidelity, non-deterministic, needs human review
- [ ] **Keep it live** — wire classification into the harvest pipeline so every new harvest run auto-classifies its candidates; the domain index stays current without manual re-indexing

### Harvested Code Artifacts
#### Purpose: Three-layer projection architecture
```
Layer 1 — Raw canonical store:  harvests table (truth)
Layer 2 — Derived semantic layer: domain classifications (enrichment)
Layer 3 — Materialized views: markdown, graph links, projections
```

#### Purpose: Classification as semantic reduction
```
Candidate → DomainVector
LLM = non-deterministic labeling function inside deterministic system
Pattern: ingest → normalize → classify → project → materialize → incremental sync
```

### Unresolved Follow-Ups
- The original question (indexing vs projection) is resolved in favor of "projection system" — this should be reflected in terminology across the architecture docs
- How does this relate to the nebula-mcp projection system currently in development?

---

## 2. Domain Taxonomy for Harvest Candidates v0.1
**Status:** `Proposed`

### Architectural Intent
A standardized 10-domain taxonomy for classifying harvested architectural specification candidates. Enables cross-referencing, projection, and navigation across the knowledge graph.

### Requirements & Acceptance Criteria
- [ ] Ten domains defined:
  1. **Broker/Mesh** — broker, pipeline, gateway, mesh
  2. **Governance/Policy/Constitution** — constitution, governance, policy, civic
  3. **TypeSpec/Contracts/CodeGen** — typespec, openapi, contract, schema, generator
  4. **Agent Architecture/Leases** — lease, agent, scheduler, orchestrator
  5. **Knowledge Infrastructure** — knowledge, ontology, glossary, index
  6. **Formal Verification (TLA+/CUE)** — tla, cue, invariant, proof
  7. **Capability/Intent Graph** — capability, intent, graph
  8. **Event-Driven Architecture** — event, stream, kafka, log
  9. **Service Validation** — validation, test, verify
  10. **UI/Component Spec** — ui, component, spec
- [ ] Two classification approaches:
  - **Path A — LLM classification** (preferred): Feed candidate titles + descriptions through inference pass. Prompt defines domain taxonomy. Returns `{title, domains[], confidence}`. Candidates can belong to multiple domains
  - **Path B — Keyword heuristics** (faster, less accurate): Python script with regex/term matching per domain
- [ ] Three storage options (combine all three):
  - Nebula projection — SQL query grouping by domain tag, rendered to markdown
  - agent_record — `nebula_create_agent_record` with `recordType: "analysis"`, `tags: ["domain-index"]`
  - Cross-references — `nebula_create_cross_reference` linking each candidate to a domain System entity

### Harvested Code Artifacts
#### Purpose: Keyword heuristic classifier
```
broker|pipeline|gateway|mesh            → Broker/Mesh
constitution|governance|policy|civic    → Governance/Policy
typespec|openapi|contract|schema|generator → TypeSpec/Contracts
lease|agent|scheduler|orchestrator      → Agent Architecture
tla|cue|invariant|proof                 → Formal Verification
capability|intent|graph                 → Capability/Intent Graph
event|stream|kafka|log                  → Event-Driven Architecture
knowledge|ontology|glossary|index       → Knowledge Infrastructure
```

#### Purpose: Nebula cross-reference storage pattern
```
Store domain taxonomy as Systems in nebula
Create cross-references from each candidate to its domains
Project the index to markdown (regeneratable view)
```

### Unresolved Follow-Ups
- Should the domain taxonomy be formalized as a nebula System or as tags?
- How to handle domain evolution (merging, splitting, deprecating domains)?
- LLM classification quality assurance — what is the human review workflow?

---

## 3. Nebula/KG Two-Layer Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
A clean two-layer separation between **Nebula** (externalized work memory / execution substrate) and **KG** (internal associative memory / grey matter). This prevents the common failure of mixing state of the world, interpretation of the world, and actions on the world.

### Requirements & Acceptance Criteria
- [ ] **Nebula Layer** — externalized work memory:
  - Role: filing cabinets, todo lists, operational state, execution history
  - Contains: tasks, artifacts, concrete objects of work
  - Behavior: filesystem, ticket system, work queue, execution trace store
  - Nature: ground truth of tasks, immutable operational records
  - Key property: NOT reasoning space
- [ ] **KG Layer** — internal associative memory (grey matter):
  - Role: semantic clustering, conceptual adjacency, interpretation graph
  - Contains: retrieval scaffolding, concept maps
  - Behavior: cortex, association network, traversal heuristic layer
  - Nature: mutable conceptual structure, optimized for reasoning not storage
  - Key property: "how the system thinks about work"
- [ ] **Critical invariants**:
  - KG can **reference** Nebula but never **become** Nebula
  - Nebula is always the source of operational truth
  - KG is always an interpretive overlay
  - Conceptual structures must NOT leak into state
  - You can rewrite "thinking" (KG) without touching "work history" (Nebula)
  - Ontology evolution does not corrupt execution history
- [ ] **Flow pattern**:
  ```
  Agent Query → KG (interpretation / traversal plan) → Nebula (tasks / artifacts) → Result → Nebula updates → KG updates (Steward-curated)
  ```
- [ ] KG = brain decides where to look; Nebula = eyes + hands interacting with reality

### Harvested Code Artifacts
#### Purpose: Two-layer architecture summary
```
Layer         Role                          Analogy
Nebula        Execution / artifacts / tasks  Filing cabinets (work memory)
KG            Meaning / structure / relations Grey matter (associative memory)

Nebula = external world of work
KG = internal model of that world

Invariant: KG can reference Nebula, but never become Nebula
```

#### Purpose: Three-system anti-pattern prevention
```
Most systems fail by mixing:
  (1) state of the world
  (2) interpretation of the world
  (3) actions on the world

Nebula/KG split cleanly separates:
  (A) Object layer (Nebula) — grounded truth, immutable-ish records
  (B) Interpretation layer (KG) — mutable conceptual structure, reasoning-optimized
```

### Unresolved Follow-Ups
- Where does the "Studies" concept (external knowledge) fit in this two-layer model?
- Does Conduit sit between Nebula and KG as a governance/routing layer?
- How does the KG get populated initially — bootstrap from Nebula schema?

---

## 4. Steward Role in Two-Layer System v0.1
**Status:** `Agreed`

### Architectural Intent
With the Nebula/KG two-layer split clarified, the **Steward** role becomes much more specific: Steward is the maintenance process for the grey matter layer (KG), not the owner of operational truth or controller of work. This prevents the Steward from becoming a bottleneck or single point of authority over all reality.

### Requirements & Acceptance Criteria
- [ ] **Steward is NOT**:
  - Owner of truth (that's Nebula)
  - Controller of work (that's Conduit/Agents)
  - Single authority over execution state
- [ ] **Steward IS**:
  - The maintenance process for the grey matter layer (KG)
  - Curator of concepts and associations
  - Decides what "clusters" exist
  - Decides what relationships are meaningful
  - Reorganizes concepts and updates associations
- [ ] **Critical boundary**: Steward does NOT own Nebula reality. Nebula stays grounded and shared
- [ ] KG becomes the **cognitive routing system** used to decide how to traverse Nebula:
  - KG = brain decides where to look
  - Nebula = eyes + hands interacting with reality
  - KG provides a traversal plan; Nebula executes against real work artifacts
- [ ] **Stability win**: conceptual refactors don't destroy operational truth; you can "rethink the brain" while preserving the body

### Harvested Code Artifacts
#### Purpose: Steward role definition
```
Steward = maintenance process for the grey matter layer (KG)
Steward does NOT own Nebula reality
Nebula stays grounded and shared

Steward responsibilities:
  - reorganize concepts
  - update associations
  - decide what clusters exist
  - decide what relationships are meaningful
```

### Unresolved Follow-Ups
- How does Steward interact with KG — through the nebula-mcp API, or a separate KG-specific interface?
- What is the relationship between Steward and Conduit — does Steward govern KG while Conduit governs execution?
- What is the human-in-the-loop role for Steward, or is it fully automated?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Indexing vs Projection Architecture | Agreed | Three-layer projection system; LLM as non-deterministic labeling; classification is the kernel |
| 2 | Domain Taxonomy for Harvest Candidates | Proposed | 10 domains; two classification paths; three storage options |
| 3 | Nebula/KG Two-Layer Architecture | Agreed | Nebula = work memory, KG = grey matter; critical invariants for clean split |
| 4 | Steward Role in Two-Layer System | Agreed | Curator of cognition; KG maintenance process; does NOT own Nebula reality |

---

*Extracted from `chats/Indexing vs Projection System.html`, 50 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
