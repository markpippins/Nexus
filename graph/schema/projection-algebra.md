>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
>

# Projection Algebra — Unified Projection Family

**Version:** 0.1 (Draft)
**Status:** Conceptual — no code, schema, or implementation exists.
**Purpose:** Define the family of projection operators that the Nexus system
uses to transform system state into views, candidates, and actions. This is
the parent abstraction that scopes Atten, Throttler, Nebula, Search, and
other projection mechanisms as siblings within a common algebra.

---

## 1. Identity

### What the Projection Algebra IS

A **projection algebra** is a family of operations that transform one
representation of system state into another representation (a "projection")
at a different layer of abstraction or scope.

Each projection operator in the algebra:

- **Reads** from a specific source domain (filesystem, canonical state,
  knowledge graph, query index, etc.)
- **Emits** zero, one, or many projected views of that domain
- **Is bounded** — no operator sees the full system state
- **Is independent** — no operator depends on another operator's output
  within the same cycle
- **Is typed** — each operator has a known domain, input schema, and output schema

### What the Projection Algebra IS NOT

| Misconception | Correction |
|---|---|
| The Projection Algebra is "Atten generalized" | **False.** Atten is one operator in the algebra, not the archetype the algebra was extracted from. The algebra existed before Atten was named — Throttler's `.magnet` mechanism was already a projection operator. |
| The algebra defines a single projection pipeline | **False.** Operators run in parallel, not in sequence. There is no single "projection pipeline." Each operator projects independently. |
| The algebra implies all projections are the same kind of thing | **False.** Different operators project over fundamentally different domains with different mechanics. What unifies them is the *algebraic structure* (source → transform → emit), not the implementation. |
| The Canonicalizer consumes projections from all operators | **Potentially true, but not required.** The Canonicalizer currently only consumes Atten's projections. Other operators (Throttler, Search) project directly to UI or other consumers without going through the Canonicalizer. |

---

## 2. The Algebra

### Formal Definition

A projection operator `P` is a function:

```
P: (SourceState, Context) → Projection[]
```

Where:

| Component | Description |
|-----------|-------------|
| `SourceState` | The domain-specific state this operator reads (filesystem tree, canonical state, knowledge graph, query index, etc.) |
| `Context` | Parameters that scope the projection (scope boundary, rule set, confidence threshold, etc.) |
| `Projection` | A typed output envelope with: `{ id, type, source, candidate, confidence, trace }` |

### Operators Are Not Composible

No operator feeds into another operator. Each reads from its source domain
independently. Cross-operator coordination happens *outside* the algebra:

- **Canonicalizer** aggregates and resolves Atten-type projections
- **UI layer** renders Throttler-type and Search-type projections directly
- **PEB** constrains all operators through invariant rules
- **WorkRequest** is itself a projection operator (intent → execution) that
  reads committed canonical state

### Operators Are Not Ordered

There is no pipeline sequence. All operators may run concurrently. The system
does not define "first Throttler, then Atten, then Search." They observe
different source domains and emit to different consumers.

---

## 3. Projection Operators

### 3.1 Throttler — Filesystem Scope Projection

| Property | Value |
|----------|-------|
| **Domain** | Physical — filesystem tree |
| **Source** | Remote filesystem state (directory tree, `.magnet` sentinel files) |
| **Mechanism** | Sentinel file detection during directory listing |
| **Projection type** | Scope — "this folder is magnetized and subject to search" |
| **Consumer** | UI (Idea Stream), Search indexer |
| **Passes through Canonicalizer?** | No |
| **Code exists?** | ✅ Yes — `angular/nexus-console/src/services/remote-file-system.service.ts`, `file-system-server` |

Throttler projects filesystem scope by detecting the presence/absence of
`.magnet` sentinel files. Its projection is binary: a folder is either
magnetized (in scope for search) or not. This is the simplest projection
operator in the system and the only one with working production code.

### 3.2 Atten — State/Event Projection

