# Approved Plan: Stabilize NBK as Execution-Only Kernel and Enforce Semantic Compiler Separation

**Status:** `Agreed`
**Source:** Harvested from `System Evolution and Naming.html`
**Harvest Ref:** `system-evolution-and-naming-harvested.md` #2

## Architectural Intent
The system is currently at a Partial Compilation + Pre-Verification Lock stage: structure has been generated (candidate plan exists), execution semantics have been applied (NBK is involved), but nothing is yet committed as canonical DAG state. Three actionable levers exist: (A) Stabilize NBK correctness boundary — verify invariants hold, no semantic leakage from rover, lease/trace/address unchanged; (B) Validate LOSM→NBK translation fidelity — ensure chunks are interpreted as nodes or constraints, not speculative narrative; (C) Candidate DAG sanity check — check for cycle emergence, orphan nodes, and over-aggregation.

## Requirements & Acceptance Criteria
- [ ] NBK must be frozen — no structural changes, no rule mutation, no SOCO application until verification passes
- [ ] Every candidate plan item must be strictly classified as: NODE (executable unit), CONSTRAINT (invariant rule), REJECT (invalid), or DEFER (needs more data)
- [ ] NBK must NOT interpret meaning, resolve ambiguity, or hold semantic state — it is execution-only
- [ ] Semantic IR must be defined as a strict intermediate representation before any integration proceeds
- [ ] NBK integration with cascade/replay kernel must NOT proceed until a stable post-harvest DAG exists
- [ ] Rover must be restructured to emit typed artifacts: SemanticNode, WorkRequestEdge, Constraint, Objection — not speculative text

## Files Affected
- `nexus/python/nbk/` — freeze NBK, enforce execution-only boundary
- `nexus/python/rover/` — restructure output to typed artifacts
- `nexus/python/cascade/` — defer integration until DAG is stable

## Dependencies
- WDICC compilation spec (Proposed) may need to be implemented first
- This plan is a prerequisite for all other plans

## Unresolved Follow-Ups
- Should the WDICC compilation spec be implemented before or after Semantic IR is defined?
- How should the three-layer architecture be reflected in the filesystem/repository layout?

## Layer Architecture
- **Layer 1 — Kernel (NBK):** nodes, edges, trace, lease, address — execution truth
- **Layer 2 — Semantic Compiler:** Semantic IR, LOSM core, risk management, dual-mode OS — defines meaning before execution
- **Layer 3 — Projection & Validation:** SemanticProjection, determinism checks, replay views, dashboards — read-only interpretations
