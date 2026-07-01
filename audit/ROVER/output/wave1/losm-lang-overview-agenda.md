# Harvested Specification & Code Repository

**Source:** `LOSM-Lang Overview.html` (Bulk Export — LOSM-Lang design discussion)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 5 Specification Candidates extracted

---

## 1. LOSM-Lang Position in the Stack v0.1
**Status:** `Agreed`

### Architectural Intent
LOSM-Lang occupies the "executable semantics" layer between requirements and implementation, analogous to LLVM IR in a compiler stack. It fills the gap where currently there's a jump from human conversation directly to implementation without an intermediate executable semantic representation.

### Requirements & Acceptance Criteria
- [ ] **Multi-layer stack** (current):
  ```
  Natural Language → Requirements → WorkRequest IR → LOSM-Lang → TESL/TBEL → Execution
  ```
- [ ] **LOSM-Lang solves the missing layer problem**: currently the jump is `requirements → implementation`. The missing layer is `requirements → executable semantics → implementation`
- [ ] **LLVM IR analogy**: LOSM-Lang is a human-readable but formally executable representation of intent — the semantic IR of the LOSM ecosystem
- [ ] **Relationship trajectory**:
  - Current: `Natural Language → WorkRequest IR → Execution`
  - Future: `Natural Language → WorkRequest IR → LOSM-Lang → TESL → Execution`
  - Or possibly: **WorkRequest IR == LOSM-Lang AST** (cleaner — LOSM-Lang is the textual representation of the WorkRequest AST)
- [ ] **Textual/AST parallel**: Like TypeSpec ↔ OpenAPI, or Terraform HCL ↔ Terraform JSON

### Harvested Code Artifacts
#### Purpose: Current and future stack positions
```
Current:  NL → WorkRequest IR → Execution
Future:   NL → WorkRequest IR → LOSM-Lang → TESL → Execution
Or:       NL → WorkRequest IR (== LOSM-Lang AST) → TESL → Execution
```

#### Purpose: LLVM IR analogy
```
LOSM-Lang = LLVM IR for the LOSM ecosystem
A human-readable but formally executable representation of intent
```

### Unresolved Follow-Ups
- Is WorkRequest IR the AST, and LOSM-Lang the textual syntax, or are they separate layers?
- What is the boundary between LOSM-Lang and TESL — where does intent end and execution begin?

---

## 2. LOSM-Lang as Declarative Governance DSL v0.1
**Status:** `Agreed`

### Architectural Intent
LOSM-Lang is **not a programming language for writing software**. It is a **declarative semantic governance language** for expressing intents, work requests, state transitions, invariants, actors, policies, and execution contracts. It describes what software, agents, and workflows are allowed to do — not how to do it.

### Requirements & Acceptance Criteria
- [ ] **Nature**: Declarative, not imperative
- [ ] **NOT**: a loop, a general-purpose programming language, code generation
- [ ] **IS**: workflow DSL, policy language, state machine specification, contract language
- [ ] **Example syntax — state machine style**:
  ```
  state DRAFT
  state CANDIDATE
  state APPROVED
  transition DRAFT -> CANDIDATE requires classification_complete
  transition CANDIDATE -> APPROVED requires governance_receipt
  ```
- [ ] **Example syntax — work request style**:
  ```
  work_request WR-1024 {
    intent:    validate transition requests
    actor:     conduit
    inputs:    TransitionRequest
    outputs:   ValidationReceipt
    invariant: every transition must pass Kernel.validate()
    success:   receipt.status == VALID
  }
  ```
- [ ] **Language definition**: A declarative semantic governance language for expressing intents, work requests, state transitions, invariants, actors, policies, and execution contracts
- [ ] **Positioning**: Not "a language for writing software" but "a language for describing what software, agents, and workflows are allowed to do"
- [ ] **Fits the architectural drift**: away from "AI coding assistant" and toward "governed semantic operating system"
- [ ] **Compared to**: Terraform (declarative resource descriptions), policy languages (OPA), state-machine specifications, and WorkRequest IR — all compiled into TESL for deterministic execution

