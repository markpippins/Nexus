# Conduit → WRP Bridge: Projection Contract v0.1

**Status:** Active
**Spec Version:** 0.1
**Date:** 2026-06-27
**Supersedes:** Inline bridge assumptions in `WRP_PROTOCOL.md` §7
**Plan Reference:** #0174

---

## 1. Purpose & Scope

This specification defines a **deterministic projection system** that
reconstructs WRP (WorkRequest Protocol) state from Conduit receipt streams.
It formalizes the bridge between Conduit's event-time pipeline and WRP's
semantic intent states, materialized through Nebula's stratified knowledge
graph.

The bridge has three layers:

| Layer | Name | Responsibility |
|-------|------|----------------|
| **L1** | Projection Pipeline | Sort receipts → fold state machine → emit documents |
| **L2** | Level Assigner | Classify content into L1–L4 abstraction levels |
| **L3** | Cross-Reference Generator | Derive inter-plan relationships from state transitions |

### Canonical Artifacts

| Artifact | Location | Format |
|----------|----------|--------|
| TypeScript Contract | `nebula-mcp/src/conduit-wrp-contract.ts` | TypeScript interfaces |
| Python Reducer | `python/absorb/html/conduit_wrp_reducer.py` | Python dataclass + builder |
| SQL Projection Seed | `nebula-srv/migrations/seed-conduit-wrp-bridge.sql` | PostgreSQL/Nebula |

### References

- WRP Protocol: `audit/SPECS/WRP_PROTOCOL.md`
- Stratification Ontology: `audit/SPECS/STRATIFICATION.md`, `schemas/core/stratification-ontology.json`
- WorkRequest Schema: `schemas/wrp/work-request.schema.json`
- WRP State Machine: `schemas/wrp/wrp-state-machine.json`
- Conduit Receipts: `typescript/conduit-mcp/src/receipts.ts`
- Conduit DB Schema: `typescript/conduit-mcp/src/db.ts`
- SemanticProjectionBuilder: `python/absorb/html/semantic_projection.py`
- Nebula Projections: `typescript/nebula-srv/migrations/seed-projections-crossrefs.sql`

---

## 2. Core Invariants

### I1 — Receipt Authority Principle

> No WRP state is persisted as authoritative state. All WRP state is
> **derived** from the Conduit receipt stream. Receipts are the ground
> truth. Every WRP document, chunk, and cross-reference is a deterministic
> function of the receipt stream.

Rationale: Eliminates dual-write risk between Conduit and WRP state machines.
Receipts are the single source of truth for plan lifecycle.

### I2 — Projection Non-Authority Principle

> A projection may be deleted and reconstructed at any time without loss
> of information or consistency. Projections are **cached interpretations**,
> not authoritative state.

Rationale: Enables safe recomputation on schema changes, ordering fixes, or
stratification reclassification. No data is stored exclusively in a projection.

### I3 — Determinism Invariant

> Given identical receipt streams (same receipts, same ordering), the
> projection output MUST be identical byte-for-byte. All projection
> functions are pure: no external lookups, no random values, no time-based
> branching.

Rationale: Enables replay debugging, audit reproducibility, and parallel
computation. A projection that depends on wall-clock time or external state
is a bug.

### I4 — Ordering Determinism

> Receipt ordering is the single critical variable for projection stability.
> The canonical ordering function MUST be applied before any state
> reduction, and MUST produce a unique total order per plan.

Rationale: Without locked ordering, WRP mapping drifts under concurrency
(PLAN_CREATE arriving after IMPLEMENTATION becomes ambiguous; REVIEW_PASS
may "float" incorrectly in reconstruction).

---

## 3. Canonical Ordering Function

### 3.1 Sort Key

Receipts within a plan stream are canonically ordered by:

```
ORDER BY sequence ASC, created_at ASC, receipt_id ASC
```

| Field | Source | Type | Purpose |
|-------|--------|------|---------|
| `sequence` | `vision.receipts.sequence` | Integer (0-based) | Explicit insertion order guard |
| `created_at` | `vision.receipts.created_at` | ISO 8601 | Natural temporal order |
| `receipt_id` | `vision.receipts.id` | UUID | Tiebreaker for same-timestamp receipts |

### 3.2 Sequence Contract

- Every receipt in a plan stream carries a `sequence` number assigned at
  insert time.
- Sequence numbers are monotonically increasing per plan_id.
- No two receipts for the same plan_id share a sequence number.
- Sequence 0 is the first receipt (typically PLAN_CREATE or PROPOSED).
- Sequence gaps are not permitted (insert-level enforcement).

