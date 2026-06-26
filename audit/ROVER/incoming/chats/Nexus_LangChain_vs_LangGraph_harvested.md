# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - LangChain vs LangGraph.html
**Model:** DeepSeek V4
**Total candidates:** 2
---
## 1. Dark Factory Pattern — TypeSpec-Governed Looping Agent with Evaluation Contract
**Status:** `Proposed`

### Architectural Intent
Define the 'dark factory' pattern: a looping agent that continuously refines candidates (code, data, config) until they satisfy evaluation criteria. Core components: Candidate (generic typed item with id, value, timestamp), Evaluator (maps Candidate → EvaluationResult: {success: bool, score: float?, feedback: string?}), LoopMetadata (attempt, maxAttempts, lastFeedback), LoopingEvaluation (candidate + result + loop). TypeSpec defines the evaluation contract — the persistent concept across projects. The evaluator is the contract between agent and system: defines success, failure, and feedback for iteration.

### Requirements & Acceptance Criteria
- [ ] Candidate<T>: generic typed item with id, value, timestamp
- [ ] Evaluator: maps Candidate → EvaluationResult
- [ ] EvaluationResult: success, optional score, optional feedback
- [ ] LoopMetadata: attempt, maxAttempts, lastFeedback
- [ ] LoopingEvaluation: candidate + result + loop combined
- [ ] TypeSpec models define persistent evaluation contract across projects

---

## 2. Agent Integration via Shared TypeSpec Contracts — Baseline Agreement Across Multi-Agent Workflows
**Status:** `Agreed`

### Architectural Intent
In multi-agent workflows, TypeSpec acts as a shared baseline contract that prevents integration failures: all agents know the shape of data they consume and produce. Edge alignment: if Agent A output is Agent B input, both see same TypeSpec for that connection. Each agent only needs its assigned contract slice plus neighboring edges in its context window. TypeSpec doubles as human-readable documentation and machine-enforceable schema. In a 3-agent pipeline (Collector → Cleaner → Reporter), each agent validates inputs/outputs against TypeSpec models, preventing schema drift.

### Requirements & Acceptance Criteria
- [ ] TypeSpec as shared baseline contract across agents
- [ ] Each agent sees its contract slice + neighbor edges
- [ ] TypeSpec = doc + validation in one
- [ ] Edge alignment: Agent A output = Agent B input via same TypeSpec
- [ ] Context window only needs relevant contract fragment

---
