# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Bigger IDE for AI.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 8
**Total candidates:** 2

---

## 1. Nexus as Personal Control Plane — System-First Architecture
**Status:** `Agreed`

### Architectural Intent
Nexus is not a traditional IDE or chatbot tool — it's a personal control plane that manages services, TypeSpec-based contracts, orchestration, and work-path-based states. System-first architecture: controlling a 'system of systems' rather than just writing lines of code. AI capabilities are pluggable layers (Nebula for requirements, smart wizards, MCP integration) on top of AI-agnostic infrastructure. Editor-agnostic: delegates file editing to Zed while Nexus focuses on markdown-based structured documents and orchestration.

### Requirements & Acceptance Criteria
- [ ] Nexus = personal control plane, not IDE or chatbot
- [ ] System-first: manage services, contracts, orchestration
- [ ] AI-agnostic infrastructure: AI as pluggable layer, not foundation
- [ ] Editor-agnostic: Zed for editing, Nexus for orchestration
- [ ] Markdown-based structured documents as primary artifacts

---

## 2. MCP Inversion — Nexus as Capability Provider, Not Consumer
**Status:** `Proposed`

### Architectural Intent
Define a future-proof relationship with the AI space where Nexus provides capabilities (via broker orchestrating services and TypeSpec contracts) that an MCP server can interface with — rather than Nexus being a passive user of a fixed MCP concept. This is MCP inversion: Nexus exposes its orchestration, contracts, and service capabilities as an MCP server, making it agent-addressable. Priority is building 'solid bedrock' of distributed systems, console UI, and CI/CD integration while treating AI advancements as a decoupled exercise.

### Requirements & Acceptance Criteria
- [ ] Nexus provides capabilities for MCP to interface with
- [ ] MCP inversion: Nexus as MCP server, not MCP consumer
- [ ] TypeSpec contracts + broker orchestration as MCP capabilities
- [ ] Solid bedrock first: distributed systems, console UI, CI/CD
- [ ] AI tracking as decoupled exercise, not integrated dependency

---
