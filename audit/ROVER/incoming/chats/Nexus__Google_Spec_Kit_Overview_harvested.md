# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - Google Spec Kit Overview.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Nexus as Operating Layer for Coordinated AI Work — Analogous to Shell, systemd, or Kubernetes for Different Compute Eras
**Status:** `Agreed`

### Architectural Intent
Define Nexus's evolutionary trajectory as an 'operating layer for coordinated AI work,' analogous to the role the shell (program coordination), systemd (process coordination), or Kubernetes (infrastructure coordination) filled for earlier computing paradigms. Nexus specifically focuses on 'continuity of intent' — ensuring that intent survives across model invocations, context windows, and agent handoffs. This is the missing operating layer for the AI era: an abstraction that coordinates cognitive work the way operating systems coordinate computational work.

### Requirements & Acceptance Criteria
- [ ] Nexus = operating layer for coordinated AI work
- [ ] Analogous to shell/programs, systemd/processes, K8s/infrastructure
- [ ] Core focus: continuity of intent across model invocations
- [ ] Intent survives context window boundaries and agent handoffs
- [ ] Operating layer abstraction for cognitive work

---

## 2. Intent Graph vs Document-Centric and Workflow-Centric Models
**Status:** `Agreed`

### Architectural Intent
Identify three categories of intent storage models: (1) Document-Centric — intent stored in static documents (Confluence, Jira), requires manual reconciliation, (2) Workflow-Centric — intent embedded in pipeline steps, rigid and hard to evolve, (3) Graph-Centric (Intent Graph) — intent stored as a graph of interconnected nodes with typed relationships, enabling reconciliation across previously siloed concepts. Nexus should focus on the Intent Graph model to achieve 'intent reconciliation' — the ability to detect and resolve conflicts, connections, and dependencies between intents regardless of which conversation or context they originated in.

### Requirements & Acceptance Criteria
- [ ] Document-centric: Confluence/Jira model — stale, manual
- [ ] Workflow-centric: pipeline-embedded — rigid, hard to evolve
- [ ] Graph-centric (Intent Graph): typed relationship nodes — reconcilable
- [ ] Intent reconciliation: detect conflicts/connections/dependencies across intents
- [ ] Nexus targets the Graph-centric model

---

## 3. Pluggable Preference Model — Spec Kit as Transitional Step Toward Workflow-Agnostic Orchestration
**Status:** `Agreed`

### Architectural Intent
Design Nexus with a pluggable preference model: Nexus remains workflow-agnostic while orchestrating various tools through a compatibility adapter layer. Spec Kit (an open-source spec-driven development toolkit) serves as an example — it can be plugged into Nexus as a transitional step without committing to its workflow model permanently. This allows Nexus to support multiple tools (Spec Kit, custom agents, TypeSpec generators, etc.) through a uniform orchestration interface, keeping the core workflow-agnostic while individual tools define their own workflows.

### Requirements & Acceptance Criteria
- [ ] Nexus is workflow-agnostic — does not mandate one workflow model
- [ ] Pluggable adapter layer for various tools (Spec Kit, agents, generators)
- [ ] Each tool defines its own workflow within Nexus orchestration
- [ ] Tools can be added/removed without changing Nexus core
- [ ] Transitional steps supported — tools graduate or are replaced

---
