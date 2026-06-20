> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

# Atten — Multi-State Projection Generator

## Related Specifications

| Document | Relationship |
|---|---|
| [`ANALYSIS/atten-is-not-a-brain.md`](./ANALYSIS/atten-is-not-a-brain.md) | Critical analysis — Atten is a projection engine, not a cognitive brain |
| [`peb-mcp-spec.md`](./peb-mcp-spec.md) | PEB — validates committed canonical state transitions, not Atten's candidate projections |
| [`cognitive-integrity-rule-system.md`](./cognitive-integrity-rule-system.md) | CIRS — enforces constraints on Atten's projections |
| [`ANALYSIS.md`](./ANALYSIS.md) | System analysis — references Atten's position in the architecture |
| [`ANALYSIS/operator-plane-gap-analysis.md`](./ANALYSIS/operator-plane-gap-analysis.md) | Gap analysis — Atten's role in the operator plane |

**Version:** 0.1 (Draft)
**Status:** Conceptual — no code, schema, or implementation exists.
**Architectural correction applied:** v1 corrects prior framing of Atten as a "cognitive layer" or "knowledge substrate."

> **⚠️ v0.2 scope correction appended to §11.** The initial v0.1 spec correctly
> identified what Atten IS (multi-state projection generator) but inadvertently
> positioned Atten as the *reference projection system* that other projection
> mechanisms "are examples of." This is incorrect. Atten is one projection
> operator in a broader **Projection Algebra** that also includes Throttler
> (filesystem scope), Nebula (knowledge), Search (query), and others. See
> **`schema/projection-algebra.md`** (sibling spec, in `graph/schema/`) for the
> unified family definition, and Appendix A in this document for the corrected
> framing. The body of this spec (sections 1–10) remains structurally sound as
> the definition of Atten's specific role within that algebra.

---

## 1. Identity

### What Atten IS

Atten is a **multi-state projection generator.** It is an architectural layer
that reads canonical state and emits zero, one, or many *candidate projections*
of possible future or derived states.

Each projection is:
- A **hypothetical** — what *might* be true, what *could* happen next
- **Uncommitted** — it carries no authority to change state
- **Potentially conflicting** — two projections may disagree
- **Independent** — each projection is self-contained and traceable to its inputs

### What Atten IS NOT

| Misconception | Correction |
|---|---|
| Atten is a brain / cognitive layer | **False.** Atten has no agency, no goals, no understanding. It generates projections mechanically. |
| Atten is a deterministic reducer | **False.** A reducer folds state+event→state (one input, one output). Atten may emit many projections from one input, including contradictory ones. |
| Atten is the "knowledge substrate" | **False.** That conflates the *process* (projection) with the *product* (canonical state). Atten generates candidates; canonical state is produced by the commit layer downstream. |
| Atten decides what to do | **False.** Atten does not choose, commit, prioritize, or resolve conflicts. It emits possibilities. Decision-making lies downstream. |
| Atten owns understanding | **Misleading.** Atten *projects* structure onto state. Understanding is an emergent property of the *resolution* of multiple projections, not of any single projection. |

### Core Distinction

```
Observer owns records.     → factual, immutable, append-only
Atten generates projections. → hypothetical, multiple, uncommitted
Commit layer owns state.   → resolved, committed, canonical
```

---

## 2. Position in Architecture

```
Observations (interpretive evidence)
       ↓
  Event Log (durable, append-only, factual)
       ↓
  [Canonical State Store] ←─────────────────────┐
       ↓                                         │
  Atten (reads canonical state, emits           │
         candidate projections)                   │
       ↓                                         │
  Canonicalizer / Commit Layer                    │
  (resolves projections, selects, commits) ──────┘
       ↓
  Committed Canonical State
       ↓                           ┌─────────────────┐
  Consumed by:                     │ Systems that     │
  ├─ Vision (interpretation)       │ read but never   │
  ├─ Planner (WorkRequest gen)     │ write canonical  │
  ├─ Graph pipeline nodes          │ state directly   │
  ├─ Analyst (priority generation) │                  │
  └─ PEB (governance)              └─────────────────┘
```

### Clean Layering (Pipeline)

```
Atten → [Canonicalizer] → Canonical State → Plan → WorkRequest → Execution
```

### Constraint Layer Position

From the four-layer constraint model (section 13 of ANALYSIS.md):