| Property | Value |
|----------|-------|
| **Domain** | Semantic — canonical state |
| **Source** | Canonical state store (committed, post-resolution) |
| **Mechanism** | Parallel, independent generators (inference, deterministic, hybrid) |
| **Projection types** | `state_transition`, `inference`, `classification`, `relationship`, `priority_ordering`, `anomaly` |
| **Consumer** | Canonicalizer / Commit Layer |
| **Passes through Canonicalizer?** | Yes — mandatory |
| **Code exists?** | ❌ No — spec only |

Atten projects over committed canonical state to generate candidate
projections of possible future or derived states. It is the only operator
whose output must pass through the Canonicalizer before any consumer can
act on it.

### 3.3 Nebula — Knowledge/Graph Projection

| Property | Value |
|----------|-------|
| **Domain** | Ontological — knowledge graph, workspace docs, system hierarchy |
| **Source** | PostgreSQL (nebula schema), workspace markdown documents |
| **Mechanism** | Workspace scanning, entity extraction, relationship mapping, ontology emergence |
| **Projection types** | Entity classification, relationship discovery, capability mapping |
| **Consumer** | UI (RMS), Graph pipeline, Planner |
| **Passes through Canonicalizer?** | No |
| **Code exists?** | ✅ Partial — `typescript/nebula-srv/`, `angular/nebula-ui/` |

Nebula projects knowledge structure from workspace documents and database
records. It is the ontological projection operator — it answers "what
entities exist and how do they relate?"

### 3.4 Search — Query/Result Projection

| Property | Value |
|----------|-------|
| **Domain** | Epistemic — search index, query results |
| **Source** | Search index (Moleculer, search-service), query parameters |
| **Mechanism** | Full-text search, faceted filtering, relevance ranking |
| **Projection types** | Result set, relevance score, facet distribution |
| **Consumer** | UI (search results, Idea Stream) |
| **Passes through Canonicalizer?** | No |
| **Code exists?** | ✅ Yes — `moleculer/search/`, `jvm/spring/service-broker/search-service/` |

Search projects query results from indexed content. It is the epistemic
projection operator — it answers "what does the system know about X?"

### 3.5 WorkRequest — Intent/Action Projection

| Property | Value |
|----------|-------|
| **Domain** | Operational — intent → execution contract |
| **Source** | Committed canonical state, Planner reasoning |
| **Mechanism** | Plan elaboration + context resolution → immutable WorkRequest |
| **Projection types** | `execution_contract` (the WorkRequest itself is a projection of intent onto an executable form) |
| **Consumer** | Conduit / Temporal (execution fabric) |
| **Passes through Canonicalizer?** | No — WorkRequest is committed directly |
| **Code exists?** | ✅ Partial — Conduit Python + MCP, `WORKREQUEST_SPEC.md` |

A WorkRequest is a projection of intent into an executable contract. It reads
from canonical state (what is true) and Planner output (what should be done)
and emits an immutable execution artifact.

### 3.6 PEB — Constraint Projection

| Property | Value |
|----------|-------|
| **Domain** | Governance — invariants, rules, contracts |
| **Source** | PEB state (decision log, invariants, architecture records) |
| **Mechanism** | Rule evaluation, invariant checking, contract enforcement |
| **Projection types** | Constraint satisfaction, violation report, trajectory check |
| **Consumer** | Canonicalizer (pre-commit gate), Planner, all operators |
| **Passes through Canonicalizer?** | No — PEB constrains, not projects for resolution |
| **Code exists?** | ❌ No — aspirational spec only |

PEB projects governance constraints over all other operations. It doesn't
project *what is* or *what could be* — it projects *what is allowed.*

---

## 4. Operator Comparison

| Operator | Domain | Source | Consumer | Via Canonicalizer? | Has Code? |
|----------|--------|--------|----------|-------------------|-----------|
| **Throttler** | Physical | Filesystem tree | UI, Search index | No | ✅ |
| **Atten** | Semantic | Canonical state | Canonicalizer | **Yes** | ❌ |
| **Nebula** | Ontological | Knowledge graph | UI, Graph pipeline | No | ✅ Partial |
| **Search** | Epistemic | Search index | UI | No | ✅ |
| **WorkRequest** | Operational | Canonical state + Planner | Conduit/Temporal | No | ✅ Partial |
| **PEB** | Governance | Invariant records | All operators | No | ❌ |

