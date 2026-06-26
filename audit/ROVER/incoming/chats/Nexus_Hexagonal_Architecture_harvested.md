# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - Hexagonal Architecture.html
**Model:** DeepSeek V4
**Total candidates:** 1
---
## 1. Capability Graph — Nodes as Organizational Capabilities, Edges as Relationships (Triggers, Dependencies, Constraints)
**Status:** `Proposed`

### Architectural Intent
Define software through a Capability Graph where Nodes represent organizational capabilities and Edges represent relationships (triggers, dependencies, constraints). This is the structural inversion from traditional code-first to capability-first: Organization Intent → Capability Models → Graph Representation → Generated Systems/Code (last). TypeSpec defines the capability contracts on the graph. The capability graph becomes the source of truth from which code, infrastructure, and workflows are projected. This moves beyond hexagonal architecture into domain/capability thinking.

### Requirements & Acceptance Criteria
- [ ] Capability Graph: nodes = capabilities, edges = triggers/dependencies/constraints
- [ ] Structural inversion: Intent → Capabilities → Graph → Code (last)
- [ ] TypeSpec defines capability contracts at the graph level
- [ ] Code/Infrastructure/Workflows = projections from the graph
- [ ] Semantic core independent of implementation technology

---