### 3.3 Rationale

> *"PLAN_CREATE arriving after IMPLEMENTATION becomes ambiguous. REVIEW_PASS
> might 'float' incorrectly in reconstruction. This is the single biggest
> thing that will bite your bridge."*

The sequence field provides an explicit insertion-order guard that prevents
clock skew, retry semantics, or concurrent writes from producing ambiguous
state reconstructions.

---

## 4. Receipt → State Transition Map

### 4.1 Conduit Receipt Types

The following 15 receipt types are defined in the Conduit state machine
(source: `conduit-mcp/src/receipts.ts`):

| Receipt Type | Category | Agent Role |
|--------------|----------|------------|
| `PROPOSED` | Init | planner |
| `PLANNING` | Init | planner |
| `PLAN_CREATE` | Init | planner |
| `IMPLEMENTATION` | Execution | builder |
| `REVIEW` | Gate | reviewer |
| `REVIEW_PASS` | Terminal | reviewer |
| `REVIEW_REJECT` | Gate | reviewer |
| `CRITIQUE` | Gate | critic |
| `CRITIQUE_PASS` | Gate | critic |
| `CRITIQUE_REJECT` | Gate | critic |
| `BLOCK` | Exception | any |
| `PLAN_BLOCK` | Exception | planner |
| `API_LIMIT` | Exception | watchdog |
| `REQUEUED` | Recovery | watchdog |
| `CANCELLED` | Terminal | any |
| `ABANDONED` | Terminal | any |

### 4.2 WRP Protocol States

The 11 WRP states are defined in `schemas/wrp/wrp-state-machine.json`:

| State | Category | Description |
|-------|----------|-------------|
| `CREATED` | Initial | WorkRequest created but not ingested |
| `INTAKE` | Active | Being validated, parsed, assigned |
| `PLANNING` | Active | Decomposition strategy being defined |
| `CRITIQUE` | Active | Plan being reviewed for feasibility |
| `SPECIFICATION` | Active | Detailed specification being produced |
| `APPROVED` | Gate | Formally approved for execution |
| `QUEUED` | Active | Waiting for available executor |
| `EXECUTING` | Active | Actively being executed by agent |
| `COMPLETED` | Terminal | Successfully completed |
| `ARCHIVED` | Terminal | Archived, read-only |
| `FAILED` | Terminal | Failed (may retry via new version) |

### 4.3 Mapping Function: `ReceiptToState(t: ReceiptType) → WRPState`

```
PROPOSED        → CREATED
PLANNING        → INTAKE
PLAN_CREATE     → PLANNING
CRITIQUE        → CRITIQUE
CRITIQUE_PASS   → SPECIFICATION
CRITIQUE_REJECT → PLANNING
IMPLEMENTATION  → EXECUTING
REVIEW          → APPROVED
REVIEW_PASS     → COMPLETED
REVIEW_REJECT   → EXECUTING
BLOCK           → FAILED
PLAN_BLOCK      → FAILED
API_LIMIT       → FAILED
REQUEUED        → QUEUED
CANCELLED       → ARCHIVED
ABANDONED       → FAILED
```

### 4.4 State Reduction Algorithm

```
current_state := CREATED
for each receipt in sorted_receipts:
    candidate := ReceiptToState(receipt.type)
    if is_valid_transition(current_state, candidate, adjacency_matrix):
        current_state = candidate
    // Invalid transitions are skipped with audit log entry
    // (logical convergence — the state machine absorbs ambiguity silently)
return current_state
```

Convergence behavior: The reducer accepts the transition if it is valid
per the WRP adjacency matrix. Invalid transitions are silently skipped —
the state machine is designed to converge on the latest valid state rather
than error on out-of-order or unexpected receipts.

---

## 5. Projection Function Contract

### 5.1 Pure Reducer Shape

```
WRPProjection reduce(ConduitReceipt[] receipts) → WRPProjection
```

Where:
- **Input** is an ordered list of Conduit receipts (canonically sorted)
- **Output** is an immutable `WRPProjection` value object
- **Side effects**: None
- **External dependencies**: None (no DB, no filesystem, no time calls)

### 5.2 Output Structure

```typescript
interface WRPProjection {
  // Core state
  wrpState: WRPState;                     // Final resolved state
  stateHistory: WRPEvent[];               // Full state derivation trace
  appliedReceiptIds: string[];            // Receipts that contributed to state

  // Derived content
  documents: WRPBridgeDocument[];         // Stratified projection documents
  crossReferences: CrossReference[];      // Cross-plan relationships

  // Stratification
  abstractionLevel: L1|L2|L3|L4;         // Derived level
  visibilityScope: string;                // Default scope for this plan
}
```