---

## 5. Key Invariants

### A1 — No Canonical Reference

No projection operator is the "reference" or "archetype" for the algebra.
The algebra is the abstraction; all operators are members on equal footing.

### A2 — Domain Separation

Each operator projects over exactly one source domain. No operator reads
from another operator's source domain as its primary input. (An operator
*may* read committed canonical state that was influenced by another operator
via the Canonicalizer, but this is indirect.)

### A3 — No Operator Chaining

Operators do not feed into each other. No operator's output is another
operator's primary input. Cross-operator coordination is mediated by:
- The Canonicalizer (for Atten)
- The UI layer (for Throttler, Search, Nebula)
- Direct commitment (for WorkRequest)

### A4 — Independent Cycles

All operators may run concurrently within a cycle. No operator waits for
another to complete before projecting.

### A5 — Bounded View Per Operator

Each operator has a defined scope boundary. Throttler sees filesystem trees
but not canonical state. Atten sees canonical state but not filesystem trees.
No operator sees everything.

### A6 — Typed Output

Every projection has a type that identifies which operator produced it and
what domain it belongs to. Consumers use the type to route projections
correctly.

---

## 6. Relationship Diagram

```
Source Domains                    Projection Operators               Consumers
─────────────────                ────────────────────              ──────────

Filesystem tree ───────────────► Throttler ───────────────► UI / Search
                                    │
Canonical State ─────────────────► Atten ──────────────────► Canonicalizer ──► State
                                    │
Knowledge Graph ─────────────────► Nebula ─────────────────► UI / Graph
                                    │
Search Index ───────────────────► Search ──────────────────► UI
                                    │
Canonical State + Planner ──────► WorkRequest ─────────────► Conduit
                                    │
Invariant Records ──────────────► PEB ─────────────────────► All operators (constrain)
```

Note: Atten is the *only* operator that feeds into the Canonicalizer. Other
operators project directly to their consumers. This is not because Atten is
special — it is because Atten's domain (semantic projections over canonical
state) specifically requires conflict resolution before consumption. Other
operators' projections (filesystem scope, query results, knowledge graphs)
are consumed directly without a resolution step.

---

## 7. Current Status

| Aspect | Status |
|--------|--------|
| **Spec** | ✅ Written (this document) |
| **Operators defined** | 6: Throttler, Atten, Nebula, Search, WorkRequest, PEB |
| **Operators with code** | Throttler (✅), Search (✅), Nebula (⚠️ partial), WorkRequest (⚠️ partial) |
| **Operators with spec only** | Atten (❌), PEB (❌) |
| **Canonicalizer** | ❌ Not designed |
| **Integration** | ❌ Not wired |

---

## 8. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1 | 2026-06-15 | Initial spec — defines the Projection Algebra as the parent abstraction for Throttler, Atten, Nebula, Search, WorkRequest, and PEB. Corrects the implicit hierarchy where Atten was treated as the projection archetype. |
| 0.2 | 2026-06-15 | Added Appendix B (XIL / semantic firewall boundary) and Appendix C (hash→lookup→projection three-layer model) from chat transcript analysis. |
| 0.3 | 2026-06-15 | Added Appendix D (Compositional Algebra Extension — bounded composition via ProjectionIR substrate) from Self-audit transcript analysis. |

---

## 9. Appendix B: XIL — External Intelligence Layer Boundary

> **Notice:** This appendix is additive. It defines the **ingress boundary**
> for all projection operators — how external inputs reach the source domains
> that operators read from. No content in sections 1–8 is deprecated.

### B.1 What XIL Is

The **External Intelligence Layer (XIL)** is a semantic firewall that sits
between external actors and the system's internal state. It answers:

> *How do external actors participate in SRP/CGEL without corrupting system
> invariants or LOSM stability?*

