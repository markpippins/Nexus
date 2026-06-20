# Approved Plan: Adopt Collapse Plan Roadmap — Stop Expanding, Build Spine

**Status:** `Agreed`
**Source:** Harvested from `IRL IR Interaction System.html`
**Harvest Ref:** `irl-ir-interaction-system-harvested.md` #4

## Architectural Intent
The system is over-modeled and under-steered. Roadmap: Phase 0 (freeze ontology), Phase 1 (vertical slice end-to-end), Phase 2 (compiler hardening), Phase 3 (execution as kernel), Phase 4 (observation layer — only after correctness), Phase 5 (distribution — optional, last). Correct dependency direction: IRL→IR→Compiler→Execution→CER→Replay→Observation→Distribution.

## Requirements & Acceptance Criteria
- [ ] Phase 0: Freeze conceptual growth — no new specs unless they map to executable surface
- [ ] Phase 1: Vertical slice must work end-to-end on single node (trivial prompt → replayable event log)
- [ ] Phase 2: Compiler hardening — IRL as structured vector, IR as deterministic projection
- [ ] Phase 3: ExecutionGraph as immutable bytecode, scheduler as interpreter loop
- [ ] Phase 4: Observation NEVER affects execution — read-only over immutable truth
- [ ] Phase 5: Distribution last — replay engine replicated across machines
- [ ] Correct dependency direction enforced

## Files Affected
- All `nexus/` — this is a process/priority governance plan

## Dependencies
- Must supersede any plan that violates the dependency direction

## Unresolved Follow-Ups
- What are the exact boundaries of the fixed contract set?
- How does this roadmap interact with existing work-in-progress?
