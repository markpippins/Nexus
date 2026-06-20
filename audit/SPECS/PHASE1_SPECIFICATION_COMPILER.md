> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

# Phase 1: Specification Compiler v1

## Core Idea

Phase 1 is a deterministic transformation pipeline:

```
Prompt → Requirements → WorkRequests
```

Nothing is executed here. Nothing "happens" in the external world yet. This phase only decides what should happen and under what constraints.

**Think**: compiler front-end + optimizer + IR generator.

---

> **Phase 1 operates within `ExecutionState` context established by the control plane.**
> It does not re-derive intent or influence routing. `normalize-intent` is the exclusive owner of `ExecutionState` derivation (`COMPILER_ARCHITECTURE.md §1.1`).
>
> This phase consumes `ExecutionState` as a read-only execution contract.

## 1. Stage A — Prompt Ingestion (Front-End Parsing)

### Input

User prompt.

### Output

- `PromptSubmitted` event
- `PROMPT_RECORDS/{id}` artifact

### Responsibilities

- Store the prompt verbatim
- Normalize structure
- Attach context (session, memory, prior state)

### Constraint

At this stage, no "solution thinking" is allowed. Only structural preparation.

---

## 2. Stage B — Requirement Extraction (AST Construction)

This is the most important stage of Phase 1. It converts unstructured intent into structured constraints.

### 2.1 What a Requirement is

A Requirement is a constraint-bearing unit of intent. Not a task, not a plan, not an action. It answers:
- What must be true
- What must be produced
- What must be avoided
- What constraints exist

### 2.2 Output

Events:
- `RequirementCreated`
- `RequirementRefined` (optional iterations)
- `RequirementValidated`

Artifacts:
- `REQUIREMENTS/{id}`

### 2.3 Example transformation

```
Prompt: "Build a MIDI sequencer that supports Euclidean patterns and swing timing"

Requirements extracted:
  R1: System must generate Euclidean rhythm sequences
  R2: System must support swing timing adjustment
  R3: Output must be MIDI-compatible
  R4: System must support real-time playback
```

Each becomes:
```json
RequirementCreated {
  "req_id": "REQ-001",
  "source_prompt": "P1",
  "type": "functional",
  "intent": "System must generate Euclidean rhythm sequences"
}
```

### 2.4 Refinement loop

This is where the compiler becomes "smart":
- Merge duplicates
- Resolve ambiguity
- Detect missing constraints
- Split compound requirements

### 2.5 Validation gate

Before proceeding, the RequirementSet must be:
- Non-contradictory
- Minimally complete (for execution)
- Internally consistent

If not → emit `RequirementRejected` or `RequirementNeedsClarification`.

---

## 3. Stage C — WorkRequest Generation (IR Lowering)

Convert requirements into executable structure. Equivalent to lowering AST → intermediate representation → execution plan.

### 3.1 What a WorkRequest is

A WorkRequest is a bounded executable unit derived from requirements. It is NOT execution yet. It is:
- Structured task definition
- Tool/skill selection candidate
- Dependency-aware unit

### 3.2 Transformation rule

```
RequirementSet → WorkRequestGraph
```

Each WorkRequest:
- Satisfies one or more requirements
- Is executable by a subsystem
- Has defined inputs/outputs

### 3.3 WorkRequest structure

```json
WorkRequest {
  "id": "WR-001",
  "satisfies": ["REQ-001", "REQ-002"],
  "inputs": [...],
  "outputs": [...],
  "execution_strategy": "skill/tool hint",
  "dependencies": ["WR-002"]
}
```

### 3.4 WorkRequest graph formation

WorkRequests form a DAG, not a linear list:

```
WR1 → WR2 → WR3
```
or:
```
        → WR2
WR1 →
        → WR3
```

### 3.5 Optimizer pass

At this stage the compiler may:
- Merge WorkRequests
- Reorder execution for efficiency
- Parallelize independent branches
- Eliminate redundant requests

---

## 4. Phase 1 Full Pipeline

```
PromptSubmitted
    ↓
Prompt Artifact (PROMPT_RECORDS/{id})
    ↓
Requirement Extraction
    ↓
Requirement Graph (IR-1)
    ↓
Validation + Refinement
    ↓
Clean Requirement Set
    ↓
WorkRequest Generation
    ↓
WorkRequestGraph (IR-2)
    ↓ → Phase 2
```

## 5. Output Boundary

Phase 1 produces two outputs:
1. **WorkRequestGraph** (IR-2) — the handoff artifact to Phase 2. MUST NOT contain routing metadata, execution modes, execution flags, or pipeline stage decisions. It is a domain-modeling artifact, not a control-plane artifact. (Enforced by validator invariant V8.)
2. **Specification Event Trace** — causal chain of specification events

## 6. Key Architectural Insight

This phase is NOT about answering the prompt. It is about turning ambiguity into structured causality before any execution occurs.

Phase 1 is deterministic intent decomposition, constraint extraction, and planning IR construction — all without side effects.

## 7. What Phase 1 Enables

- **Reproducibility**: Same prompt → same requirement graph → same work graph
- **Editability**: Modify requirements without re-running execution
- **Planning intelligence**: Optimize before anything runs
- **Causal clarity**: Always know why something was done and what it was meant to satisfy