| Layer | Role | Is Atten? |
|-------|------|-----------|
| RCL (Reality Constraint) | Defines what is physically possible | No |
| MIGL (Intent Governance) | Defines what is allowed to be desired | No |
| **Atten** | **Generates candidate projections of what is actively enforceable** | **Yes — but only as generator, not enforcer** |
| Contracts | Define what is actually happening | No |

**Correction to prior framing:** Atten does not *enforce* cognitive priority.
It *generates candidate projections of what enforcement could look like.*
The enforcement (commit/decide/reject) is the Canonicalizer's responsibility.

---

## 3. Inputs

Atten reads from exactly one source: **canonical state** (not raw events directly).

| Input | Source | Description |
|-------|--------|-------------|
| Canonical state snapshot | Canonical State Store | The current committed state of the system |
| Event cursor position | Canonical State metadata | Where in the event log this state snapshot reaches |
| Context window | Pipeline config | Scope boundaries — what domain, subsystem, or time horizon to project over |
| Rule set | PEB / invariant definitions | Constraints that projections must not violate (applied during generation, not after) |

Atten **does not** read the raw event log directly. It reads committed
canonical state that incorporates events up to a known cursor. The events
themselves are factual records; Atten projects over what the facts *mean*
for future or derived state.

---

## 4. Outputs: Projection Envelope

Each projection is a self-contained, traceable, uncommitted candidate.

### Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AttenProjection",
  "description": "A single candidate projection emitted by Atten. Uncommitted — carries no authority.",
  "required": [
    "projection_id", "timestamp", "type", "input_state_hash",
    "source", "candidate", "confidence"
  ],
  "properties": {
    "projection_id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique identifier for this projection"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "When the projection was generated (ISO 8601)"
    },
    "type": {
      "type": "string",
      "enum": [
        "state_transition",
        "inference",
        "classification",
        "relationship",
        "priority_ordering",
        "anomaly",
        "unknown"
      ],
      "description": "What kind of projection this is"
    },
    "input_state_hash": {
      "type": "string",
      "description": "Hash of the canonical state snapshot this projection was generated from"
    },
    "source": {
      "type": "string",
      "description": "Identity of the Atten consumer group / projection generator that produced this (e.g. 'atten::incident.classifier', 'atten::relation.discovery')"
    },
    "context": {
      "type": "object",
      "description": "Trigger context — what event, observation, or schedule caused this projection",
      "properties": {
        "trigger_event_id": { "type": "string" },
        "trigger_observation_id": { "type": "string" },
        "trigger_type": { "type": "string", "enum": ["event", "observation", "schedule", "manual"] }
      }
    },
    "candidate": {
      "type": "object",
      "description": "The projected content — what is being proposed. Schema varies by type.",
      "properties": {
        "description": { "type": "string", "description": "Human-readable summary of the projection" },
        "delta": { "type": "object", "description": "The proposed state delta (if type=state_transition)" },
        "assertion": { "type": "object", "description": "The proposed belief (if type=inference/classification)" },
        "edges": { "type": "array", "description": "Proposed relationships (if type=relationship)" },
        "ordering": { "type": "array", "description": "Proposed priority order (if type=priority_ordering)" }
      }
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "How confident this projection generator is in this candidate"
    },
    "alternatives": {
      "type": "array",
      "items": { "$ref": "#" },
      "description": "Explicit alternatives that were considered and rejected by this generator (for traceability)"
    },
    "trace": {
      "type": "object",
      "description": "Provenance — how this projection was derived",
      "properties": {
        "rules_applied": { "type": "array", "items": { "type": "string" } },
        "reasoning_path": { "type": "array" },
        "parent_projection_id": { "type": "string" }
      }
    },
    "conflict_group": {
      "type": "string",
      "description": "If this projection is known to conflict with others, they share a conflict group id"
    }
  }
}
```

### Projection Types (Detailed)

| Type | Description | Example |
|------|-------------|---------|
| `state_transition` | Proposes moving from current state to a specific next state | "Incident INC-003 should transition from triage→investigating" |
| `inference` | Proposes a belief that is not directly observable from state | "The spike in 5xx errors correlates with the deploy at 14:32" |
| `classification` | Assigns an entity to a category | "This observation is an Incident, not a Question" |
| `relationship` | Proposes a link between two entities | "Plan #0119 depends on Plan #0075" |
| `priority_ordering` | Proposes a ranking among competing intents | "Bug fixes ahead of features in this sprint" |
| `anomaly` | Flags that current state or recent events deviate from expected patterns | "Error rate exceeds 3-sigma threshold" |

---

## 5. Mechanics

### Generation Model

Atten operates as a set of **parallel, independent projection generators**
(formerly called "consumer groups" in the event backbone model). Each generator:

1. Receives a **canonical state snapshot** (or a permitted view of it)
2. Applies its **projection function** — a deterministic or probabilistic transform
   - May use inference (LLM), rules (deterministic), or hybrid strategies
3. Emits **zero, one, or many candidate projections**
4. Each projection is recorded **immutably** in a projection buffer

### Key Properties

- **Generators are stateless** — they hold no state between cycles. All state
  is in the canonical store.
- **Generators are independent** — no coordination between them during
  generation. Coordination happens during resolution.
- **Generators may conflict** — this is a feature, not a bug. The Canonicalizer
  is designed for conflict resolution.
- **Generators have bounded scope** — each generator projects over a specific
  domain slice. No generator sees everything.
- **Generation is async** — generators run concurrently, not in a fixed sequence.

### Example Generators

| Generator ID | Projects Over | Produces |
|-------------|---------------|----------|
| `atten::incident.classifier` | New observations | Classification projections |
| `atten::relation.discovery` | Entity graph | Relationship projections |
| `atten::priority.router` | Intent queue | Priority ordering projections |
| `atten::anomaly.detector` | Metric timeseries | Anomaly projections |
| `atten::state.transitioner` | Workflow state machines | State transition projections |

---

## 6. Non-Goals (Explicitly NOT Atten)

| Non-Goal | Owned By |
|----------|----------|
| Committing state | Canonicalizer / Commit Layer |
| Resolving conflicts between projections | Canonicalizer / Commit Layer |
| Deciding which projection is "correct" | Canonicalizer / Commit Layer (or human operator) |
| Enforcing invariants | PEB + Canonicalizer (pre-commit gate) |
| Interpreting projections downstream | Vision, Planner, Analyst |
| Storing committed state | Canonical State Store |
| Recording factual events | Observer + Event Log |
| Executing work | Conduit / Temporal |

---

## 7. Canonicalizer / Commit Layer (Downstream Gap)

**This layer does not exist yet.** It is the architectural gap identified
during the Atten spec correction. It must be designed and implemented before
Atten's projections become actionable.

### Required Responsibilities

1. **Collect** projections from all Atten generators for a cycle
2. **Classify** projections by conflict group
3. **Resolve** conflicts:
   - Merge compatible projections
   - Select among conflicting projections (by confidence, priority, or rule)
   - Reject projections that violate invariants (consult PEB)
   - Escalate irreconcilable conflicts to human operator
4. **Validate** selected projection against PEB invariants and RCL constraints
5. **Commit** the resolved state delta to Canonical State Store
6. **Record** the resolution: which projections were accepted, rejected, merged,
   and why
7. **Emit** a commitment event to the Event Log for auditability

### Contract Between Atten and Canonicalizer

```
Atten emits:       ProjectionEnvelope[] (unordered, possibly conflicting)
Canonicalizer produces: CommitmentReceipt {
  accepted: ProjectionId[],      // projections that survived resolution
  rejected: ProjectionId[],      // with rejection reason
  merged:   ProjectionId[][],    // groups of projections merged together
  state_delta: StateDelta,       // what actually changed
  new_state_hash: string,        // post-commit canonical state hash
  invariants_checked: RuleId[],  // which invariants were validated
  trace: Trace                   // full provenance
}
```

---

## 8. Invariants

The following invariants apply to Atten and its interface with the Canonicalizer.

### I1 — No State Mutation

Atten MUST NOT write to canonical state. It generates projections only. Any
attempt by an Atten generator to perform a state mutation is a critical
violation.

### I2 — No Agency

Atten MUST NOT decide, select, prioritize, or reject projections internally.
These are the Canonicalizer's responsibilities. Atten's role ends when it
emits a projection envelope.

### I3 — Traceability

Every projection MUST be traceable to:
- The canonical state snapshot it was generated from (via `input_state_hash`)
- The generator that produced it (via `source`)
- The trigger that caused it (via `context`)

### I4 — Projection Independence

No Atten generator may depend on the output of another generator within the
same cycle. All generators read from the same canonical state snapshot and
produce independent projections. Cross-generator coordination is forbidden.

### I5 — Bounded View

Each generator has a defined **scope** — a subset of canonical state it is
permitted to read. No generator sees the full state. This prevents a single
generator from dominating the projection space.

### I6 — No Recursive Projection

Atten generators must not project over their own prior projections. They
project over canonical state only. Projections are consumed by the
Canonicalizer, not by other Atten generators.

### I7 — Generators Are Pure

For the same canonical state snapshot and the same trigger, an Atten generator
must produce the same projection set (deterministic generators) or document
the distribution (probabilistic generators MUST include confidence and
alternatives in the trace).

---

## 9. Relationship to Other Systems

| System | Relationship to Atten |
|--------|----------------------|
| **Observer** | Produces observations that eventually become canonical state. Atten projects over committed state, not raw observations. |
| **Event Log** | Source of factual records. Atten does NOT read the Event Log directly — it reads canonical state that incorporates events. |
| **Canonical State Store** | The state that Atten reads and the Canonicalizer writes. Atten and the Store are separate — never conflate the projection process with the committed state. |
| **Canonicalizer / Commit Layer** | Downstream consumer of Atten's projections. Does the work Atten cannot: decide, resolve, commit. (⚠️ **Not yet designed/implemented.**) |
| **Vision** | Consumes committed canonical state (post-commit) and interprets it. Vision is downstream of the Canonicalizer. |
| **Planner** | Consumes committed canonical state to produce Plans. Atten's projections inform what *could* be planned, but the Planner reads committed state, not raw projections. |
| **PEB** | Provides rule sets and invariants that constrain both Atten (during projection generation) and the Canonicalizer (during conflict resolution). |
| **RCL** | Reality Constraint Layer — the outermost constraint boundary. Both Atten and the Canonicalizer must respect RCL constraints. A projection that violates physical reality should be rejected by the Canonicalizer. |
| **Graph pipeline** | The capability graph nodes read canonical state (post-commit). Atten feeds into the graph indirectly through the Canonicalizer. |
| **Analyst** | Reads canonical state and writes triage suggestions. Independent of Atten. |

---

## 10. Current Status

| Aspect | Status |
|--------|--------|
| **Spec** | ✅ Written (this document) |
| **Schema** | Defined above — no schema file yet |
| **Code** | ❌ None exists anywhere |
| **Tests** | ❌ None |
| **Generators** | ❌ None implemented |
| **Canonicalizer** | ❌ Not designed (arch gap) |
| **Canonical State Store** | ❌ Not designed |
| **Integration** | ❌ Not wired into any pipeline |

### Implementation Order (Recommended)

1. **Canonical State Store** — design and implement the store first. Atten
   needs something to read and the Canonicalizer needs somewhere to write.
2. **Canonicalizer / Commit Layer** — design the conflict resolution and
   commitment logic. This is the harder architectural problem.
3. **Atten generators** — implement generators one at a time, each with
   defined scope, starting with the simplest (e.g., `atten::priority.router`
   which just orders a queue by simple rules).
4. **Integration** — wire into the pipeline after the Event Log and before
   the Planner.

---

## 11. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1 | 2026-06-15 | Initial spec — corrects prior framing of Atten as brain/cognitive layer/knowledge substrate. Defines Atten as multi-state projection generator and identifies the missing Canonicalizer/Commit layer. |
| 0.2 | 2026-06-15 | Added scope correction: Atten is one projection operator in a multi-operator Projection Algebra. Appended Appendix A. Created sibling spec `schema/projection-algebra.md`. Relocated from `.agent/docs/` to `graph/`. |
| 0.3 | 2026-06-15 | Added Appendix B (XIL semantic firewall boundary) identifying XIL as the upstream input boundary for all canonical state. |

---

## Appendix A: Projection Algebra Context

> **Deprecation notice:** This appendix corrects a structural error in v0.1.
> The body of this spec (sections 1–10) remains correct as the definition of
> Atten's specific mechanics. What was incorrect was the implicit framing of
> Atten as the archetypal projection system that other mechanisms "are examples
> of." The following replaces that framing.

### A.1 What Changed

v0.1 described Throttler's magnet mechanism as "a concrete example of the kind
of state projection that Atten would generate." This is **structurally wrong**
in a subtle but important way. It treats:

- **Atten** = the general case / archetype
- **Throttler** = a specific instance / example

This creates an implicit hierarchy where Atten is the reference point for all
projection behavior. The correct framing is:

- **Projection Algebra** = the family (defined in `schema/projection-algebra.md`)
- **Atten** = one member, projecting over canonical state (semantic domain)
- **Throttler** = another member, projecting over filesystem scope (physical domain)
- **Nebula** = another member, projecting over knowledge graphs (ontological domain)
- **Search** = another member, projecting over query results (epistemic domain)
- **WorkRequest** = another member, projecting intent onto execution (operational domain)

Atten and Throttler are **siblings**, not parent and child. Neither is the
"reference" for the family.

### A.2 Why This Matters

Without this correction, the architecture drifts back toward:

1. **Atten-centrism** — every projection mechanism gets described "in terms of"
   Atten, creating an accidental hub
2. **Hidden hierarchy** — Throttler becomes "a simpler Atten" rather than
   "a different projection operator at a different layer"
3. **Single-point cognitive collapse** — the same pattern the v0.1 correction
   removed from the cognitive layer framing gets reintroduced at the projection
   layer framing

### A.3 Atten's Actual Role in the Algebra

Atten is the projection operator that:

- **Reads from:** canonical state (committed, post-resolution)
- **Emits:** candidate projections of possible future or derived states
- **Domain:** semantic — what events *mean* for future state
- **Outputs to:** the Canonicalizer, alongside projections from other operators
- **Not:** the sole or primary projection mechanism in the system

### A.4 References

- **`schema/projection-algebra.md`** — defines the unified projection family
- **`../.conduit-data/ANALYSIS/operator-plane-gap-analysis.md` Appendix A.7** — corrected Throttler framing
- **`schema/projection-algebra.md` §3** — full comparison matrix of all projection operators

---

## Appendix B: XIL — External Intelligence Layer as Input Boundary

> **Notice:** This appendix is additive. It identifies **XIL (External
> Intelligence Layer)** as the upstream input boundary that processes external
> signals before they become canonical state that Atten reads. The body of this
> spec (sections 1–10) remains structurally sound.

### B.1 Relationship Between XIL and Atten

Atten reads from **canonical state** — committed, post-resolution state that
has already been processed through the system's internal pipelines. XIL sits
*upstream* of canonical state:

```
External Signal
    ↓
