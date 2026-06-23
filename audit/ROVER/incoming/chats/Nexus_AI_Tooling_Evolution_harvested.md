# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - AI Tooling Evolution.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Specification Precision as AI Engineering Skill — Clarity of Intent, Multi-Agent Decomposition, Failure Pattern Recognition
**Status:** `Agreed`

### Architectural Intent
Define specification precision as a core AI-era engineering skill: the ability to communicate intent to an AI with extreme detail, since machines lack human ability to 'read between the lines.' Related skills: evaluation and quality judgment (building systems that detect errors, resisting confidence-based bias from model fluency), multi-agent decomposition (treating AI systems like team members by breaking projects into logical workstreams), and failure pattern recognition (context degradation, specification drift, sycophantic confirmation, cascading failures, silent failures). These skills replace traditional coding manual dexterity.

### Requirements & Acceptance Criteria
- [ ] Specification precision: communicate intent with extreme detail
- [ ] Evaluation/judgment: detect errors despite model fluency
- [ ] Multi-agent decomposition: logical workstreams from complex projects
- [ ] Failure patterns: context degradation, spec drift, sycophancy, cascade, silent failure
- [ ] Trust/security: guardrails, blast radius, human oversight points

---

## 2. Constraint-Oriented Design — Dense Cores + Generative Edges as Architecture Pattern
**Status:** `Agreed`

### Architectural Intent
Define Constraint-Oriented Design as an architecture pattern: small, dense, deterministic cores (engine, state, invariants) surrounded by generative, replaceable edges (UI, persistence, APIs). Core = high conceptual density, minimal files, explicit state, no frameworks. Edge = verbose, generated, replaceable, AI-friendly. The architect/builder defines core invariants and data structures; AI handles edge generation. This is the structural inversion of traditional enterprise architecture: instead of many layers of indirection, the system has a tight core with disposable periphery.

### Requirements & Acceptance Criteria
- [ ] Dense cores: explicit state, tight constraints, minimal files, no frameworks
- [ ] Generative edges: verbose, replaceable, AI-generated
- [ ] Architect defines core invariants and data structures
- [ ] AI handles edge generation (controllers, DTOs, mappings, adapters)
- [ ] Conceptual density tunable per layer: high (core), medium (transforms), low (edges)

---

## 3. Core-Edge Architecture Framework — From Sequencer to Enterprise
**Status:** `Agreed`

### Architectural Intent
Formalize the Core-Edge Architecture framework: Core Layer (engine — dense, deterministic, high conceptual density), Functional/Transformation Layer (shell — bridging core and edges, medium density, testable), Edge Layer (integration — verbose, replaceable, generated). AI is used for edges and functional layers but never touches the core. The framework scales from solo projects (max core density) to small teams (high core density with adapters) to large teams (high core density with readable edges). This maps hardware-style thinking into software organization.

### Requirements & Acceptance Criteria
- [ ] Three layers: Core (dense), Shell (transform), Edge (generated)
- [ ] AI allowed on Shell and Edge layers only
- [ ] Core = 'the chip' — sacred, no AI touch
- [ ] Edge = 'motherboard and I/O circuits' — AI-generated
- [ ] Scales: solo (max density) → team (adapters) → enterprise (readable edges)

---
