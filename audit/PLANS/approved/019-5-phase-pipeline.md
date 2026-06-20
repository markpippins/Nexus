# Approved Plan: Establish 5-Phase Pipeline Architecture with Freeze Boundary

**Status:** `Agreed`
**Source:** Harvested from `IRL IR Interaction System.html`
**Harvest Ref:** `irl-ir-interaction-system-harvested.md` #3

## Architectural Intent
The system is a 5-phase pipeline (revised from earlier 3-phase model): Phase 0 (IRL/IR), Phase 1 (Spec Compiler), Phase 1.5 (Lowering Pass / freeze boundary), Phase 2 (Execution Runtime), Phase 3 (Observation Model), with Phase 4 (Identity/Persistence cross-cutting). Four invariants unify everything: Determinism, Append-only truth, Freeze boundary, Identity collapse.

## Requirements & Acceptance Criteria
- [ ] Phase 0: IRL probabilistic classification → IR deterministic selection
- [ ] Phase 1: Prompt → WorkRequestGraph via structural decomposition
- [ ] Phase 1.5: WorkRequestGraph → Frozen ExecutionGraph (topology immutable after lowering)
- [ ] Phase 2: Deterministic scheduler + CER event emission + append-only log
- [ ] Phase 3: Projection layer + replay + derived views (read-only, never affects execution)
- [ ] Phase 4: Append-only log integrity + identity collapse + deterministic replay + snapshot compression

## Files Affected
- `nexus/python/vision/losm-ir/` — state machine alignment
- `nexus/python/` — pipeline implementation

## Dependencies
- IRL↔IR bridge (Plan #018) defines Phase 0
- MEEP bootstrap (Plan #021) implements Phases 0-3
- Collapse Plan roadmap (Plan #020) defines build order

## Unresolved Follow-Ups
- Is Phase 1.5 truly its own phase or should it be part of Phase 1?
- How does the 5-phase model relate to the existing losm-ir state machine?