### 5.3 Determinism Guarantee

```
Projection run is idempotent iff:
  run(same_receipts) == run(same_receipts)

Under partial input:
  missing_receipts → partial projection (subset of ideal)

Under malformed input:
  malformed_receipt → skipped with audit entry in projection metadata

Under out-of-order ingestion:
  resolved via canonical ordering (sequence ASC, created_at ASC, id ASC)
```

---

## 6. Stratification Model (Layer 2)

### 6.1 Classification Rule

Stratification MUST be derived **after** state resolution (Layer 1), not
before. The classification function takes the resolved WRP state + plan
metadata and produces an abstraction level:

```
level = f(plan_title, plan_goal, resolved_state, files_affected, dependencies)
```

### 6.2 Heuristic Scoring

| Condition | Assigned Level |
|-----------|----------------|
| `state ∈ {ARCHIVED, FAILED}` OR has cross-system governance impact | L4 |
| `state ∈ {APPROVED, COMPLETED}` OR describes architectural reasoning | L3 |
| `state ∈ {SPECIFICATION, EXECUTING}` OR has structural model content | L2 |
| `state ∈ {CREATED, INTAKE, PLANNING, CRITIQUE, QUEUED}` | L1 |

### 6.3 Per-Role Visibility Scopes

| Level | Default Scope | Consumers |
|-------|---------------|-----------|
| L1 | `builder` | Builder (primary), Analyst (secondary) |
| L2 | `all` | Builder, Architect |
| L3 | `architect` | Architect, Inspector |
| L4 | `architect` | Architect (opt-in) |

### 6.4 Chunk Kind Classification

Based on content type within the plan, each projection chunk is classified
into one of 12 `ChunkKind` values (from `stratification-ontology.json`):

| ChunkKind | When to Assign |
|-----------|----------------|
| `OVERVIEW` | Plan title + goal description |
| `DEFINITION` | Goal field |
| `DATA_MODEL` | Schema definitions in goal |
| `ALGORITHM` | Implementation steps |
| `PROTOCOL` | Cross-plan dependencies |
| `CONFIGURATION` | Files affected |
| `CONSTRAINTS` | Acceptance criteria |
| `RATIONALE` | Architectural reasoning in content |
| `EXAMPLE` | Usage patterns in content |
| `USAGE` | Invocation patterns |
| `ERROR` | Block/failure receipts |
| `META` | Cross-system references |

---

## 7. Cross-Reference Generation (Layer 3)

### 7.1 Derivation Rules

Cross-references between plans are derived from:

1. **Explicit dependency declarations** — `plan.dependencies` field
   - Each dependency becomes: `Plan(A) → depends_on → Plan(B)`
2. **State transitions that affect other plans** — e.g., BLOCK on plan A
   that blocks plan B via `PLAN_BLOCK`
3. **Shared files or systems** — Matching `files_affected` entries across
   plans → `Plan(A) → affects → System(X)`

### 7.2 Cross-Reference Types

| Relationship Type | Source | Target | When |
|-------------------|--------|--------|------|
| `wrp:depends_on` | Plan A | Plan B | B in A's dependencies |
| `wrp:implements` | Plan | WorkRequest | plan→WR mapping |
| `wrp:tracked_by` | WorkRequest | Plan | WR→plan mapping |
| `wrp:impacts_system` | Plan | System | Shared files_affected |
| `wrp:supersedes` | Plan (new) | Plan (old) | Replacement chain |

### 7.3 Cross-Reference Ontology Files

Existing ontology definitions:

- `schemas/relationships/work-request-to-plan.jsonld` — `WorkRequest hasPart Plan`, `Plan derivedFrom WorkRequest`
- `schemas/relationships/harvest-to-work-request.jsonld` — `Harvest produces WorkRequest`

---

## 8. SQL Projection Registration Contract

### 8.1 Projection Definition

A projection definition in the `nebula.projections` table MUST declare:

| Column | Requirement |
|--------|-------------|
| `name` | Unique identifier (e.g., `conduit-wrp-bridge`) |
| `type` | `'deterministic'` |
| `source_query` | SQL SELECT that is a pure function of the DB state (no random, no NOW()) |
| `template` | Mustache-style template with `{{field}}` placeholders |
| `target_path` | File path pattern for rendered output (e.g., `wrp/projections/{{plan_id}}.md`) |
| `metadata` | JSON object with ordering contract, version info |