### Harvested Code Artifacts
#### Purpose: State machine spec syntax (proposed)
```
state DRAFT
state CANDIDATE
state APPROVED

transition DRAFT -> CANDIDATE
    requires classification_complete

transition CANDIDATE -> APPROVED
    requires governance_receipt
```

#### Purpose: Work request syntax (proposed)
```
work_request WR-1024 {
    intent:    validate transition requests
    actor:     conduit
    inputs:    TransitionRequest
    outputs:   ValidationReceipt
    invariant: every transition must pass Kernel.validate()
    success:   receipt.status == VALID
}
```

#### Purpose: Language identity statement
```
NOT:  a language for writing software
IS:   a language for describing what software, agents,
      and workflows are allowed to do
IS:   declarative semantic governance language
```

### Unresolved Follow-Ups
- Exact syntax design — curly-brace block style vs indentation-sensitive?
- What is the formal grammar? Is it a DSL embedded in a host language or standalone?
- How does the "actor" concept map to the role-governance model (Conduit, Vector, etc.)?

---

## 3. LOSM-Lang / TESL / TBEL Three-Layer Compilation Model v0.1
**Status:** `Agreed`

### Architectural Intent
The LOSM execution pipeline separates three distinct layers: **LOSM-Lang** (human-authored semantic language), **TESL** (canonical semantic representation — JSON), and **TBEL** (execution primitives). This mirrors the fundamental intent vs execution distinction that runs throughout the architecture.

### Requirements & Acceptance Criteria
- [ ] **Three layers**:
  - **LOSM-Lang**: Human-authored semantic language. E.g., `approve WR-123`
  - **TESL** (Topological/Transactional Execution Semantics Language): Canonical semantic representation. E.g., `{"operation": "approve", "target": "WR-123"}`
  - **TBEL** (Topological/Transactional Execution Bytecode Language?): Execution primitives. E.g., `LOAD WR-123`, `VALIDATE`, `TRANSITION APPROVED`, `EMIT RECEIPT`
- [ ] **Compilation direction**: LOSM-Lang → compiles to → TESL → executes via → TBEL
- [ ] **Mirrors the intent vs execution distinction**: LOSM-Lang = intent (what), TESL = canonical semantics (how to represent), TBEL = execution (do it)
- [ ] Each layer can be independently validated, versioned, and tested

### Harvested Code Artifacts
#### Purpose: Three-layer pipeline
```
LOSM-Lang  (human-authored semantic language)
  ↓ compiles to
TESL       (canonical semantic representation — JSON)
  ↓ executes via
TBEL       (execution primitives)
```

#### Purpose: Example across all three layers
```
LOSM-Lang:  approve WR-123
TESL:       {"operation": "approve", "target": "WR-123"}
TBEL:       LOAD WR-123 | VALIDATE | TRANSITION APPROVED | EMIT RECEIPT
```

### Unresolved Follow-Ups
- Is TBEL a bytecode format or a set of runtime primitives?
- Does TESL need to be JSON specifically, or is it a semantic IR that could be serialized in multiple formats?
- Where does the compilation happen — at design time, at deploy time, or at runtime?

---

## 4. WorkRequest IR as LOSM-Lang AST v0.1
**Status:** `Proposed`

### Architectural Intent
The cleanest architectural alignment may be that **WorkRequest IR already is the LOSM-Lang AST**. LOSM-Lang becomes the human-readable textual syntax that compiles to/down to the WorkRequest IR data structure. This avoids duplication and keeps the two concepts tightly coupled.

### Requirements & Acceptance Criteria
- [ ] **Hypothesis**: WorkRequest IR == LOSM-Lang AST. LOSM-Lang is simply the textual representation of the WorkRequest AST
- [ ] **Parallels**:
  - TypeSpec ↔ OpenAPI (TypeSpec is the DSL, OpenAPI is the compiled output)
  - Terraform HCL ↔ Terraform JSON (HCL is the human authoring format, JSON is the machine-consumable form)
