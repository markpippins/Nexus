# Atten Implementation Plan

> **Status:** Proposed plan
> **Date:** 2026-06-27
> **Scope:** Atten (Multi-State Projection Generator) within the Projection Algebra family

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Atten Is](#2-what-atten-is)
3. [Atten in the Projection Algebra](#3-atten-in-the-projection-algebra)
4. [Current Status Assessment](#4-current-status-assessment)
5. [Prerequisites (Must Exist Before Atten)](#5-prerequisites-must-exist-before-atten)
6. [Implementation Phases](#6-implementation-phases)
7. [Atten Generator Catalog](#7-atten-generator-catalog)
8. [Projection Algebra Cross-References](#8-projection-algebra-cross-references)
9. [CIRS Constraints on Atten](#9-cirs-constraints-on-atten)
10. [Relationship Map](#10-relationship-map)
11. [Risk Assessment](#11-risk-assessment)
12. [References](#12-references)

---

## 1. Executive Summary

**Atten** is a multi-state projection generator — one of six operators in the
**Projection Algebra**. It reads committed canonical state and emits candidate
projections of possible future or derived states. It is NOT a brain, cognitive
layer, deterministic reducer, or decision-maker.

Atten is currently **spec-only** (no code, no schema, no implementation). Two
critical dependencies must exist before Atten can be built:

1. **Canonical State Store** — what Atten reads
2. **Canonicalizer / Commit Layer** — what consumes Atten's output

This plan defines the implementation path for Atten, including all
cross-references to its sibling operators in the Projection Algebra and the
governance constraints (CIRS) that bound it.

**Key architectural correction (v0.2+):** Atten is NOT the archetypal projection
operator. It is one sibling among Throttler, Nebula, Search, WorkRequest, and
PEB in the Projection Algebra. See §3 and §8.

---

## 2. What Atten Is

### Identity

Atten reads from **canonical state** (committed, post-resolution) and emits
**zero, one, or many candidate projections** of possible future or derived
states. Each projection is:

- **Hypothetical** — what *might* be true, what *could* happen next
- **Uncommitted** — carries no authority to change state
- **Potentially conflicting** — two projections may disagree (feature, not bug)
- **Independent** — self-contained and traceable to its inputs

*Source: [atten-spec.md §1](../docs/nexus/audit/SPECS/atten-spec.md#1-identity)*

### What Atten Is NOT

| Misconception | Correction |
|---|---|
| Atten is a brain / cognitive layer | **False.** Atten has no agency, no goals, no understanding. It generates projections mechanically. |
| Atten is a deterministic reducer | **False.** A reducer folds state+event→state (one input, one output). Atten may emit many projections from one input, including contradictory ones. |
| Atten is the "knowledge substrate" | **False.** That conflates process (projection) with product (canonical state). |
| Atten decides what to do | **False.** Atten does not choose, commit, prioritize, or resolve conflicts. |

*Source: [atten-is-not-a-brain.md](../docs/nexus/audit/ANALYSIS/atten-is-not-a-brain.md)*

### Core Distinction

```
Observer owns records.     → factual, immutable, append-only
Atten generates projections. → hypothetical, multiple, uncommitted
Commit layer owns state.   → resolved, committed, canonical
```

### Formal Signature

```
Atten(canonical_state, context) → ProjectionEnvelope[]
```

Where:

| Component | Description |
|---|---|
| `canonical_state` | Current committed state snapshot (sole input source) |
| `context` | Scope boundary, rule set, event cursor position |
| `ProjectionEnvelope` | Typed output with: `{ id, type, source, candidate, confidence, trace, alternatives, conflict_group }` |

*Source: [atten-spec.md §3–4](../docs/nexus/audit/SPECS/atten-spec.md#3-inputs)*

---

## 3. Atten in the Projection Algebra

The **Projection Algebra** defines a family of six projection operators, each
projecting over an independent source domain. Atten is one of six siblings.

*Source: [projection-algebra.md](../nexus/graph/schema/projection-algebra.md)*

### Operator Comparison Matrix

| Operator | Domain | Source Domain | Consumer | Via Canonicalizer? | Has Code? |
|---|---|---|---|---|---|
| **Throttler** | Physical | Filesystem tree (`.magnet` sentinels) | UI, Search index | No | ✅ |
| **Atten** | Semantic | Canonical state store | Canonicalizer / Commit Layer | **Yes** | ❌ |
| **Nebula** | Ontological | Knowledge graph, workspace docs | UI, Graph pipeline | No | ⚠️ Partial |
| **Search** | Epistemic | Search index, query params | UI | No | ✅ |
| **WorkRequest** | Operational | Canonical state + Planner | Conduit / Temporal | No | ⚠️ Partial |
| **PEB** | Governance | Invariant records | All operators | No | ❌ |

### Key Invariants That Bound Atten

| Invariant | Statement | Source |
|---|---|---|
| **A1: No Canonical Reference** | No operator is the reference for the algebra. Atten is not the archetype. | [projection-algebra.md §5](../nexus/graph/schema/projection-algebra.md#5-key-invariants) |
| **A2: Domain Separation** | Each operator projects over exactly one source domain. Atten reads canonical state only. | Same |
| **A3: No Operator Chaining** | Operators do not feed into each other. No operator's output is another's primary input. | Same |
| **A4: Independent Cycles** | All operators may run concurrently. Atten does not wait for Throttler or vice versa. | Same |
| **A5: Bounded View** | Each operator has a defined scope boundary. Atten does not see filesystem state. | Same |
| **A6: Typed Output** | Every projection has a type identifying which operator produced it. | Same |

### Architectural Correction (Critical)

Atten and Throttler are **siblings**, not parent and child. The v0.1 spec
incorrectly framed Throttler's magnet mechanism as "a concrete example of" an
Atten projection. The corrected framing (v0.2):

- **Throttler** projects filesystem scope (physical domain) → UI
- **Atten** projects canonical state (semantic domain) → Canonicalizer
- **Throttler** is binary (magnetized or not); **Atten** is typed (6 projection types)
- Neither is the "reference" for the family

*Source: [atten-spec.md Appendix A](../docs/nexus/audit/SPECS/atten-spec.md#appendix-a-projection-algebra-context)*

---

## 4. Current Status Assessment

### Atten-Specific

| Aspect | Status |
|---|---|
| **Spec** | ✅ Written (`atten-spec.md` v0.3) |
| **Schema** | ✅ Defined in spec (ProjectionEnvelope JSON Schema) |
| **Code** | ❌ None exists anywhere |
| **Generators** | ❌ None implemented |
| **Tests** | ❌ None |

### Dependencies

| Dependency | Status |
|---|---|
| **Canonical State Store** | ❌ Not designed |
| **Canonicalizer / Commit Layer** | ❌ Not designed (architectural gap) |
| **Event Log** | ❌ Not designed |
| **XIL (External Intelligence Layer)** | ❌ Not designed |
| **PEB integration** | ❌ Not designed |

*Source: [atten-spec.md §10](../docs/nexus/audit/SPECS/atten-spec.md#10-current-status)*

### Operator-Plane Gap

There is a **reverse maturity problem**: the aspirational architecture (Atten,
Canonicalizer, PEB) is well-documented across 19+ specs, while the working
code (service mesh, operator console) is disconnected from the architecture.
The bridge between them doesn't exist at any level.

*Source: [operator-plane-gap-analysis.md §9](../docs/nexus/audit/ANALYSIS/operator-plane-gap-analysis.md#9-key-insight)*

---

## 5. Prerequisites (Must Exist Before Atten)

The following must be designed and implemented **before** Atten generators can
produce actionable output.

### 5.1 Canonical State Store

Atten needs a store to read from. This does not exist yet.

**Requirements:**
- Snapshot-isolation reads for Atten generators
- Cursor tracking to event log position
- Atomic commits from the Canonicalizer
- Schema unifying infrastructure state (services, deployments) with pipeline
  state (WorkRequests, receipts, projections)

**Related:** The operator-plane gap analysis identifies the Service Registry
(port 8085) and Conduit's PostgreSQL as two independent stores that need
unification.

*Source: [operator-plane-gap-analysis.md §6.2](../docs/nexus/audit/ANALYSIS/operator-plane-gap-analysis.md#62-canonical-state-store)*

### 5.2 Canonicalizer / Commit Layer

This is the **critical missing architectural layer** — the consumer of Atten's
output. Without it, Atten's projections are unactionable.

**Required responsibilities:**
1. Collect projections from all Atten generators for a cycle
2. Classify projections by conflict group
3. Resolve conflicts:
   - Merge compatible projections
   - Select among conflicting (by confidence, priority, or rule)
   - Reject invariant violations (consult PEB)
   - Escalate irreconcilable conflicts to human operator
4. Validate selected projection against PEB invariants and RCL constraints
5. Commit resolved state delta to Canonical State Store
6. Record resolution (accepted/rejected/merged/why)
7. Emit commitment event to Event Log

**Contract:**
```
Atten emits:       ProjectionEnvelope[] (unordered, possibly conflicting)
Canonicalizer produces: CommitmentReceipt {
  accepted: ProjectionId[],
  rejected: ProjectionId[],
  merged:   ProjectionId[][],
  state_delta: StateDelta,
  new_state_hash: string,
  invariants_checked: RuleId[],
  trace: Trace
}
```

*Source: [atten-spec.md §7](../docs/nexus/audit/SPECS/atten-spec.md#7-canonicalizer--commit-layer-downstream-gap)*

### 5.3 Event Log

A durable, append-only event store. Atten reads canonical state derived from
events, not raw events directly. The event log feeds the canonical state store.

*Source: [atten-spec.md §3](../docs/nexus/audit/SPECS/atten-spec.md#3-inputs)*

### 5.4 XIL (External Intelligence Layer)

A semantic firewall between external actors and internal state. Atten never
sees raw external input — XIL normalizes it first.

XIL enforces three transformations:
1. **Parsing**: Signal → Event candidate
2. **Projection**: Event → system-compatible form
3. **Validation**: Candidate → committed event or quarantine

**Key principle:** External intelligence never enters GEL directly. Everything
passes through event normalization + constraint projection first.

*Source: [projection-algebra.md Appendix B](../nexus/graph/schema/projection-algebra.md#9-appendix-b-xil--external-intelligence-layer-boundary)*

---

## 6. Implementation Phases

### Phase 0: Foundations (Dependencies)

**Estimated effort:** 3–4 sprints

1. **Design Canonical State Store** — schema, access patterns, snapshot isolation
2. **Design Canonicalizer** — resolution policy, conflict classification, commit protocol
3. **Design Event Log** — append-only schema, cursor tracking
4. **Design XIL boundary** — admission gates (TTS, STOA, TSP, PEL)
5. **Wire PEB constraints** — invariants that guard the Canonicalizer

### Phase 1: Canonicalizer First

**Estimated effort:** 2 sprints

The Canonicalizer is the harder architectural problem. Build it before any
Atten generator.

1. Implement Canonicalizer resolution engine (collect → classify → resolve → commit → record)
2. Wire PEB pre-commit validation gate
3. Implement CommitmentReceipt schema and persistence
4. Unit tests for conflict resolution policies

### Phase 2: First Atten Generator — `atten::priority.router`

**Estimated effort:** 1 sprint

Start with the simplest generator: a pure deterministic projection that reads
the pending plans queue and projects an execution order.

**Why first:**
- No inference needed (pure deterministic rules)
- No LLM dependency
- Clearly bounded domain
- Output is easily testable

### Phase 3: Second Generator — `atten::state.transitioner`

**Estimated effort:** 1–2 sprints

Project possible state transitions from current workflow states. Reads
canonical workflow state and emits candidate `state_transition` projections.

**Complexity increase:**
- Needs domain understanding of workflow lifecycle
- May have conflicting projections (one says transition to A, another to B)
- First test of Canonicalizer's conflict resolution

### Phase 4: Third Generator — `atten::anomaly.detector`

**Estimated effort:** 2 sprints

Projects anomaly signals from metrics and state history. Reads time-series
or event frequency from canonical state.

**Complexity increase:**
- Threshold tuning
- May need inference (probabilistic mode)
- First generator requiring `confidence` and `alternatives` fields

### Phase 5: ProjectionIR Adapter

**Estimated effort:** 1 sprint

Once Atten generators exist, build the **ProjectionIR Adapter** that converts
Atten's native `ProjectionEnvelope` format into the normalized ProjectionIR
format for consumption by Synthesis and downstream consumers.

*Source: [projection-ir.md §4](../nexus/graph/schema/projection-ir.md#4-adapter-layer-pattern)*

### Phase 6: Integration

**Estimated effort:** 2 sprints

1. Wire Atten into the epistemic pipeline: XIL → Event Log → Canonical State
   Store → Atten → Canonicalizer → Planner → WorkRequest
2. Wire ProjectionIR adapter → Synthesis → UI/Planner
3. Connect to operator plane: Service Registry events feed canonical state
4. End-to-end test: operator action → state change → Atten projection →
   Canonicalizer resolution → Planner WorkRequest → Conduit execution →
   Service Registry update → Console visualization

### Implementation Order (Recommended)

```
1. Canonical State Store      (Phase 0)
2. Canonicalizer              (Phase 1)
3. atten::priority.router     (Phase 2)
4. atten::state.transitioner  (Phase 3)
5. Event Log                  (parallel with 2–4)
6. XIL                        (parallel with 2–4)
7. atten::anomaly.detector    (Phase 4)
8. ProjectionIR Adapter       (Phase 5)
9. Full integration           (Phase 6)
10. atten::incident.classifier (post-P6)
11. atten::relation.discovery  (post-P6)
```

---

## 7. Atten Generator Catalog

| Generator ID | Projects Over | Produces | Complexity | Phase |
|---|---|---|---|---|
| `atten::priority.router` | Intent queue | `priority_ordering` projections | Low (deterministic rules) | Phase 2 |
| `atten::state.transitioner` | Workflow state machines | `state_transition` projections | Medium (domain logic) | Phase 3 |
| `atten::anomaly.detector` | Metric timeseries | `anomaly` projections | Medium-high (thresholds, inference) | Phase 4 |
| `atten::incident.classifier` | New observations | `classification` projections | High (needs schema knowledge) | Post-P6 |
| `atten::relation.discovery` | Entity graph | `relationship` projections | High (graph traversal) | Post-P6 |

*Source: [atten-spec.md §5](../docs/nexus/audit/SPECS/atten-spec.md#5-mechanics)*

### Generator Design Principles

1. **Generators are stateless** — no state between cycles. All state is in
   the canonical store.
2. **Generators are independent** — no coordination during generation.
   Coordination happens during Canonicalizer resolution.
3. **Generators may conflict** — feature, not bug. The Canonicalizer is
   designed for conflict resolution.
4. **Generators have bounded scope** — each projects over a specific domain
   slice. No generator sees everything.
5. **Generation is async** — generators run concurrently, not sequentially.

### Atten Invariants (from spec)

| ID | Statement |
|---|---|
| **I1** | Atten MUST NOT write to canonical state. Projections only. |
| **I2** | Atten MUST NOT decide, select, prioritize, or reject projections internally. |
| **I3** | Every projection MUST be traceable to its canonical state snapshot, generator, and trigger. |
| **I4** | No generator may depend on another generator's output within the same cycle. |
| **I5** | Each generator has a defined scope — a subset of canonical state it may read. |
| **I6** | Generators must not project over their own prior projections. |
| **I7** | Same state snapshot + same trigger → same output (deterministic) or documented distribution (probabilistic). |

*Source: [atten-spec.md §8](../docs/nexus/audit/SPECS/atten-spec.md#8-invariants)*

---

## 8. Projection Algebra Cross-References

### 8.1 Throttler (Sibling — Physical Domain)

**Status:** ✅ Has working code (`angular/nexus-console/src/services/remote-file-system.service.ts`)

Throttler is the simplest projection operator — binary scope detection via
`.magnet` sentinel files. It projects filesystem scope directly to UI.

**Relationship to Atten:** Siblings, not parent-child. Throttler projects
filesystem scope (is folder magnetized?). Atten may project over Throttler's
*results* after they are committed to canonical state, but Atten does not
read Throttler's native output.

*Source: [projection-algebra.md §3.1](../nexus/graph/schema/projection-algebra.md#31-throttler--filesystem-scope-projection)*

### 8.2 Nebula (Sibling — Ontological Domain)

**Status:** ⚠️ Partial code (`typescript/nebula-srv/`, `angular/nebula-ui/`)

Nebula projects knowledge structure from workspace documents and database
records. It answers "what entities exist and how do they relate?"

**Relationship to Atten:** Nebula's entity classifications and relationship
discoveries feed the knowledge graph that informs canonical state. Atten
may project over this committed state (e.g., "entity X has no relationships
→ anomaly projection").

*Source: [projection-algebra.md §3.3](../nexus/graph/schema/projection-algebra.md#33-nebula--knowledgegraph-projection)*

### 8.3 Search (Sibling — Epistemic Domain)

**Status:** ✅ Has code (`moleculer/search/`, `jvm/spring/service-broker/search-service/`)

Search projects query results from indexed content. Answers "what does the
system know about X?"

**Relationship to Atten:** Search results are consumed directly by UI, not
through the Canonicalizer. Atten may project over search index health
(e.g., "index for folder W is 30% out of date").

*Source: [projection-algebra.md §3.4](../nexus/graph/schema/projection-algebra.md#34-search--queryresult-projection)*

### 8.4 WorkRequest (Sibling — Operational Domain)

**Status:** ⚠️ Partial code (Conduit Python + MCP, `WORKREQUEST_SPEC.md`)

A WorkRequest is a projection of intent into an executable contract. Reads
from canonical state and Planner output, emits an immutable execution
artifact.

**Relationship to Atten:** Atten generates candidate projections that inform
Planner decisions. The Planner reads committed canonical state (which was
produced by the Canonicalizer from Atten's projections) and generates
WorkRequests. Atten does NOT directly generate WorkRequests.

*Source: [projection-algebra.md §3.5](../nexus/graph/schema/projection-algebra.md#35-workrequest--intentaction-projection)*

### 8.5 PEB (Sibling — Governance Domain)

**Status:** ❌ Spec only (`peb-mcp-spec.md`, `peb-spring-boot-spec.md`)

PEB projects governance constraints over all other operations. It projects
*what is allowed*, not what is or what could be.

**Relationship to Atten:** PEB provides rule sets that constrain both Atten
(during projection generation) and the Canonicalizer (during conflict
resolution). PEB validates transitions of **committed canonical state**,
not Atten's candidate projections.

*Source: [atten-spec.md §9](../docs/nexus/audit/SPECS/atten-spec.md#9-relationship-to-other-systems)*

### 8.6 ProjectionIR (Cross-Operator Normalization)

**Status:** ❌ Spec only (`projection-ir.md`)

ProjectionIR provides a unified, normalized intermediate representation that
sits between operator output and downstream consumers. Each operator
(including Atten) needs an adapter.

**Relevance to Atten:** Atten's native `ProjectionEnvelope` must be adapted
into ProjectionIR format before Synthesis can consume it. The adapter
preserves Atten's domain identity, assigns confidence, attaches CIRS
constraints, and strips execution authority.

*Source: [projection-ir.md](../nexus/graph/schema/projection-ir.md)*

### 8.7 NEXP-5 (Experimental Extension)

**Status:** ⚠️ Experimental (referenced in ANALYSIS.md §28.9)

A fifth/fifth projection operator for experimental/low-confidence projections
quarantined from mainline processing. Not part of the canonical 6-operator
algebra.

*Source: [nexus-knowledge-graph.json](../nexus/graph/nexus-knowledge-graph.json)*

---

## 9. CIRS Constraints on Atten

The **Cognitive Integrity Rule System (CIRS)** enforces 30+ rules across 10
families. The rules most relevant to Atten:

### Directly Applicable to Atten

| Rule | Statement | Relevance |
|---|---|---|
| **CIRS-IR-01** | ProjectionIR carries zero execution authority | Atten's projections carry no authority — they are candidates only |
| **CIRS-IR-04** | Operator boundary integrity | Atten stays in its semantic domain, doesn't touch execution |
| **CIRS-IR-07** | ProjectionIR ephemerality | Atten's adapted output is ephemeral, never persisted as truth |
| **CIRS-CORE** | Synthesis-Execution Separation | Atten (epistemic) never touches Conduit (execution) |

### Governs Atten's Interface

| Rule | Statement | Enforced At |
|---|---|---|
| **CIRS-IR-02** | IR scope containment | Adapter → Synthesis boundary |
| **CIRS-IR-03** | No epistemic escalation | Synthesis layer |
| **CIRS-IR-09** | Execution contract exclusivity | Planner → WorkRequest boundary |
| **CIRS-IR-10** | No operator contamination | Adapter layer |

### Three Hard CIRS Boundaries

```
Boundary 1: Observation → Operator
  Atten reads canonical state (post-XIL, post-event-log). Never raw observations.

Boundary 2: Synthesis → WorkRequest
  Atten's projections inform Planner context. Planner generates WorkRequests.
  Never direct Atten → WorkRequest.

Boundary 3: WorkRequest → Conduit Execution
  Atten's projections never appear here — only the WorkRequest DTO crosses.
```

*Source: [cognitive-integrity-rule-system.md](../docs/nexus/audit/SPECS/cognitive-integrity-rule-system.md)*

---

## 10. Relationship Map

### Epistemic Pipeline

```
External Signal
    ↓
  XIL (Parsing → Projection → Validation / Quarantine)
    ↓
  Event Log (durable, append-only, factual)
    ↓
  [Canonical State Store] ←─────────────────────────┐
    ↓                                                 │
  ┌─────────────────────────────────────────────┐    │
  │  OPERATOR LAYER (parallel, independent)      │    │
  │                                              │    │
  │  Throttler ──► UI / Search (no Canonicalizer)│    │
  │  Nebula    ──► UI / Graph (no Canonicalizer)  │    │
  │  Search    ──► UI (no Canonicalizer)          │    │
  │  Atten     ──► Canonicalizer (ONLY Atten)     │    │
  │  PEB       ──► All operators (constrain)      │    │
  └─────────────────────────────────────────────┘    │
    ↓                                                 │
  ProjectionIR Adapter Layer                         │
    ↓                                                 │
  Synthesis Layer                                    │
    ↓                                                 │
  Planner                                            │
    ↓                                                 │
  WorkRequest → Conduit Execution                    │
    ↓                                                 │
  Canonical State (updated) ─────────────────────────┘
    ↓
  Consumed by: Vision, Planner, Graph pipeline, Analyst, PEB
```

### Key: Atten's Unique Position

- **Only operator** whose output must pass through the Canonicalizer
- **Only operator** that reads from canonical state (others read filesystem,
  knowledge graph, search index directly)
- **Not special** in the algebra — this is a domain constraint, not a status
  hierarchy

*Source: [projection-algebra.md §6](../nexus/graph/schema/projection-algebra.md#6-relationship-diagram)*

---

## 11. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Canonicalizer complexity underestimated** | Atten stuck spec-only | High | Start Canonicalizer design early (Phase 0). Build resolution engine incrementally. |
| **Atten-centrism re-asserts** | Architecture drift toward Atten as "the brain" | Medium | Enforce Projection Algebra framing in all docs. Peer review of designs. |
| **CIRS not enforced in runtime** | Epistemic contamination (IR leaks into execution) | Medium | 4-layer enforcement model (type system → static analysis → hard gate → audit). |
| **Generator independence violated** | Cross-generator coupling, hidden dependencies | Medium | Code review gate: every generator must have independent test suite. |
| **PEB not available for pre-commit validation** | Transitions committed without governance | High | PEB spec exists but no code. May need temporary validation rules in Canonicalizer. |
| **Operator plane bridge delayed** | Atten has no infrastructure state to project over | Medium | Start with pipeline-internal state first (plans, WorkRequests). Add service registry state later. |

---

## 12. Canonicalizer Cross-Reference Index

All known references to the **Canonicalizer / Commit Layer** across the codebase,
harvest database, and agent records.

### 12.1 Canonicalizer in the Knowledge Graph

From `nexus/graph/nexus-knowledge-graph.json`:

**Actor entry: `canonicalizer`**
- **Name:** Canonicalizer / Commit Layer
- **Status:** `not_designed`
- **Type:** system_component
- **Consumes:** `atten_projection`
- **Produces:** `commitment_receipt`, `canonical_state_delta`
- **Responsibilities:** collect projections, classify by conflict group, resolve
  conflicts, validate against PEB invariants, commit resolved state, record
  resolution provenance, emit commitment event

**Related actor: `canonical_state_store`**
- **Name:** Canonical State Store
- **Status:** `not_designed`
- **Description:** Committed, resolved canonical state. Sole input source for
  Atten. Not designed or implemented yet.

**Graph topology placement:**
- Layer: `Canonical State Layer` (alongside `canonical_state_store`)
- Governance layer connects to: `canonicalizer`, `atten`, `conduit_gateway`, `pipeline_wrp`
- Synthesis references: `"actors": ["synthesis", "canonicalizer"]`

### 12.2 Canonicalizer in Harvest Candidates (Database)

The database contains **1 explicit harvest candidate** and **20 cross-reference
embedding records**:

| Candidate | Source | Details |
|---|---|---|
| **Canonicalizer / Commit Layer — The Missing Architectural Gap** | `Self_audit_in_Agent_Runtime_harvested.md` | Full candidate definition: collects projections, classifies by conflict group, resolves conflicts (merge/select/reject/escalate), validates against PEB, commits delta, records trace |

**20 cross-reference embeddings** link the Canonicalizer to:
- Go Services architecture
- CCNF Reference / CER Runtime
- Spring Boot / Modular Monolith stack
- Agentic planning and context resolution
- LOSM-Lang, Semantic Adapter Layer
- Governance and ontological layers
- Source files: `Nexus - Ballerina in Service Mesh.html`, `DeepSeek critique analysis.html`, etc.

### 12.3 Canonicalizer in Agent Records (Database)

Several agent records reference the Canonicalizer indirectly:

| Record | Status | Description |
|---|---|---|
| **Canonical Operation Descriptor & Registry** | Agreed | Service broker input validation candidate |
| **Projection API (Canonical Contract)** | Proposed | Knowledge graph performance concern resolution |
| **Framework Ecosystem TypeSpec Model** | Implemented | Canonical CRUD for Framework, Category, Language, Vendor |
| **PEB Canonical Transaction Lifecycle** | Proposed | PEB lifecycle definition |
| **Full Domain Classification** | Persistent | Canonical store for per-candidate classification |

### 12.4 Canonicalizer in Spec Documents (60+ matches)

| Document | Location | What It Says |
|---|---|---|
| **atten-spec.md** | §1, §2, §3, §7, §9, Appendix A, Appendix B | **Primary definition.** Canonicalizer is the downstream consumer of Atten's projections. Does the work Atten cannot: decide, resolve, commit. **Not yet designed/implemented.** |
| **atten-is-not-a-brain.md** | §4, §5, §6, §7, §8 | **Architectural correction.** The Canonicalizer is what prevents Atten from drifting back toward being treated as a brain. Makes state commitment an explicit, auditable step. |
| **operator-plane-gap-analysis.md** | §1, §5, §6, §7 | **Bridge layer.** The Canonicalizer is identified as the integration gap between the operator plane and the WRP pipeline. Atten + Canonicalizer are designed to bridge this gap. |
| **cognitive-integrity-rule-system.md** | §5 (CIRS-IR-08) | CIRS-IR-08 = "No Shadow Canonicalization." Canonical state store is the only source of canonical truth. |
| **projection-algebra.md** | §3, §5, §6, Appendix B, Appendix C | Atten is the ONLY operator that passes through the Canonicalizer. Consumer column. Invariant A3. |
| **projection-ir.md** | §2 | Canonicalizer as consumer of ProjectionIR streams. |
| **ANALYSIS.md** | §28.2, §28.3 | Canonicalizer resolves projections post-Atten. |
| **CROSS_REFERENCES.md** | §17 (Atten) | Maps the Canonicalizer through the full cross-reference index. |

### 12.5 Key Cross-Reference Statements (Textual)

| Source | Statement |
|---|---|
| operator-plane-gap-analysis.md | "This is the integration gap that Atten and the Canonicalizer/Commit layer are designed to bridge." |
| atten-spec.md | "**Canonicalizer / Commit Layer** — Downstream consumer of Atten's projections. Does the work Atten cannot: decide, resolve, commit. (⚠️ **Not yet designed/implemented.**)" |
| atten-is-not-a-brain.md | "The Canonicalizer breaks this cycle by making **state commitment an explicit, auditable step** rather than a hidden property of the projection function." |
| atten-is-not-a-brain.md | "Canonicalizer({states}, policy) → committed_state" |
| atten-spec.md §7 | Full contract: `Atten emits ProjectionEnvelope[]` → `Canonicalizer produces CommitmentReceipt{ accepted, rejected, merged, state_delta, new_state_hash, invariants_checked, trace }` |
| nexus-knowledge-graph.json | **Status:** `not_designed` — "Architectural gap. Does not exist yet. Resolves Atten projections, commits to canonical state. Prerequisite for Atten to be actionable." |

---

## 13. References

### Core Specs

| Document | Location | Covers |
|---|---|---|
| Atten Spec | [`docs/nexus/audit/SPECS/atten-spec.md`](../docs/nexus/audit/SPECS/atten-spec.md) | Full Atten definition, invariants, projection envelope schema, XIL boundary |
| Projection Algebra | [`nexus/graph/schema/projection-algebra.md`](../nexus/graph/schema/projection-algebra.md) | 6-operator family, invariants, XIL appendix, identity model, composition extension |
| ProjectionIR | [`nexus/graph/schema/projection-ir.md`](../nexus/graph/schema/projection-ir.md) | Normalized IR format, adapter pattern, synthesis layer, 11 CIRS-IR rules |
| Atten Is Not a Brain | [`docs/nexus/audit/ANALYSIS/atten-is-not-a-brain.md`](../docs/nexus/audit/ANALYSIS/atten-is-not-a-brain.md) | v2 architectural correction — projection vs interpretation, Canonicalizer separation |
| CIRS | [`docs/nexus/audit/SPECS/cognitive-integrity-rule-system.md`](../docs/nexus/audit/SPECS/cognitive-integrity-rule-system.md) | 30+ rules, 10 families, CORE rule, 3 hard boundaries, enforcement model |
| Operator Plane Gap Analysis | [`docs/nexus/audit/ANALYSIS/operator-plane-gap-analysis.md`](../docs/nexus/audit/ANALYSIS/operator-plane-gap-analysis.md) | Atten as bridge between operator plane and WRP pipeline |

### Supporting Documents

| Document | Location | Covers |
|---|---|---|
| Knowledge Graph | [`nexus/graph/nexus-knowledge-graph.json`](../nexus/graph/nexus-knowledge-graph.json) | Full architecture ontology: actors, epistemic types, rules, decisions |
| Cross-Reference Index | [`docs/nexus/audit/CROSS_REFERENCES.md`](../docs/nexus/audit/CROSS_REFERENCES.md) | Concept-to-file mapping across entire audit corpus |
| Conduit Status | [`docs/nexus/audit/ENGINEERING/CONDUIT_STATUS.md`](../docs/nexus/audit/ENGINEERING/CONDUIT_STATUS.md) | Active vs aspirational system boundary |
| PEB MCP Spec | [`docs/nexus/audit/SPECS/peb-mcp-spec.md`](../docs/nexus/audit/SPECS/peb-mcp-spec.md) | PEB governance kernel architecture |
| PEB Spring Boot Spec | [`docs/nexus/audit/SPECS/peb-spring-boot-spec.md`](../docs/nexus/audit/SPECS/peb-spring-boot-spec.md) | PEB implementation specification |

### Active System References

| System | Location | Status |
|---|---|---|
| Conduit (active executor) | `nexus/python/conduit/`, `nexus/typescript/conduit-mcp/` | Operational |
| Service Mesh (JVM operator plane) | `jvm/spring/service-broker/`, `jvm/spring/service-registry/`, `jvm/spring/terrain/` | Operational |
| Nexus Console (operator UI) | `angular/nexus-console/` | Operational |
| Throttler (filesystem projection) | `angular/nexus-console/src/services/remote-file-system.service.ts` | ✅ Has code |
| Nebula (knowledge projection) | `typescript/nebula-srv/`, `angular/nebula-ui/` | ⚠️ Partial |

---

*Plan v0.1 — Atten within the Projection Algebra family, referencing 6 sibling
operators, CIRS constraints, Canonicalizer dependency, and implementation phasing.*
