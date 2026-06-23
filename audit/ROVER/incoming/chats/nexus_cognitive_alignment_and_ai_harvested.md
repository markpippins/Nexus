# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Cognitive Alignment and AI.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 7
**Total candidates:** 3

---

## 1. Multi-Agent System Design — Six Specialized Agents for Polymath Programming
**Status:** `Specified`

### Architectural Intent
Define a multi-agent system with six specialized roles: (1) Conversation Conductor — translates talk→structured JSON, maintains context, (2) Spec Architect — formalizes specs in TypeSpec/CUE/TLA+, validates constraints, (3) Prompt Engineer — converts specs to optimized prompts, tests variants, maintains prompt library, (4) Implementation Agent — writes code, generates tests, (5) Orchestration Agent — coordinates agents, manages queues/errors, (6) Domain Specialist — injects domain expertise. This replaces the manual talk→JSON→TypeSpec→prompt→wait loop with parallelized agent-driven workflow.

### Requirements & Acceptance Criteria
- [ ] Six specialized agent roles with clear responsibilities
- [ ] Conversation Conductor: talk→structured JSON
- [ ] Spec Architect: JSON→TypeSpec/CUE formalization
- [ ] Prompt Engineer: spec→optimized prompt generation
- [ ] Implementation Agent: prompt→working code + tests
- [ ] Orchestration Agent: sequencing, error handling, dashboards
- [ ] Domain Specialist: domain knowledge injection

---

## 2. OpenCode + Ollama as Practical Implementation Stack
**Status:** `Implemented`

### Architectural Intent
Implement the multi-agent loop using OpenCode as the glue layer and Ollama as the creative engine. OpenCode handles orchestration, transformation, and file generation. Ollama generates prompt variants, tests outputs, and produces implementation stubs. The minimal repeatable loop: talk→JSON→prompt→Ollama→output, with each step handled by an OpenCode script. OpenCode replaces the manual wait-and-reprompt cycle with structured agent pipeline.

### Requirements & Acceptance Criteria
- [ ] OpenCode: orchestration, transformation, file generation
- [ ] Ollama: text generation, prompt testing, code generation
- [ ] Minimal loop: talk→JSON→prompt→Ollama→output
- [ ] OpenCode scripts sequence tasks and handle errors
- [ ] Feedback loop: scoring outputs, auto-refining prompts
- [ ] Persistent state: JSON + outputs stored in repo for tracking

---

## 3. Cognitive Alignment — AI Tooling as Meta-Workflow, Not Shallow Productivity
**Status:** `Observed`

### Architectural Intent
Frame the current AI tooling landscape as a cognitive alignment problem: most users expect AI to replace friction, but are disappointed when it exposes shallow mental models. True leverage comes from designing meta-workflows and multi-agent ecosystems that reason about themselves. The 'axe vs chainsaw' analogy: the axe is more satisfying moment-to-moment, but the chainsaw lets you shape the forest if you know what forest you want. Strategic patience and deep tool investment are rewarded over shallow productivity chasing.

### Requirements & Acceptance Criteria
- [ ] Meta-workflow design over shallow task automation
- [ ] Strategic patience: invest while others burn out on hype
- [ ] Polymath programming: deep domain expertise + tool mastery
- [ ] AI agents enable parallel creative and productive modes
- [ ] Wait times are productive cycles when agents work in parallel

---
