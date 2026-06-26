# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/LOSM-Lang Overview.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. LOSM-Lang — Declarative Semantic Governance Language for the LOSM Ecosystem
**Status:** `Proposed`

### Architectural Intent
Define LOSM-Lang as a declarative (not imperative) semantic governance language occupying the layer between WorkRequest IR and TESL in the compilation stack. LOSM-Lang is human-authored but formally executable — expressing intents, work requests, state transitions, invariants, actors, policies, and execution contracts. It compiles to TESL (canonical semantic representation), which executes via TBEL (execution primitives). Not a programming language — a fusion of Terraform HCL, policy languages, state-machine specifications, and WorkRequest IR.

### Requirements & Acceptance Criteria
- [ ] Declarative, not imperative — no loops, no control flow
- [ ] Compiles to TESL (canonical JSON semantic representation)
- [ ] TBEL as execution primitive backend
- [ ] Supports: state machine specs, policy rules, actor definitions, transition contracts
- [ ] Human-readable textual form of WorkRequest AST

---

## 2. LOSM Compilation Stack — Natural Language → WorkRequest IR → LOSM-Lang → TESL → TBEL → Execution
**Status:** `Proposed`

### Architectural Intent
Formalize the five-layer compilation stack: Natural Language → WorkRequest IR → LOSM-Lang → TESL → TBEL → Execution. WorkRequest IR may equal LOSM-Lang AST (analogous to TypeSpec ↔ OpenAPI or Terraform HCL ↔ JSON), making LOSM-Lang the textual representation of the WorkRequest AST. Each layer has distinct semantics: LOSM-Lang = human-authored intent, TESL = canonical representation, TBEL = execution primitives.

### Requirements & Acceptance Criteria
- [ ] Five clearly separated layers with defined compilation boundaries
- [ ] WorkRequest IR may be identical to LOSM-Lang AST (deduplication opportunity)
- [ ] LOSM-Lang: human-authored, declarative, governance-focused
- [ ] TESL: canonical JSON, deterministic, model-independent
- [ ] TBEL: execution primitives, runtime-optimized

---

## 3. PEB as Compiled Semantic Model — Architecture Docs Become Executable Knowledge
**Status:** `Proposed`

### Architectural Intent
Evolve the PEB (Policy Enforcement Boundary) from prose documentation into a compiled semantic model written in LOSM-Lang. Instead of Markdown architecture documents ('Conduit routes work requests'), use executable semantic declarations defining actors, responsibilities, and forbidden operations. The PEB becomes a compiled artifact — not documentation but a verifiable constraint specification that can be checked against runtime behavior.

### Requirements & Acceptance Criteria
- [ ] PEB authored in LOSM-Lang as actor/responsibility/constraint declarations
- [ ] PEB must be compilable to TESL for runtime verification
- [ ] Architecture documents dual-publish: LOSM-Lang source + compiled human-readable form
- [ ] PEB violations detectable at runtime via constraint checking against execution traces
- [ ] Forbidden operations must be machine-enforceable, not just documented

---
