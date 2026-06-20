# Cognitive Integrity Rule System (CIRS)

## Related Specifications

| Document | Relationship |
|---|---|
| [`peb-mcp-spec.md`](./peb-mcp-spec.md) | PEB governance kernel — CIRS governs PEB decisions, Merkle hash use, proof integrity |
| [`ANALYSIS.md`](./ANALYSIS.md) | CIR vs CIRS disambiguation (§30) — superseded by CIRS |
| [`dev-runtime-manifest.md`](./dev-runtime-manifest.md) | Manifest-driven runtime — references CIRS rules and governance constraints |
| [`atten-spec.md`](./atten-spec.md) | Atten — CIRS enforces constraints on Atten's candidate projections |
| [`WORKREQUEST_SPEC.md`](./WORKREQUEST_SPEC.md) | WorkRequest — CIRS governs execution authority for WorkRequests |

**Status:** v0.1 — Extracted from "Self-audit in Agent Runtime" transcript  
**Date:** 2026-06-15  
**File:** `graph/cognitive-integrity-rule-system.md`  
**Supersedes:** CIR-only framing (Cognitive Integrity *Ratio*) — see §Disambiguation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Disambiguation: CIR vs CIRS](#2-disambiguation-cir-vs-cirs)
3. [Core Axioms](#3-core-axioms)
4. [Type Universe](#4-type-universe)
5. [Rule Family: IR (ProjectionIR Integrity)](#5-rule-family-ir-projectionir-integrity)
   - IR-01 through IR-10, IR-META-01
6. [Rule Family: CORE (Cross-Domain Separation)](#6-rule-family-core-cross-domain-separation)
7. [Rule Family: AUD (Audit Non-Influence)](#7-rule-family-aud-audit-non-influence)
   - AUD-01, AUD-02, AUD-03
8. [Rule Family: CAUSAL (Causal Integrity)](#8-rule-family-causal-causal-integrity)
   - CAUSAL-01, CAUSAL-02, CAUSAL-CORE
9. [Rule Family: VEL (Verification Execution Ledger)](#9-rule-family-vel-verification-execution-ledger)
   - VEL-01, VEL-02, VEL-CORE
10. [Rule Family: MED (Merkle Integrity)](#10-rule-family-med-merkle-integrity)
    - MED-01
11. [Rule Family: SPoE (Proof Integrity)](#11-rule-family-spoe-proof-integrity)
    - SPoE-01
12. [Rule Family: PAL (Proof Access Layer)](#12-rule-family-pal-proof-access-layer)
    - PAL-01
13. [Rule Family: CTS (Causal Type System)](#13-rule-family-cts-causal-type-system)
    - CTS-01
14. [Rule Family: SYN/PLN/EXE (Pipeline Stage Integrity)](#14-rule-family-synplnexe-pipeline-stage-integrity)
    - SYN-01, PLN-01, EXE-01
15. [Rule Family: BOOT (Bootstrap Integrity)](#15-rule-family-boot-bootstrap-integrity)
    - BOOT-01, BOOT-02
16. [The Three Hard CIRS Boundaries](#16-the-three-hard-cirs-boundaries)
17. [CIRS as Epistemic Type System](#17-cirs-as-epistemic-type-system)
18. [CIRS-Safe Event Flow](#18-cirs-safe-event-flow)
19. [Enforcement Model](#19-enforcement-model)
20. [Relationship to Other Specs](#20-relationship-to-other-specs)

---

## 1. Overview

The **Cognitive Integrity Rule System (CIRS)** is a formal epistemic boundary
enforcement system for the Nexus architecture. It answers a single question:

> *What transformations between epistemic states are allowed?*

CIRS is **not** a runtime validator that checks compliance after the fact.
It is a **type system for epistemic states** — violations are structurally
impossible to represent, not merely detected at runtime.

### Purpose

- Prevent epistemic contamination between observation, analysis, and execution
- Ensure that no artifact that participates in synthesis may participate in
  execution (and vice versa)
- Provide deterministic, checkable boundaries for all operator-to-operator
  and operator-to-runtime transitions
- Enable static detection of invalid epistemic flows at compile/design time

### Scope

CIRS governs all data and control flow within the Nexus epistemic plane and
across the Nexus/Conduit boundary. It does **not** govern:

- Conduit-internal execution semantics
- Operator-internal projection logic (each operator has its own authority)
- UI rendering or user interaction patterns

---

## 2. Disambiguation: CIR vs CIRS

Earlier documents reference **CIR** (Cognitive Integrity *Ratio*). CIR and CIRS
are related but distinct concepts:

| Concept | What It Is | Status |
|---------|-----------|--------|
| **CIR** | Cognitive Integrity *Ratio* — a distance measurement expressing how far a projection is from raw observation. A continuous metric (0.0–1.0) indicating epistemic distance from source truth. | Deprecated as standalone; subsumed into CIRS as part of the confidence field in ProjectionIR |
| **CIRS** | Cognitive Integrity *Rule System* — a formal rule/enforcement system with ~30+ defined rules across 10 families. Binary: a transition is either CIRS-valid or CIRS-invalid. | Active. This document. |

**Why CIR alone was insufficient:** A ratio provides a measurement but no
enforcement boundary. CIRS provides the hard gates — rules that reject
transitions before they occur. CIR measurements may inform CIRS decisions
(e.g., a low-confidence projection may be quarantined), but CIRS does not
depend on CIR for its core enforcement.

**Migration:** All references to "CIR" in existing specs should be understood
as referring to the ratio concept within CIRS's confidence tracking, not as
an independent system.

---

## 3. Core Axioms

CIRS is built on four axioms that cannot be violated:

### Axiom 1: Domain Separation

```
Observation, Projection, Synthesis, and Execution are disjoint epistemic domains.
No artifact may belong to more than one domain simultaneously.
```

### Axiom 2: Non-Authority of Epistemic Artifacts

```
Only Observations and WorkRequests carry execution authority.
All intermediate epistemic artifacts (Projection, ProjectionIR, SynthesizedView)
carry zero execution authority.
```

### Axiom 3: One-Way Gate

```
The epistemic pipeline is strictly directional:
Observation → Projection → ProjectionIR → Synthesis → WorkRequest → Execution
No reverse transitions are permitted.
```

### Axiom 4: Audit Non-Influence

```
Execution traces may inform human understanding but must never influence
future WorkRequest generation, ProjectionIR synthesis, or planning.
```

---

## 4. Type Universe

CIRS defines a universe of epistemic types. Every artifact in the system
is an instance of exactly one type:

| Type | Symbol | Authority | Persistence | Domain |
|------|--------|-----------|-------------|--------|
| Observation | `Obs` | Full | Immutable | Raw fact |
| Projection | `Proj[d]` | None | Ephemeral | Operator-specific |
| ProjectionIR | `IR` | None | Ephemeral | Normalized epistemic |
| SynthesizedView | `Syn` | None | Ephemeral | Cross-operator |
| IntentPlan | `Plan` | None | Ephemeral | Planning |
| WorkRequest | `WR` | Full | Durable | Execution contract |
| Conduit Execution | `Exe` | Internal | Durable (trace) | Conduit runtime |
| AuditRecord | `Aud` | None | Durable (append-only) | Post-execution |

**Key invariant:** Each type has a fixed authority level. No operation may
upgrade an artifact's authority. No operation may downgrade an artifact's
authority for the purpose of bypassing CIRS gates.

---

## 5. Rule Family: IR (ProjectionIR Integrity)

The IR rule family governs the **ProjectionIR** — the normalized epistemic
intermediate representation emitted by projection operators and consumed by
synthesis.

### CIRS-IR-01: ProjectionIR Non-Authority Constraint

```
ProjectionIR MUST NOT be treated as:
  - a source of execution authority
  - a WorkRequest input
  - canonical state
  - a governance signal

ProjectionIR is epistemically descriptive, NOT prescriptive.
```

**Violation:** Any system that promotes ProjectionIR content directly into
a WorkRequest or canonical state commit without passing through Synthesis
and a human/Planner gate.

### CIRS-IR-02: ProjectionIR Scope Containment

```
ProjectionIR MAY ONLY exist in:
  - Operator→IR adapter output
  - IR→Synthesis input
  - Synthesis→consumer output (UI / analysis / Planner)

ProjectionIR MUST NOT appear in:
  - Conduit execution input
  - Canonical state mutations
  - PEB governance decisions
```

### CIRS-IR-03: No Epistemic Escalation from IR

```
ProjectionIR MUST NOT be used to upgrade epistemic status.
  - Observation + IR ≠ Authority
  - IR + Synthesis ≠ WorkRequest
  - IR + Time ≠ Canonical State

IR is a read-only normalization layer. It introduces no new authority.
```

### CIRS-IR-04: Operator Boundary Integrity

```
ProjectionIR MUST NOT alter the authority hierarchy of operators:
  - Operator A's IR output MUST NOT increase Operator B's authority
  - IR MUST NOT create cross-operator dependency where none existed
  - Each operator retains independent authority over its own domain
```

### CIRS-IR-05: Execution Isolation Rule

```
ProjectionIR MUST NOT appear in:
  - execution DAG construction
  - WorkRequest parameter binding
  - Conduit service input validation
  - any runtime execution path
```

### CIRS-IR-06: Epistemic-Only Synthesis Constraint

```
ProjectionIR MAY feed into Synthesis.
Synthesis output is epistemic (informational) only.

Allowed consumers of Synthesis output:
  - UI (visualization, dashboards)
  - Analysis tools
  - Planner (informational context, not WorkRequest content)

Forbidden consumers of Synthesis output:
  - WorkRequest generators (direct)
  - Execution dispatch
  - System control flow
```

### CIRS-IR-07: ProjectionIR Ephemerality

```
ProjectionIR MUST NOT be persisted as:
  - canonical state
  - a substitute for event logs
  - a durable knowledge base
  - a governance record

ProjectionIR is a transient, recompute-always artifact.
Any system that caches or persists ProjectionIR violates this rule.
```

### CIRS-IR-08: No Shadow Canonicalization

```
ProjectionIR MUST NOT become a parallel canonical system.
  - It MUST NOT accumulate state across observations
  - It MUST NOT develop its own identity model
  - It MUST NOT serve as a source of truth for any subsystem

The only source of canonical truth is the event backbone + canonical state store.
```

### CIRS-IR-09: Execution Contract Exclusivity

```
ProjectionIR:
  - MAY inform which WorkRequests to create (via Planner, via Synthesis)
  - MUST NOT directly generate WorkRequests
  - MUST NOT appear in WorkRequest payload fields
  - MUST NOT influence Conduit execution semantics

Only Observations and canonical state may directly seed WorkRequests.
```

### CIRS-IR-10: No Operator Contamination via IR

```
ProjectionIR MUST NOT cause:
  - Operator A's output to be injected into Operator B's input
  - Cross-operator feedback loops
  - Unintended operator coupling through shared IR fields

Each operator retains independent control of its projection logic.
IR is a normalized output format, not an operator interconnect.
```

### CIRS-IR-META-01: ProjectionIR Meta-Rule

```
ProjectionIR is a read-only epistemic normalization layer.
It introduces no new authority, no persistence, and no execution capability.

All IR rules (IR-01 through IR-10) derive from this meta-rule.
Any proposed extension to ProjectionIR must be validated against this meta-rule
before being evaluated for specific rule compliance.
```

---

## 6. Rule Family: CORE (Cross-Domain Separation)

The CORE rule is the foundational invariant of CIRS.

### CIRS-CORE: Synthesis-Execution Separation

```
No artifact that participates in synthesis may participate in execution.
No artifact that participates in execution may participate in synthesis.

Synthesis domain: ProjectionIR, SynthesizedView, IntentPlan, Analysis
Execution domain: WorkRequest, Conduit Execution, ExecutionTrace

The two domains communicate ONLY through:
  1. WorkRequest (Synthesis → Execution, one-way)
  2. ExecutionTrace (Execution → Audit, one-way, no influence)
```

**This is the single most important rule in CIRS.** All other rules derive
from or reinforce this separation.

---

## 7. Rule Family: AUD (Audit Non-Influence)

The AUD rule family governs how execution traces relate to epistemic artifacts.

### CIRS-AUD-01: Audit Non-Influence Principle

```
ExecutionTrace MUST NOT be used to:
  - generate ProjectionIR
  - influence Synthesis outputs
  - modify canonical state
  - alter WorkRequest generation logic
```

### CIRS-AUD-02: Audit Isolation

```
ExecutionTrace MAY ONLY be consumed for:
  - visualization (dashboards, trace viewers)
  - debugging (human-in-the-loop)
  - compliance verification (external audit)

ExecutionTrace MUST NOT be consumed by:
  - any automated decision system
  - any planning or prioritization component
  - any system that generates WorkRequests
```

### CIRS-AUD-03: No Reverse Projection Rule

```
ExecutionTrace MUST NOT be converted into ProjectionIR.

An execution trace is a record of what happened in Conduit.
It is not an observation of the external world.
It carries no epistemic standing in the Nexus plane.
```

---

## 8. Rule Family: CAUSAL (Causal Integrity)

The CAUSAL rule family governs how causal structure relates to execution.

### CIRS-CAUSAL-CORE: Causal Non-Influence

```
Causal structure may explain execution,
but may never influence future execution generation.
```

### CIRS-CAUSAL-01: Parent Requirement Rule

```
Every WorkRequest MUST trace to at least one Observation or canonical
state transition as its causal parent.

A WorkRequest with no causal parent is:
  - Not valid for execution
  - Not auditable
  - A CIRS violation
```

### CIRS-CAUSAL-02: No Causal Upstream Injection

```
CausalTraceNode MUST NOT influence:
  - WorkRequest generation
  - ProjectionIR synthesis
  - Synthesis logic
  - Planning decisions

CausalTraceNode is for audit and visualization only.
It is a record of what happened, not a signal for what should happen next.
```

---

## 9. Rule Family: VEL (Verification Execution Ledger)

The VEL rule family governs the ExecutionLedger — the durable record of
execution outcomes.

### CIRS-VEL-01: Ledger Append-Only

```
An ExecutionLedgerEntry MUST NOT be modifiable after append.
No update, no delete, no amendment.
Corrections are new entries with references to the corrected entry.
```

### CIRS-VEL-02: Ledger Non-Influence Principle

```
ExecutionLedger MUST NOT be used to:
  - generate ProjectionIR
  - modify WorkRequest generation
  - influence Synthesis outputs
  - alter planning or prioritization logic
```

### CIRS-VEL-CORE: Final Invariant

```
The ExecutionLedger is a record of what systems DID.
It is NOT an instruction for what systems SHOULD DO.
Any system that conflates these two roles violates CIRS.
```

---

## 10. Rule Family: MED (Merkle Integrity)

The MED rule family governs cryptographic hashing within PEB.

### CIRS-MED-01: Cryptographic Non-Influence Rule

```
Merkle hashes MUST NOT be used to:
  - influence WorkRequest generation
  - alter ProjectionIR
  - modify synthesis logic
  - affect planning decisions

Merkle hashes are integrity proofs, not epistemic signals.
Their only valid use is verifying that state has not been tampered with.
```

---

## 11. Rule Family: SPoE (Proof Integrity)

The SPoE rule family governs execution proofs.

### CIRS-SPoE-01: Proof Non-Influence Rule

```
ExecutionProof MUST NOT influence:
  - WorkRequest generation
  - ProjectionIR synthesis
  - planning decisions
  - system prioritization

A proof confirms that execution occurred correctly.
It does not authorize new execution or modify future execution.
```

---

## 12. Rule Family: PAL (Proof Access Layer)

The PAL rule family governs how proof queries interact with the system.

### CIRS-PAL-01: Query Non-Influence Rule

```
Proof queries MUST NOT influence:
  - WorkRequest generation
  - ProjectionIR synthesis
  - execution planning
  - system control flow

Proof queries are read-only observations of the execution record.
They carry no authority to affect ongoing or future execution.
```

---

## 13. Rule Family: CTS (Causal Type System)

The CTS rule family governs queries within the causal type system.

### CIRS-CTS-01: Query Non-Epistemic Rule

```
CausalQuery MUST NOT:
  - generate WorkRequests
  - influence ProjectionIR
  - modify execution logic

Causal queries explore the causal graph. They are analytical tools,
not control-plane signals.
```

---

## 14. Rule Family: SYN/PLN/EXE (Pipeline Stage Integrity)

These rules govern the internal integrity of each pipeline stage.

### CIRS-SYN-01: Synthesis Purity

```
Synthesis MAY combine multiple ProjectionIR streams into a SynthesizedView.
Synthesis MUST NOT:
  - generate WorkRequests
  - mutate canonical state
  - emit execution commands
  - create new observations

Synthesis output is informational. It informs human or Planner decisions.
```

### CIRS-PLN-01: Plan Must Be IR-Free

```
An IntentPlan MUST NOT contain ProjectionIR artifacts.

A plan may reference:
  - Observations
  - Canonical state transitions
  - WorkRequest templates

A plan may NOT reference:
  - ProjectionIR entries (they are ephemeral and non-authoritative)
  - SynthesizedView content (unless converted to canonical form)
```

### CIRS-EXE-01: Execution Purity

```
Execution MUST NOT:
  - read ProjectionIR
  - generate new Observations
  - modify its own WorkRequest
  - create feedback into synthesis

Execution receives a WorkRequest, executes it, records the trace, and stops.
```

---

## 15. Rule Family: BOOT (Bootstrap Integrity)

The BOOT rule family governs system initialization.

### CIRS-BOOT-01: Bootstrap Authority

```
During bootstrap, CIRS rules are loaded before any execution pathway is opened.
No WorkRequest may be processed until CIRS enforcement is active.
Bootstrap sequence:
  1. Load CIRS rule definitions
  2. Initialize CIRS enforcement gate
  3. Open execution pathways
```

### CIRS-BOOT-02: No Self-Modifying Bootstrap Rule

```
CIRS rules MUST NOT be modifiable by any runtime component.
CIRS rules are loaded from a trusted source (file system / sealed config).
Any system that attempts to modify CIRS rules at runtime is a CIRS violation.
Rule updates require a system restart (controlled, audited).
```

---

## 16. The Three Hard CIRS Boundaries

CIRS defines three hard boundaries that no artifact may cross without
explicit, validated transition:

### Boundary 1: Observation → Operator

```
What crosses: Raw events
Validation: Factual intake only (CIRS: OBS-01)
Forbidden: Interpretation, classification, prioritization at ingestion
```

### Boundary 2: Synthesis → WorkRequest

```
What crosses: Intent (from Planner), not ProjectionIR
Validation: WorkRequest must cite Observations/state transitions, not IR
  (CIRS-IR-01, CIRS-IR-09)
Forbidden: Direct IR→WR path, IR as WorkRequest payload
```

### Boundary 3: WorkRequest → Conduit Execution

```
What crosses: WorkRequest DTO (generated, minimal)
Validation: CIRS-IR-05 (no IR), CIRS-IR-09 (WR exclusivity)
Forbidden: ProjectionIR, SynthesizedView, analysis artifacts
```

---

## 17. CIRS as Epistemic Type System

CIRS is not merely a set of rules — it is a **type system for epistemic
states**. This means:

### Static Detectability

CIRS violations should be detectable **without running the system**.
If a transition is CIRS-invalid, it should be **unrepresentable** in the
type system — not caught at runtime.

### Type Transitions

```
Obs      → Observation (raw fact, immutable)
Proj[d]  → Projection in domain d
IR       → ProjectionIR (normalized epistemic form)
Syn      → SynthesizedView (non-authoritative aggregates)
Plan     → IntentPlan (non-executable)
WR       → WorkRequest (executable contract)
Exe      → Execution (Conduit runtime)
```

Each arrow represents a valid CIRS transition. Any transition not in this
chain is invalid.

### Category-Theoretic Interpretation

In the limit, CIRS defines a category where:
- **Objects** are epistemic states (Obs, Proj, IR, Syn, Plan, WR, Exe)
- **Morphisms** are valid transitions between states
- **Composition** is the pipeline: Obs→Proj→IR→Syn→Plan→WR→Exe
- **Invalid transitions** are not morphisms — they cannot be expressed

```
validity = composition correctness
not runtime validation
```

---

## 18. CIRS-Safe Event Flow

Below is the minimal event flow guaranteed to be CIRS-safe:

```
(1) OBSERVATION
    │
    │  CIRS: OBS-01 (factual intake only)
    ▼
[ Observer ]
    │
    │ emits immutable event
    │ (no interpretation allowed)
    ▼
[ Event Log ]
    │
    │ CIRS: EVT-01 (append-only, no enrichment)
    ▼
────────────────────────────────────────────
        OPERATOR DOMAIN (parallel lenses)
────────────────────────────────────────────

    │
    ├──► [ Atten Operator ]
    │       │
    │       │ CIRS: PROJ-01 (domain-bound, no cross-operator)
    │       ▼
    │    AttenProjection → ProjectionIR adapter
    │
    ├──► [ Search Operator ]
    │       │
    │       │ CIRS: PROJ-01
    │       ▼
    │    SearchResult → ProjectionIR adapter
    │
    ├──► [ Nebula Operator ]
    │       │
    │       │ CIRS: PROJ-01
    │       ▼
    │    NebulaProjection → ProjectionIR adapter
    │
    └──► [ Throttler Operator ]
            │
            │ CIRS: PROJ-01
            ▼
         ThrottlerScope → ProjectionIR adapter

    ▼
────────────────────────────────────────────
        SYNTHESIS DOMAIN (read-only)
────────────────────────────────────────────

[ ProjectionIR Stream ]
    │
    │ CIRS: IR-07 (ephemeral), IR-01 (no authority)
    ▼
[ Synthesis Layer ]
    │
    │ CIRS: SYN-01 (informational only)
    ▼
SynthesizedView
    │
    ├──► UI (visualization)
    ├──► Planner (context, not payload)
    └──► Analysis tools

    ▼
────────────────────────────────────────────
        EXECUTION DOMAIN (Conduit boundary)
────────────────────────────────────────────

[ WorkRequest ]  ← ONLY valid crossing point
    │
    │ CIRS: IR-09 (WR exclusivity)
    │ CIRS: CORE (synthesis→execution separation)
    ▼
[ Conduit Gateway ]
    │
    ▼
[ Conduit Execution ]
    │
    ▼
[ ExecutionTrace ]  ← Audit only, no feedback
```

---

## 19. Enforcement Model

CIRS enforcement follows a layered model:

### Layer 1: Type System (Compile/Design Time)

The strongest enforcement. Transitions that violate CIRS cannot be expressed
in the type system. Examples:
- `ProjectionIR → WorkRequest` is not a valid function signature
- `ExecutionTrace → Synthesis` is not a valid data flow

### Layer 2: Static Analysis (Build Time)

Validates that code does not construct invalid transitions.
- Check that no operator reads another operator's ProjectionIR
- Check that no Synthesis component writes to Conduit
- Check that no Execution component reads ProjectionIR

### Layer 3: Hard Gate (Runtime)

A Spring Filter or equivalent that rejects invalid transitions at the
system boundary. For example:
- The Conduit gateway rejects any request containing ProjectionIR fields
- The Synthesis layer rejects any request to emit a WorkRequest directly

### Layer 4: Audit Monitoring (Post-Execution)

Detects violations that escaped earlier layers. These are treated as
system failures requiring human investigation.

**Design principle:** Earlier layers (1 and 2) should catch >99% of
potential violations. Layer 3 is a safety net. Layer 4 is forensic.

---

## 20. Relationship to Other Specs

| Spec | Relationship |
|------|-------------|
| `graph/schema/projection-algebra.md` | CIRS provides the enforcement boundary for the 6 projection operators. The algebra defines valid transformations; CIRS defines which transformations may interact. |
| `graph/atten-spec.md` | CIRS-IR rules govern how AttenProjections enter ProjectionIR. CIRS-CORE ensures Atten (epistemic) never touches Conduit (execution). |
| `graph/peb-mcp-spec.md` | CIRS-MED governs Merkle hash use. CIRS-SPoE governs proof integrity. CIRS-CORE ensures PEB governance does not leak into execution. |
| `graph/schema/node-types.md` _(planned)_ | CIRS type universe (Obs/Proj/IR/Syn/Plan/WR/Exe) should map to concrete node types. |
| `nexus/.conduit-data/ANALYSIS/operator-plane-gap-analysis.md` | CIRS closes the "missing enforcement boundary" gaps identified in the operator plane analysis. |
| `nexus/ANALYSIS.md` | Section 28 covers the Self-audit transcript from which CIRS was extracted. |

---

*End of CIRS v0.1 — 30+ rules across 10 families, 4 axioms, 3 hard boundaries,
4 enforcement layers.*