XIL enforces three transformations before any external input reaches a source
domain that a projection operator might read:

| Stage | Transformation | Description |
|-------|---------------|-------------|
| **Parsing** | Signal → Event candidate | External input converted into intent hypotheses, structured event candidates, partial projections (CIR confidence scored) |
| **Projection** | Event → system-compatible form | Each candidate projected into TTS-compatible types, STOA-compatible objective space, CGEL-valid transition forms |
| **Validation** | Candidate → committed event | If projectable: committed to the event backbone. If *not* projectable: **quarantined**, not rejected. |

### B.2 Quarantine — Not Rejection

The quarantine mechanism is a critical architectural choice:

- **Non-projectable inputs are preserved** — they are isolated in a quarantine
  buffer, not discarded. This means system evolution can later re-process them
  with updated projection rules.
- **No hard failure from malformed input** — the system never crashes or
  rejects because of unrecognized external input.
- **Quarantine is observable** — quarantined inputs generate observation events
  that can trigger Atten projections (e.g., "quarantine buffer growing →
  projection rules may be stale").

### B.3 Mapping to the Projection Algebra

Each projection operator reads from a source domain that has already been
processed through XIL:

| Operator | Source Domain | XIL Processing Required? |
|----------|--------------|--------------------------|
| Throttler | Filesystem tree (`.magnet` sentinels) | N/A (filesystem state is internal) |
| Atten | Canonical state | ✅ Yes — all committed state is post-XIL |
| Nebula | Knowledge graph, workspace docs | ✅ Yes (workspace imports via XIL) |
| Search | Search index | N/A (index built from internal content) |
| WorkRequest | Canonical state + Planner | ✅ Yes — intent flows through XIL |
| PEB | Invariant records | N/A (PEB is internal governance) |

**Key principle:** External intelligence never enters GEL directly. Everything
external passes through event normalization + constraint projection first.
No raw external input touches the canonical state that operators read.

### B.4 Relevance to Operator Independence

XIL reinforces Invariant **A5 (Bounded View Per Operator)**. Since all external
inputs are normalized and validated before reaching operator source domains,
operators never need to handle unvalidated external data. This preserves their
domain separation and keeps them independent of external signal shape.

### B.5 Reference

- Transcript: `dev/chats/Buzzwords by Layer.html` — full XIL definition
- Atten spec Appendix B — XIL as Atten's upstream input boundary
- Atten spec §3 — Atten reads from canonical state, not raw events

---

## 10. Appendix C: Hash→Lookup→Projection — Three-Layer Identity Model

> **Notice:** This appendix is additive. It defines an identity resolution
> model that clarifies how projection operators relate to event identity.
> It does not change the operator definitions in sections 1–7.

### C.1 The Three-Layer Model

The System Accretion Cascade transcript defines three distinct spaces for
event/object identity. This model applies to all projection operators:

```
┌──────────────────────────────────────────────────────┐
│  A. HASH SPACE (opaque, context-free)                │
│                                                       │
│  event_id = SHA256(content)                           │
│  hash = address, NOT compression                      │
│  No learnable structure in the hash                   │
│  Hash is a pointer, not meaning                       │
└─────────────────────┬────────────────────────────────┘
                      │ resolves to
┌─────────────────────▼────────────────────────────────┐
│  B. LOOKUP SPACE (canonical truth store)              │
│                                                       │
│  Structured object graph (event records, state)       │
│  Deterministic reconstruction from hash               │
│  All semantic relationships live here                 │
│  Queryable, relational, causal                        │
└─────────────────────┬────────────────────────────────┘
                      │ projects
┌─────────────────────▼────────────────────────────────┐
│  C. PROJECTION SPACE (interpretation, learning)       │
│                                                       │
│  Task-specific views of lookup-space data             │
│  Multiple projections from same identity                │
│  Domain-dependent reasoning lives here                │
│  Learning happens in projection space, NOT hash space │
└──────────────────────────────────────────────────────┘
```

### C.2 Key Invariant

> **Compression is not understanding.**
> Semantic interpretation happens in projection space, not hash space.

Even if a hash is derived from content via deterministic computation, the
hash itself carries no meaning. All learning, classification, and reasoning
occurs in the resolved object graph (lookup space) and its derived views
(projection space).

### C.3 Mapping to Projection Operators

Each projection operator works in **projection space**, reading from **lookup
space**:

| Operator | Lookup Space (reads) | Projection Space (emits) |
|----------|---------------------|--------------------------|
| Throttler | Filesystem tree state | Binary scope projection: magnetized or not |
| Atten | Canonical state store | Typed candidate projections (state_transition, inference, etc.) |
| Nebula | Knowledge graph, workspace docs | Entity classification, relationship discovery |
| Search | Search index | Result set, relevance score, facet distribution |
| WorkRequest | Canonical state + Planner reasoning | Execution contract (immutable WorkRequest) |
| PEB | Invariant records, decision log | Constraint satisfaction, violation reports |

### C.4 Hash = Address, Not Compression

For the system's identity model, this means:

- ✅ Hash is a stable, context-free lookup key
- ✅ Different resolvers can project different views from the same identity
- ✅ Variation is in the projection layer, not in the hash
- ❌ Hash does not contain learnable structure
- ❌ Hash does not encode semantics via bit patterns
- ❌ Hash is not interpretable in isolation

### C.5 System Mapping

| System | Space | Role |
|--------|-------|------|
| **Nebula** | Projection space | Operates on resolved structures, consumes projections |
| **Nexus** | Lookup space | Owns the lookup graph, reconstructs relationships, maintains canonical event lineage |
| **Conduit / Execution layer** | Hash space | Consumes minimal semantic payloads; never resolves |
| **PEB** | Across all three | Hashes for identity, state for governance, traces for observation |

### C.6 Reference

- Transcript: `dev/chats/System Accretion Cascade.html` — full three-layer model definition
- This spec §5 — Invariant A5 (Bounded View Per Operator)
- PEB spec §2.6 — `peb_transactions` with before/after hashes

---

## 10. Appendix D: Compositional Algebra Extension

> **Notice:** This appendix is **exploratory**. It describes a potential
> extension to the Projection Algebra that would introduce bounded
> composition through the ProjectionIR substrate. This extension is NOT
> part of the current algebra (which explicitly forbids operator chaining).
> It is documented here to preserve the design space for future evolution.

### D.1 Motivation

The current algebra enforces **strict operator independence** — no operator
may feed into another. This preserves domain separation and prevents
epistemic contamination, but it also prevents:

- **Cross-operator synthesis** — combining Throttler scope with Atten
  semantic matches to produce richer views
- **Projection refinement** — using Search results to narrow an Atten
  projection scope
- **Projection fusion** — merging multi-operator IR into a single
  synthesized view

These capabilities are valuable for UI, analysis, and planning — but they
must not come at the cost of operator coupling or epistemic contamination.

### D.2 Solution: Bounded Composition via ProjectionIR

Composition is enabled through the **ProjectionIR** substrate — a normalized,
read-only, non-authoritative intermediate representation that sits downstream
of all operators. See `graph/schema/projection-ir.md`.

**Key constraint:** Operators still do not read each other's output.
Composition happens in the **Synthesis Layer**, which consumes ProjectionIR
streams and produces non-authoritative aggregate views.

### D.3 Composition Operations

Four composition operations are defined, all operating on ProjectionIR
entries:

#### D.3.1 Projection Fusion

Combine two or more IR entries from different operators into a single
synthesized view.

```
Input:  [AttenIR{entity: "foo", confidence: 0.87},
         SearchIR{query: "foo", results: [...], confidence: 0.92}]
Output: SynthesizedView{
          interpretation: { entity: "foo",
                            atten_match: 0.87,
                            search_results: [...],
                            combined_confidence: 0.89 },
          sources: ["atten", "search"] }
```

**CIRS constraint:** Fusion may not escalate authority. Combined confidence
must derive from (not exceed) individual confidences. Output is a
`SynthesizedView`, not a new `ProjectionIR` entry. (CIRS-IR-03, CIRS-SYN-01)

#### D.3.2 Projection Refinement

Narrow one operator's projection using context from another operator's
projection.

```
Input:  [ThrottleIR{path: "/projects/foo", magnetized: true},
         NebulaIR{graph: {"/projects/foo" → "active_project"}}]
Output: SynthesizedView{
          interpretation: { scoped_path: "/projects/foo",
                            classification: "active_project" },
          sources: ["throttler", "nebula"] }
```

**CIRS constraint:** Refinement narrows scope but does not increase
certainty or authority. The refined view is for UI/analysis only.
(CIRS-IR-06, CIRS-SYN-01)

#### D.3.3 Projection Comparison

Compare projections from two operators for alignment analysis.

```
Input:  [AttenIR{entity: "foo", score: 0.87},
         SearchIR{query: "foo", top_result: "bar", score: 0.92}]
Output: SynthesizedView{
          interpretation: { alignment: "partial",
                            atten_entity: "foo",
                            search_top: "bar",
                            discrepancy: 0.13 },
          sources: ["atten", "search"],
          flags: ["mismatch_detected"] }
```

**CIRS constraint:** Comparison is for informational purposes only. It
must not influence either operator's future execution. (CIRS-IR-10,
CIRS-AUD-02)

