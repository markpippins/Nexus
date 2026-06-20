# 004 — Three-Layer System Architecture

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript). Formalizes the three-layer model referenced by all other mra-plans.

## Architectural Intent

The system has converged into a **three-layer architecture** that separates intent, execution, and observability. This is not a layered monolith — each layer is independently evolvable with its own design contract, data types, and lifecycle.

The layer split exists because each layer answers a fundamentally different question:

| Layer | Question It Answers |
|-------|---------------------|
| Intent (L1) | *What should be done?* |
| Execution (L2) | *How is it being done?* |
| Observability (L3) | *Was it done correctly, and can we prove it?* |

## Layer Definitions

### Layer 1: Intent Layer (WRP)

**Owns:** Tickets, plans, WorkRequest schemas, POE (Proofs of Execution) requirements.

**Role:** Intent normalization — crystallizing fuzzy human intention into discrete, deterministic units of work.

**Contract:** Produces deterministic, re-instantiable WorkRequest envelopes. Accepts raw intent (natural language, structured prompts, transcript chunks). Emits immutable WorkRequest records.

**Must not:**
- Execute work directly
- Observe execution state
- Mutate runtime state
- Reference external context not captured in the WorkRequest envelope

**Referenced by:** `../principles/001-wrp-as-intent-compiler.md`

### Layer 2: Execution Layer

**Owns:** Agents, models, pipeline orchestration (Temporal/conduit).

**Role:** Executes WorkRequests produced by the Intent Layer. Wraps each execution attempt with the safety contracts defined by Layer 3.

**Contract:** Accepts WorkRequests from L1, executes them through configured agent/model chains, returns receipts to L3. Must call L3 hooks before/during/after execution.

**Must not:**
- Modify intent or WorkRequest content
- Skip observability hooks
- Bypass circuit breaker gates

### Layer 3: Observability / Safety Layer

**Owns:** Receipts, logs, circuit breakers, kill switches, session reviews, UI.

**Role:** Runtime safety, state integrity, and recovery. Turns execution into a debuggable, auditable, recoverable process.

**Contract:** Monitors execution via mandatory hooks. Constrains execution via circuit breakers. Corrects drift via Plan Reset. Surfaces state via the Scaffold UI.

**Must not:**
- Modify WorkRequests or intent
- Execute agent/model work directly
- Bypass Layer 2's execution authority

**Referenced by:** `../principles/005-crystallization-runtime-codependency.md`

## Layer Interaction Flow

```
User Intent
    │
    ▼
┌──────────────────────────────┐
│  Layer 1: Intent Compiler    │  ← produces WorkRequest
│  (WRP)                       │
└──────────┬───────────────────┘
           │ WorkRequest (immutable)
           ▼
┌──────────────────────────────┐
│  Layer 2: Execution Runtime  │  ← executes, calls L3 hooks
│  (agents, models, pipeline)  │
└──────────┬───────────────────┘
           │ execution events, receipts
           ▼
┌──────────────────────────────┐
│  Layer 3: Observability /    │  ← monitors, constrains, recovers
│  Safety                      │
│  (circuit breakers, logs,    │
│   session review, UI)        │
└──────────────────────────────┘
```

## Cross-Layer Communication

- All cross-layer communication uses **typed envelopes** (not ad-hoc function calls)
- No layer can bypass another — all execution goes through L1 → L2 → L3
- Layer boundaries are enforced at the type level (not convention)
- Each layer can be tested, deployed, and evolved independently

### Envelope Types

| Envelope | From → To | Contents |
|----------|-----------|----------|
| WorkRequest | L1 → L2 | Intent + constraints + acceptance criteria |
| ExecutionReceipt | L2 → L3 | Outcome + trace + artifact hashes |
| SafetyEvent | L3 → L2 | Circuit breaker trip, kill signal, pause/resume |
| DriftAlert | L3 → L1 | Plan Reset trigger, intent divergence report |

## Requirements & Acceptance Criteria

- [ ] Each layer has a clearly defined API contract with the other layers
- [ ] Cross-layer communication uses typed envelopes (not ad-hoc calls)
- [ ] No layer can bypass another — all execution goes through Intent → Execution → Observability
- [ ] Layer boundaries are enforced at the type level (not convention)
- [ ] Each layer can be tested, deployed, and evolved independently

## Unresolved Follow-Ups

- What is the exact envelope format for cross-layer communication?
- Should layers communicate via message queue, direct calls, or event bus?
- How do we prevent layer coupling from creeping in over time?

## See Also

- `../principles/001-wrp-as-intent-compiler.md` — Layer 1 deep-dive
- `../principles/005-crystallization-runtime-codependency.md` — why L1 and L3 need each other
- `../primitives/003-progressive-epistemic-instrumentation.md` — Layer 3 primitive catalog
