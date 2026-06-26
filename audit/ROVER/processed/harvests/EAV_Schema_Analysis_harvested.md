# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/EAV Schema Analysis.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Steward System — FactEvent → Deterministic Kernel → KG + OLAP Architecture
**Status:** `Proposed`

### Architectural Intent
Design the Steward as a deterministic state machine that processes FactEvents through a semantic authority boundary into both a Knowledge Graph (structural truth, derived projection) and an OLAP store (append-only memory log). The core shift: KG is not the source of truth — events are. The KG becomes a disposable projection that can be rebuilt from the OLAP stream via replay. Steward acts as the single semantic authority: process(event) → ExecutionReceipt. ReplayService enforces idempotency via unique constraints on node and edge tables.

### Requirements & Acceptance Criteria
- [ ] NATS as primary ingestion path for event streams
- [ ] Steward (Spring Boot) as semantic authority and execution boundary
- [ ] OLAP (Postgres fact_events table) as append-only memory log
- [ ] KG (Postgres Graph) as structural truth store — derived projection, disposable
- [ ] Deterministic kernel: process(event) → ExecutionReceipt
- [ ] Replayability: KG rebuildable from OLAP stream via ReplayService with idempotency constraints

### Unresolved Follow-Ups
- What is the schema for FactEvent — how does it normalize diverse event sources?
- How are KG and OLAP kept consistent when Steward processes events? See also: dual-write atomicity

---

## 2. KG vs Vector Separation — Ontological Truth vs Epistemic State
**Status:** `Agreed`

### Architectural Intent
Split state change into two independent write paths with different stability guarantees. KG updates are deterministic hard state (facts, edges, commitments, schema mutations) — write-committed truth that does not trigger vector recomputation. Vector updates are soft state (projections, interpretations, summaries, embeddings) — approximate, recomputable, allowed to lag. The critical invariant: KG mutation ≠ Vector invalidation. This prevents cognitive feedback loops where interpretation changes trigger KG rewrites which trigger recomputation which changes interpretation.

### Requirements & Acceptance Criteria
- [ ] Type 1 events (KG-write): ADD_EDGE, REMOVE_EDGE, UPDATE_NODE, MERGE_ENTITY, SET_SCHEMA — mutate truth layer, generate receipt, do NOT force vector recompute
- [ ] Type 2 events (Vector-impact): WorkRequest created, roundtable initiated, contradiction detected, evaluation produced — update interpretation surface, MAY trigger recomputation
- [ ] Type 3 events (Dual-impact, rare): WorkRequest completed, lease granted/revoked, critical KG mutation — KG update + vector recompute + possible cascade
- [ ] KG = ontological truth: authoritative, deterministic, lease-protected
- [ ] Vector = epistemic state: what the system believes is true, what is salient, what is currently being reasoned about

### Harvested Code Artifacts
#### Purpose: Event pipeline with KG/Vector separation
```text
Event Ingest (Message Box)
  ↓
Event Classifier
  ↓
┌───────────────┬────────────────┐
│ KG Writer      │ Vector Planner │
│ (deterministic)│ (adaptive)     │
└──────┬─────────┴──────┬─────────┘
       ↓                ↓
  KG State         Vector State
```

### Unresolved Follow-Ups
- What is the recomputation trigger cadence for Vector — event-count-based or time-based?
- How are dual-impact events coordinated to ensure atomicity across KG and Vector?

---

## 3. Vision/LOSM/Conduit Three-Tier Stack — Intent ≠ Structure ≠ Execution
**Status:** `Agreed`

### Architectural Intent
Formalize the three-tier architecture: Vision (meta-layer) defines why the system exists, boundaries of cognition, role philosophy, and system invariants — the constitution. LOSM (formal layer) defines IR schemas, WorkRequest definitions, KG structure, Vector semantics, and execution contracts — the type system + algebra of cognition. Conduit/runtime (operational layer) enforces leases, routes events, validates determinism, schedules execution — the kernel. Explicit separation: Vision → defines allowed shapes, LOSM → instantiates those shapes, Conduit → enforces them at runtime.

### Requirements & Acceptance Criteria
- [ ] Vision: ontological constraints, cognitive architecture rules, system invariants, structural philosophy — not code, not IR, not runtime
- [ ] LOSM: IR schemas, WorkRequest definitions, KG structure, Vector semantics, execution contracts — formal layer
- [ ] Conduit: lease enforcement, event routing, deterministic validation, execution scheduling — kernel
- [ ] Evolution constraint: changes to LOSM must remain within Vision constraints
- [ ] Plurality is designed (not accidental), roles are bounded concepts (not drift-prone), roundtables are first-class constructs

### Harvested Code Artifacts
#### Purpose: Three-tier architecture stack
```text
VISION — what the system is (constitution, invariants)
  ↓
LOSM — what the system formally is (IR + semantics)
  ↓
CONDUIT — what the system actually does (kernel + leases)
  ↓
EVENT SYSTEM (Message Box + Vector + KG)
  ↓
TERMINALS (distributed cognition)
```

### Unresolved Follow-Ups
- Where are Vision invariants formally defined — in a document, in code, or as compile-time checks?
- How are Vision constraint violations detected — at LOSM design time or at Conduit runtime?

---