XIL Parsing (Signal → Event candidate)
    ↓
XIL Projection (Event → system-compatible form)
    ↓
XIL Validation / Quarantine
    ↓
Event Log (factual, durable)
    ↓
[Canonical State Store] ←────────────────────────┐
    ↓                                              │
Atten (reads canonical state, emits candidates)    │
    ↓                                              │
Canonicalizer / Commit Layer ──────────────────────┘
    ↓
Committed Canonical State
```

**Key insight:** Atten never sees raw external signals. By the time state
reaches Atten's read domain, it has been:
1. Parsed from a signal into an event candidate
2. Projected into system-compatible types
3. Validated against TTS/STOA/CGEL boundaries
4. Either committed to the event log or quarantined

### B.2 XIL's Quarantine Mechanism

XIL does not reject non-projectable inputs — it **quarantines** them:

- Malformed inputs are preserved in isolation, not discarded
- The quarantine buffer is observable — Atten generators can project over it
  (e.g., "quarantine growth rate exceeds threshold → projection rules may need
  updating")
- This prevents hard failure from unrecognized external input

### B.3 Implications for Atten Generators

Because XIL normalizes all external input before it reaches canonical state:

1. **Atten generators have a clean input domain** — they never handle raw,
   unvalidated external signals
2. **Atten's invariants do not need external-input validation** — that is XIL's
   responsibility (I1, I5, I7 remain unchanged)
3. **Quarantine events are Atten input** — the quarantine buffer's state is
   part of canonical state and can trigger Atten projections

### B.4 Atten's Position in the Broader Flow

| Layer | Responsibility | Interacts with Atten? |
|-------|---------------|----------------------|
| **XIL** | External input normalization + quarantine | Upstream — feeds the event log that becomes canonical state |
| **Event Log** | Durable append-only factual record | Atten reads canonical state *derived from* events, not raw events |
| **Canonical State Store** | Committed, resolved state | **Yes** — Atten's sole input source |
| **Atten** | Generate candidate projections | — |
| **Canonicalizer** | Resolve, select, commit projections | **Yes** — Atten's output consumer |
| **PEB** | Invariant enforcement | Constrains both Atten (during generation) and Canonicalizer (during resolution) |

### B.5 Reference

- Transcript: `dev/chats/Buzzwords by Layer.html` — full XIL definition
- `schema/projection-algebra.md` Appendix B — XIL mapping to the full operator family
- This spec §3 — Atten reads from canonical state only