### 8.2 Source Query Contract

The `source_query` MUST:
- Join `conduit.plans` + `vision.receipts` + `conduit.plan_status` views
- Sort receipts by canonical ordering key
- Return one row per plan with all fields needed for template rendering
- NOT mutate state (read-only SELECT)

### 8.3 Template Contract

Templates MUST:
- Use `{{field}}` syntax (no conditional blocks, no loops — one row → one document)
- Be deterministic (no random, no time, no external lookups)
- Include stratification frontmatter (level, visibility, chunk_kind)
- Include cross-reference section at bottom

---

## 9. Error Handling Model

### 9.1 Partial Receipt Streams

If a plan's receipt stream is incomplete (e.g., we have PLAN_CREATE but
no IMPLEMENTATION yet), the reducer produces a **partial projection**:

- State resolves to the latest valid state reached
- All transitions that cannot be validated are logged in projection metadata
- The projection is marked `partial: true` in metadata

### 9.2 Malformed Receipts

If a receipt record is structurally invalid (missing required fields,
unparseable JSON metadata), it is:

1. Skipped from state reduction
2. Recorded in `projection_errors` in metadata with receipt ID and error detail
3. The remaining valid receipts are processed normally

### 9.3 Out-of-Order Ingestion

Out-of-order receipts are resolved by the canonical ordering function
(Section 3). The reducer always sorts first, so ingestion order does not
affect the final projection. However:

- Receipts with `sequence = 0` must always establish the initial state
- If the earliest-dated receipt is not sequence 0, the projection is
  flagged `incomplete_start: true` in metadata

---

## 10. Minimal Implementation Guarantee

A valid v0.1 implementation requires only:

1. **Canonical receipt ordering** — sort by `(sequence, created_at, id)`
2. **Receipt → WRP state mapping** — the 16-entry map in §4.3
3. **Deterministic reducer** — fold sorted receipts through adjacency matrix
4. **Stratification heuristic** — `level = f(state, metadata)` from §6.2

Everything else (cross-references, incremental replay, global DAG view,
conflict semantics) is enhancement.

---

## 11. Security & Safety

### 11.1 Read-Only Projection

The bridge is a **read-only interpretation layer**. The SQL source_query
must never perform INSERT, UPDATE, or DELETE. The Python reducer must never
write to the database. Mutation flows exclusively through Conduit receipts.

### 11.2 No External Dependencies

Neither the reducer nor the SQL projection may depend on external systems
(HTTP APIs, filesystem state, environment variables beyond connection
configuration). Determinism requires closure over the input data.

### 11.3 Audit Trail

Every projection run produces metadata that records:
- Number of receipts consumed
- Number of receipts skipped (with reasons)
- Final resolved WRP state
- Abstraction level assigned
- Cross-references generated
- Timestamp of run (for diagnostics only — not part of determinism)

---

## 12. Formal Correctness Properties

### P1 — Convergence

> For any finite sequence of valid receipts, the reducer converges to a
> single WRP state.

Proof sketch: The WRP state machine is a DAG with no cycles in the normal
flow. The maximal element property of the canonical order ensures that the
reducer processes receipts in a well-founded sequence. Terminal states
(COMPLETED, ARCHIVED, FAILED) are absorbing.

### P2 — Commutativity of Ordering

> Two batches of receipts for the same plan that contain the same set of
> receipts produce identical projections if the canonical order is the same.

Proof sketch: The reducer is a fold over a sequence. If the sequence is
sorted by the canonical key and the key is a total order, the fold order
is deterministic. Since the fold function is pure, the output is identical.

### P3 — Safety Under Partial Replay

> Any prefix of a sorted receipt stream produces a projection that is a
> valid substate of the full-stream projection.

Proof sketch: The WRP state machine's transitions are monotone along the
normal flow path. Truncating the receipt stream at any point yields the
state that would have been reached at that point in the full replay.

### P4 — Idempotency

> Re-running the reducer on the same receipt stream produces the same
> output, regardless of intermediate state.

Proof sketch: The reducer has no mutable state, no external dependencies,
and no random values. It is a pure function `f(R) → P` where R is the
sorted receipt list. By definition of pure function, f(f(R)) = f(R) when
the output type does not mutate.

---

## 13. Relationship to Other Plans

| Plan | Relationship |
|------|-------------|
| #0174 | This specification — the bridge itself |
| #0175 | WRP cross-reference taxonomy (shared edge types) |
| #0161–#0163 | DDL implementing stratification columns |
| #0181 | Temporal Graph Versioning (receipt branching/snapshot) |
