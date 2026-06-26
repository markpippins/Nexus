# Harvested Specification & Code Repository

**Source:** `chats/Nexus - Token Cost Estimation Strategies.html`
**Model:** DeepSeek V4 (manual extraction)
**Batch:** 8
**Total candidates:** 2

---

## 1. Three-Layer Token Cost Strategy — Estimate, Control, Optimize
**Status:** `Observed`

### Architectural Intent
Token cost management operates at three layers: Estimate (predict before sending — 1 token ≈ 4 chars, use model-specific tokenizers like tiktoken), Control (design prompts + data flow — budget-first allocation, sliding window history, summarization layers, retrieval instead of context, structured prompts, tool calls over reasoning text), Optimize (system-level architecture — model tiering, spec→prompt compilation, token simulation, incremental context, reasoning delegation). Most systems accidentally pay for conversation history, system prompts, JSON schemas, tool descriptions, retries, and chain-of-thought scaffolding.

### Requirements & Acceptance Criteria
- [ ] Estimate: 1 token ≈ 4 chars, use model-specific tokenizers
- [ ] Control: budget allocation, sliding windows, summarization layers
- [ ] Optimize: model tiering, prompt compilation, incremental context
- [ ] Hidden cost drivers: history, schemas, tools, retries, CoT scaffolding
- [ ] Real cost = input + output + system prompt + history + tools

---

## 2. Token Cost as Information Architecture Problem — Not Pricing Problem
**Status:** `Agreed`

### Architectural Intent
Token cost is fundamentally an information architecture problem, not a pricing problem. Winning systems minimize repeated information, move from text to structure, and treat context as a memory hierarchy (CPU cache → RAM → Disk → Archive). Context windows are just memory tiers. Naive agent loops explode token cost geometrically. Nexus should own token simulation — build prompt, tokenize locally, estimate cost, reject or compress before sending — enabling hard cost ceilings, per-agent budgets, and per-user pricing.

### Requirements & Acceptance Criteria
- [ ] Token cost = information architecture problem, not pricing
- [ ] Memory hierarchy: cache → RAM → disk → archive
- [ ] Context windows = memory tiers, not static buffers
- [ ] Token simulation before send: build → tokenize → estimate → reject/compress
- [ ] Per-agent budgets, per-user pricing, hard cost ceilings
- [ ] Spec→prompt compilation: TypeSpec → prompt template → validator → structured output

---
