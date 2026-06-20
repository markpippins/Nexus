# 001 — WRP as Canonical Intent-to-Work Compiler

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript), consolidated from chunks 001, 006, and Layer 1 of 004.

## Architectural Intent

The Work Request Pipeline is a **canonical intent-to-work compiler**, not an execution system. Its role is to crystallize fuzzy human intention into discrete, re-instantiable, and traceable units of work. WRP provides **intent stability** — the ability to regenerate the same work from the same intent, consistently.

WRP is the **representation system** for work, not the **execution system**. It defines what a unit of work *is*.

Redefine "work" from simple tasks into **deterministic intent objects** with replay semantics. A unit of work is not what an agent does — it is a crystallized expression of intent that can be re-instantiated, re-executed, and verified independently of any specific execution attempt.

## Relation to the Three-Layer Model

WRP occupies **Layer 1 (Intent Layer)** of the three-layer architecture (see `../architecture/004-three-layer-system-model.md`). It is intentionally isolated from execution concerns. Execution is delegated to Layer 2 (Execution Layer), and safety/observability to Layer 3 (Observability Layer).

WRP never executes work directly; it compiles intent into executable form.

## Requirements & Acceptance Criteria

- [ ] WRP accepts high-level intent (natural language, structured prompts) and produces deterministic WorkRequest envelopes
- [ ] Each WorkRequest is independently re-instantiable — same intent → same output structure
- [ ] WorkRequest envelopes carry: intent source, normalization trace, acceptance criteria, and execution constraints
- [ ] WRP never executes work directly; it compiles intent into executable form
- [ ] Intent compilation is idempotent — recompiling the same intent produces an equivalent WorkRequest

## Intent Object Schema

```
WorkRequest {
  intent_source: str          // original human intent
  normalization_trace: str    // how intent was compiled
  acceptance_criteria: []     // verifiable completion conditions
  execution_constraints: {}   // runtime boundaries (time, cost, safety)
  poe_requirements: []        // what constitutes valid proof of execution
}
```

### Schema Rules

- Every WorkRequest is a self-contained intent object (not a reference to external state)
- WorkRequests carry all context needed for re-instantiation
- WorkRequests are immutable once emitted by the Intent Layer
- Execution receipts prove completion without needing to re-examine the WorkRequest

## Compiler Pipeline

Parse → Normalize → Validate → Bind → Emit WorkRequest

| Stage | Responsibility |
|-------|----------------|
| **Parse** | Accept raw intent (natural language, structured prompt, transcript chunk) |
| **Normalize** | Transform free-form intent into structured IR |
| **Validate** | Check for ambiguity, conflict, or missing acceptance criteria |
| **Bind** | Attach execution constraints (agent capability, deadline, budget) |
| **Emit** | Persist as immutable WorkRequest envelope, hand to Layer 2 |

## Implementation Notes

- WRP sits in the Intent Layer (Layer 1) of the three-layer model
- Intent normalization transforms free-form user intent into structured IR
- The compiler pipeline produces deterministic, re-instantiable WorkRequest envelopes
- Execution is delegated to Layer 2; observability to Layer 3
- Intent objects are the "atoms" of the system — designed for static correctness, not runtime performance

## Unresolved Follow-Ups

- What is the exact schema for the "intent source" field in a WorkRequest envelope?
- Should intent compilation be synchronous or async?
- How does WRP handle conflicting or ambiguous intent?
- Should intent objects support composition (sub-work, dependencies)?
- How do we handle intent objects that depend on the output of other intent objects?
