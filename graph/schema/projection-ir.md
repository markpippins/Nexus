# ProjectionIR — Epistemic Intermediate Representation

**Version:** 0.1  
**Status:** Spec — no code or schema exists  
**File:** `graph/schema/projection-ir.md`  
**Governed by:** CIRS-IR rules (see `graph/cognitive-integrity-rule-system.md`)  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Positioning](#2-positioning)
3. [Schema](#3-schema)
4. [Adapter Layer Pattern](#4-adapter-layer-pattern)
5. [Synthesis Layer](#5-synthesis-layer)
6. [Governance (CIRS-IR)](#6-governance-cirs-ir)
7. [Flow Diagrams](#7-flow-diagrams)
8. [Relation to Projection Algebra](#8-relation-to-projection-algebra)
9. [Current Gap](#9-current-gap)

---

## 1. Overview

**ProjectionIR** is a normalized, read-only, ephemeral intermediate
representation that sits between projection operator output and downstream
consumers (Synthesis, UI, Planner).

### Problem It Solves

Each projection operator currently has its own terminal artifact type:

| Operator | Artifact Type | Format |
|----------|--------------|--------|
| Atten | `AttenProjection` | Internal canonical format |
| Search | `SearchResult` | Query-specific |
| Nebula | `NebulaProjection` | Graph-oriented |
| Throttler | `ThrottlerScope` | Filesystem-oriented |
| WorkRequest | `WorkRequest` | Execution contract |
| PEB | `GovernanceDecision` | Invariant record |

These types are incompatible. Cross-operator reasoning requires ad-hoc
conversion at each consumer site. ProjectionIR provides a **unified format**
that all operators emit into, enabling:

- Cross-operator synthesis without coupling operators
- Shared confidence/authority metadata
- Uniform consumer interface (UI, Planner, analysis tools)
- Traceable provenance from observation through projection

### What ProjectionIR Is NOT

- **Not an execution artifact** — it carries zero authority
- **Not a storage format** — it is ephemeral, recompute-always
- **Not an operator interconnect** — operators still do not chain;
  ProjectionIR is downstream of all operators
- **Not a canonical system** — it does not accumulate state

---

## 2. Positioning

ProjectionIR sits **between** operator output and consumers — after operators
complete their projections, before any downstream reasoning occurs.

### Current Architecture (No ProjectionIR)

```
Source Domains → Operators → Consumers (UI / Canonicalizer / Planner)
                                                ↓
                                          WorkRequest → Conduit
```

Each operator emits to consumers directly. Cross-operator synthesis requires
each consumer to understand multiple operator-specific formats.

### With ProjectionIR

```
Source Domains → Operators → [ProjectionIR Adapter] → Synthesis
                                                          ↓
                                              Consumers (UI / Planner)
                                                          ↓
                                                WorkRequest → Conduit
```

Operators emit their native projections. The ProjectionIR Adapter Layer
normalizes these into a common format. Synthesis produces non-authoritative
aggregate views. Consumers read from Synthesis (or from ProjectionIR
directly for single-operator views).

### Detailed Placement

```
                 ┌──────────────────────────────┐
Atten ──────────►│                              │
Search ─────────►│  ProjectionIR Adapter Layer  │───► Canonicalizer
Nebula ─────────►│                              │───► Planner
Throttler ──────►│                              │───► UI synthesis
                 └──────────────────────────────┘
```

---

## 3. Schema

### Minimal ProjectionIR Entry

```typescript
interface ProjectionIREntry {
  /** Which operator emitted this projection */
  source_operator: string;

  /** Projection domain within the operator */
  domain: string;

  /** The projected content (operator-specific) */
  proposition: any;

  /** Epistemic confidence: 0.0 (speculative) to 1.0 (certain)
   *  This is the CIR (Cognitive Integrity Ratio) measurement —
   *  how far this projection is from raw observation. */
  confidence: number;

  /** CIRS rules that apply to this entry */
  constraints: string[];

  /** Observation lineage — IDs of source observations */
  trace: string[];
}
```

### Constraints on Fields

| Field | Constraint | CIRS Rule |
|-------|-----------|-----------|
| `source_operator` | Must match a registered operator | IR-04 |
| `domain` | Must be within operator's declared domains | IR-04 |
| `proposition` | Must not contain executable code | IR-01, IR-05 |
| `confidence` | Must be 0.0–1.0; set by operator, not adjustable by consumers | IR-03 |
| `constraints` | Must include all CIRS-IR rules that apply | IR-META |
| `trace` | Must reference at least one Observation or event ID | CAUSAL-01 |

### ProjectionIR Stream

A ProjectionIR stream is an ordered collection of entries, typically
representing all projections from one cycle:

```typescript
type ProjectionIRStream = ProjectionIREntry[];
```

Streams are:
- **Ephemeral** — created per cycle, discarded after consumption
- **Immutable** — entries are append-only within a stream
- **Non-authoritative** — no entry carries execution authority

---

## 4. Adapter Layer Pattern

Each operator requires an adapter that converts its native projection format
into ProjectionIR entries.

### Adapter Interface

```typescript
interface ProjectionIRAdapter<NativeType> {
  /** Convert one native projection to ProjectionIR */
  adapt(projection: NativeType, trace: string[]): ProjectionIREntry;

  /** Convert multiple native projections to a stream */
  adaptAll(projections: NativeType[], traces: string[][]): ProjectionIRStream;
}
```

### Adapter Responsibilities

Each adapter must:

1. **Preserve the operator's domain identity** — `source_operator` must
   match the operator's registered name
2. **Assign confidence** — map operator-internal confidence to 0.0–1.0 scale
3. **Attach constraints** — declare which CIRS rules apply
4. **Maintain trace lineage** — each entry must trace to source observations
5. **Strip execution authority** — ensure no executable content leaks into
   the `proposition` field

### Adapter Examples

**Atten Adapter:**
```
AttenProjection {
  type: "semantic_match",
  candidate: { entity: "foo", score: 0.87 },
  evidence: ["obs-123", "obs-456"]
}
→
ProjectionIREntry {
  source_operator: "atten",
  domain: "semantic_match",
  proposition: { entity: "foo", score: 0.87 },
  confidence: 0.87,
  constraints: ["CIRS-IR-01", "CIRS-IR-06"],
  trace: ["obs-123", "obs-456"]
}
```

**Throttler Adapter:**
```
ThrottlerScope {
  path: "/projects/foo",
  magnet: true
}
→
ProjectionIREntry {
  source_operator: "throttler",
  domain: "filesystem_scope",
  proposition: { path: "/projects/foo", magnetized: true },
  confidence: 1.0,
  constraints: ["CIRS-IR-01"],
  trace: ["obs-789"]
}
```

---

## 5. Synthesis Layer

The **Synthesis Layer** sits above ProjectionIR and produces
`SynthesizedView` objects — non-authoritative, aggregate interpretations
that combine entries from multiple operators.

### SynthesizedView Schema

```typescript
interface SynthesizedView {
  /** Which IR entries were combined */
  sources: string[];  // trace IDs / entry refs

  /** The synthesized content */
  interpretation: any;

  /** Aggregate confidence (derived, not authoritative) */
  confidence: number;

  /** Warning flags */
  flags: string[];
}
```

### Synthesis Rules

| Rule | Description | CIRS Reference |
|------|-------------|----------------|
| **No authority escalation** | Synthesis may combine IR entries but may not increase their authority | CIRS-IR-03 |
| **No execution commands** | Synthesis may not emit WorkRequests or execution directives | CIRS-IR-09, CIRS-SYN-01 |
| **No persistence** | SynthesizedViews are ephemeral, like IR | CIRS-IR-07 |
| **No shadow canonicalization** | Synthesis may not accumulate state across cycles | CIRS-IR-08 |

### What Synthesis Enables

- **Cross-operator dashboards** — UI that shows Atten matches alongside
  Throttler scope and Search results
- **Planner context** — Planner receives synthesized views of system state,
  not raw IR
- **Confidence-weighted fusion** — combining overlapping projections from
  different operators with confidence weighting

### What Synthesis Does NOT Enable

- **Operator chaining** — operators still do not read each other's output.
  Synthesis is a consumer, not a routing layer.
- **Automated decision-making** — Synthesis output must pass through
  Planner/WorkRequest to influence execution.

---

## 6. Governance (CIRS-IR)

ProjectionIR is governed by 11 CIRS rules (IR-01 through IR-10 plus
IR-META-01). See `graph/cognitive-integrity-rule-system.md` for full
definitions.

| Rule | What It Enforces |
|------|-----------------|
| **CIRS-IR-01** | ProjectionIR carries zero execution authority |
| **CIRS-IR-02** | ProjectionIR exists only in defined scopes (adapter → synthesis → consumer) |
| **CIRS-IR-03** | IR cannot upgrade epistemic status |
| **CIRS-IR-04** | IR cannot alter operator authority hierarchy |
| **CIRS-IR-05** | IR cannot appear in execution paths |
| **CIRS-IR-06** | Synthesis from IR is epistemic only |
| **CIRS-IR-07** | IR is ephemeral — never persisted |
| **CIRS-IR-08** | IR cannot become a parallel canonical system |
| **CIRS-IR-09** | Only WorkRequests can carry execution contracts; IR cannot |
| **CIRS-IR-10** | IR cannot cause cross-operator contamination |
| **CIRS-IR-META-01** | IR is a read-only epistemic normalization layer |

### Enforcement

1. **Adapter level** — Adapters strip any executable content before creating
   IR entries (CIRS-IR-01, IR-05)
2. **Stream level** — Consumers cannot write back to an IR stream (IR-02)
3. **Synthesis level** — Synthesis cannot emit WorkRequests (IR-06, IR-09)
4. **Persistence level** — Any system attempting to cache IR is in violation
   (IR-07, IR-08)

---

## 7. Flow Diagrams

### Single Observation Flow

```
(1) OBSERVATION
    │
    │  CIRS: OBS-01 (factual intake only)
    ▼
[ Observer ]
    │
    │ emits immutable event
    ▼
[ Event Log ]
    │ CIRS: EVT-01 (append-only)
    ▼
────────────────────────────────────
        OPERATOR DOMAIN
────────────────────────────────────

    │
    ├──► [ Operator ]
    │       │
    │       │ CIRS: PROJ-01 (domain-bound)
    │       ▼
    │    Native Projection
    │       │
    │       ▼
    │    [ ProjectionIR Adapter ]
    │       │
    │       │ CIRS: IR-01, IR-04, IR-07
    │       ▼
    │    ProjectionIREntry
    │
    ▼
────────────────────────────────────
        ProjectionIR Stream
────────────────────────────────────

    │
    ▼
[ Synthesis Layer ]
    │ CIRS: IR-06, SYN-01
    ▼
SynthesizedView
    │
    ├──► UI (visualization)
    ├──► Planner (context)
    └──► Analysis

    ▼
────────────────────────────────────
        EXECUTION DOMAIN
────────────────────────────────────

[ WorkRequest ]
    │ CIRS: IR-09, CORE
    ▼
[ Conduit ]
```

### Multi-Operator Synthesis Flow

```
             ┌──────────┐
  Atten ────►│  Adapter │──► AttenIR ──┐
             └──────────┘              │
             ┌──────────┐              ├──► Synthesis ──► SynthesizedView
  Search ───►│  Adapter │──► SearchIR ─┘
             └──────────┘
             ┌──────────┐
  Nebula ───►│  Adapter │──► NebulaIR ─┐
             └──────────┘              │
             ┌──────────┐              ├──► Synthesis ──► SynthesizedView
Throttler ──►│  Adapter │──► ThrottleIR┘
             └──────────┘
```

---

## 8. Relation to Projection Algebra

ProjectionIR is **compatible with** and **extends** the Projection Algebra
defined in `graph/schema/projection-algebra.md`.

### Compatibility

| Projection Algebra Invariant | How ProjectionIR Preserves It |
|------------------------------|------------------------------|
| **A1: No Canonical Reference** | IR is a normalized output format, not a canonical operator |
| **A2: Domain Separation** | Each IR entry preserves `source_operator` and `domain` |
| **A3: No Operator Chaining** | IR is downstream of all operators; operators do not read each other's IR |
| **A4: Independent Cycles** | All adapters emit independently; no adapter waits for another |
| **A5: Bounded View** | Each IR entry is bounded to its operator's domain |
| **A6: Typed Output** | IR entries include type information from the source operator |

### Extension

ProjectionIR adds a shared normalization layer that the algebra currently
lacks. This does **not** violate the "no chaining" invariant because:

- Operators still do not read each other's output
- The IR layer is read-only — operators emit into it but never consume from it
- The IR layer is downstream — it has no influence on operator execution
- Cross-operator reasoning happens in Synthesis, which has no authority

---

## 9. Current Gap

ProjectionIR is currently **spec-only**. The following implementation work
is required:

1. **Schema definition** — TypeScript/JSON Schema for ProjectionIREntry
2. **Adapter implementations** — One adapter per operator (Atten, Search,
   Nebula, Throttler, WorkRequest, PEB)
3. **Synthesis prototype** — Minimal Synthesis layer consuming IR streams
4. **CIRS-IR validation** — Automated checks that IR entries comply with
   all 11 governing rules
5. **Integration** — Wire adapters into operator output paths

---

*ProjectionIR v0.1 — Enables cross-operator reasoning without violating
operator independence. Governed by CIRS-IR rules (11 rules). See also:
`graph/schema/projection-algebra.md`, `graph/cognitive-integrity-rule-system.md`.*