#### D.3.4 Projection Collapse (Generalized Canonicalization)

Consume projection content to produce or update canonical state.

```
Input:  AttenIR{entity: "foo", score: 0.95, evidence: [...]}
Output: CanonicalStateUpdate{ entity: "foo", status: "committed" }
```

**CIRS constraint:** This is the most restricted operation. Currently only
the Canonicalizer (Atten → canonical state) is permitted. Any extension
would require explicit CIRS rule amendment. (CIRS-IR-08, CIRS-CORE)

### D.4 CIRS Rules for Composition

The following additional CIRS rules govern composition (extending the
IR family):

| Rule | Description |
|------|-------------|
| **CIRS-CMP-01** | Composition is epistemic only. No composition operation may produce a WorkRequest or execution directive. |
| **CIRS-CMP-02** | Composition operates on ProjectionIR only. No operator reads another operator's native output. |
| **CIRS-CMP-03** | Composition output is a SynthesizedView, never a new ProjectionIR entry. Composers are consumers, not producers of IR. |
| **CIRS-CMP-04** | Composition must not create feedback loops. A composed view must not re-enter any operator's source domain in the same cycle. |

### D.5 What Changes in the Algebra

| Invariant | Current | With Bounded Composition |
|-----------|---------|------------------------|
| **A3: No Operator Chaining** | Operators do not feed into each other | Unchanged. Composition is downstream of all operators, not between them. |
| **A4: Independent Cycles** | All operators run concurrently | Unchanged. Composition runs after all operators complete. |
| **A6: Typed Output** | Every projection has a type | Extended: SynthesizedView has a composition type (fusion/refinement/comparison/collapse). |

### D.6 What Does NOT Change

- Operators remain independent — they do not read each other's output
- The algebra remains a family of independent operations
- No operator depends on another operator for its core projection
- WorkRequest remains the only path to execution
- CIRS rules remain the authoritative boundary enforcement

### D.7 When Not to Use Composition

Composition should not be used when:

- The desired cross-operator view can be achieved in the UI layer
  independently (just render two projections side by side)
- The composition would create a dependency that prevents independent
  operator evolution
- The composition would give Synthesis any form of execution authority
- The composed view would be mistaken for canonical truth

### D.8 Reference

- CIRS spec: `graph/cognitive-integrity-rule-system.md` — CMP rules defined
  in §5 (IR family)
- ProjectionIR spec: `graph/schema/projection-ir.md` — the substrate
  enabling composition
- Transcript: `chats/Self-audit in Agent Runtime.html` — compositional
  algebra extension analysis (§28.5 in ANALYSIS.md)
