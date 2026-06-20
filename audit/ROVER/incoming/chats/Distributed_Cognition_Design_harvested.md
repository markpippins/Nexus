# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Distributed Cognition Design.html
**Model:** DeepSeek V4
**Total candidates:** 1
---
## 1. Epistemic Layering — Facts vs State vs Knowledge with OLAP Projection Engine
**Status:** `Proposed`

### Architectural Intent
Design an epistemic layering that separates Facts (raw external inputs), State (internal beliefs/graph), and Knowledge (RAG-based external context). Nexus acts as a query surface holding stable identifiers, event history, graph relationships, and internal facts. OLAP functions as a lightweight projection engine for slice-and-dice analytics — read-only regarding Nexus state. External Answers Store (RAG) provides just-in-time context extension. This three-layer epistemic model prevents category confusion between what happened, what the system believes, and what external knowledge exists.

### Requirements & Acceptance Criteria
- [ ] Facts: raw external inputs — immutable event records
- [ ] State: internal beliefs/graph — the system's current understanding
- [ ] Knowledge: RAG-based external context — just-in-time cognition extension
- [ ] OLAP Layer: structured aggregation surface — read-only regarding Nexus state
- [ ] OLAP observes but does not define or mutate Nexus truth
- [ ] External Answers Store (RAG): context fragments for query-time enrichment

### Unresolved Follow-Ups
- What is the synchronization contract between Nexus state and OLAP projections — eventual consistency or transactional?
- How are Searcher Agents governed — do they require leases like other agents?

---