- [ ] In this model:
  - You write LOSM-Lang (readable, human-friendly)
  - It compiles into WorkRequest IR (structured, machine-manipulable)
  - Which compiles further into TESL (canonical semantic representation)
  - Which executes via TBEL (primitives)
- [ ] **Current reality check**: "I actually think WorkRequest IR may already be the first version of LOSM-Lang." — ChatGPT analysis
- [ ] If true, this means LOSM-Lang design work should focus on the **textual syntax and ergonomics** layer on top of the existing WorkRequest IR schema

### Harvested Code Artifacts
#### Purpose: AST/textual relationship
```
LOSM-Lang (textual syntax)
    ↓ compiles to
WorkRequest IR (AST — already exists)
    ↓ compiles to
TESL (canonical semantic representation)
    ↓ executes via
TBEL (execution primitives)
```

#### Purpose: Analogy table
```
System A             ↔ System B
TypeSpec             ↔ OpenAPI
Terraform HCL        ↔ Terraform JSON
LOSM-Lang (proposed) ↔ WorkRequest IR (existing)
```

### Unresolved Follow-Ups
- This needs a concrete design decision: is WorkRequest IR the AST, or are they separate?
- If WR IR is the AST, what does the LOSM-Lang parser look like?
- How do we version LOSM-Lang syntax changes against the WR IR schema?

---

## 5. PEB as Compiled Semantic Model v0.1
**Status:** `Proposed`

### Architectural Intent
The most powerful possibility explored: instead of architecture documents being prose, they become written in LOSM-Lang. The PEB (Persistent Engineering Brain) becomes a **compiled semantic model** — no longer documentation but executable knowledge about what the system is and does.

### Requirements & Acceptance Criteria
- [ ] **Current state**: Architecture documents are prose (`Conduit routes work requests. Vector allocates resources.`)
- [ ] **Target state**: Architecture is executable knowledge written in LOSM-Lang:
  ```
  actor conduit {
      responsibility: route work_requests
      forbidden:      execute work_requests
  }
  actor vector {
      responsibility: allocate resources
      forbidden:      mutate governance
  }
  ```
- [ ] **Transformation**: The PEB transitions from being documentation to being a **compiled semantic model**
- [ ] LOSM-Lang as the language of the PEB itself — the governance layer writes itself in LOSM-Lang
- [ ] This creates a self-describing system where the architecture specification IS the governance model

### Harvested Code Artifacts
#### Purpose: Architecture as code (PEB as compiled model)
```
actor conduit {
    responsibility: route work_requests
    forbidden:      execute work_requests
}

actor vector {
    responsibility: allocate resources
    forbidden:      mutate governance
}
```
Instead of prose documents, the PEB becomes executable knowledge.

### Unresolved Follow-Ups
- This is highly speculative — what is the incremental path from today's PEB (documentation) to compiled model?
- Does this require the full LOSM-Lang/TESL/TBEL stack to be built first?
- Who authors the LOSM-Lang — human architects, AI agents, or both?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | LOSM-Lang Position in the Stack | Agreed | NL → WR IR → LOSM-Lang → TESL → TBEL; LLVM IR analogy |
| 2 | LOSM-Lang as Declarative Governance DSL | Agreed | NOT a programming language; state machines, policies, contracts |
| 3 | LOSM-Lang / TESL / TBEL Three-Layer Model | Agreed | Human text → canonical JSON → execution primitives |
| 4 | WorkRequest IR as LOSM-Lang AST | Proposed | WR IR may already be the AST; LOSM-Lang = textual syntax |
| 5 | PEB as Compiled Semantic Model | Proposed | Architecture docs → executable knowledge in LOSM-Lang |

---

**Note:** These specifications directly inform the LOSM-Lang design goal. Specs #1–3 are well-agreed design direction. Specs #4–5 are proposed directions that need explicit design decisions. The user indicated that "LOSM" was renamed to "Vision" at some point — this should be reflected in future terminology but has been preserved as "LOSM" in this extraction to match source material.

*Extracted from `chats/LOSM-Lang Overview.html`, 6 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
