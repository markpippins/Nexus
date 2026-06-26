# Approved Plan: WRP Migration Plan — 4-Phase Legacy-to-WRP Rollout

**Status:** `Agreed`
**Source:** Harvested from `Semantic IR v0.1 Overview.html`
**Harvest Ref:** `semantic-ir-wrp-harvested.md` candidate #2

## Architectural Intent
Incremental structural replacement with compatibility layers so everything continues running while the system re-wires itself underneath. Phase 1 (Shadow): Introduce WRP package, mirror events only, no behavior change. Phase 2 (Dual-write): Replace transition validation with WRP-aware wrapper, kernel becomes event subscriber. Phase 3 (WRP Primary): Invert control — execution driven by WRP events, kernel becomes reactive. Phase 4 (Legacy Collapse): Remove WorkStatus as driver, replace WorkflowState with projection, shell becomes event router. Final dependency: Spring → WRP Event API → Event Store → WRP Runtime Engine → Cognitive Kernel → State Space → Snapshot Store → Nexus.

## Requirements & Acceptance Criteria
- [ ] Phase 1: New losm-wrp package with shadow event emitters — NO behavior change
- [ ] Phase 2: Dual-write validation — both legacy and WRP transitions validated, WRP events persist
- [ ] Phase 3: WRP events become the execution driver — kernel becomes reactive subscriber
- [ ] Phase 4: Legacy state machines removed, shell becomes event router only
- [ ] 8-step migration order: (1) Introduce WRP package, (2) Shadow emitters, (3) Persist WRP events in DB, (4) Build replay engine, (5) Switch shell to WRP events, (6) Redirect kernel to event bridge, (7) Deprecate WorkStatus/WorkflowState, (8) Remove legacy transition system

## Files Affected
- `nexus/python/vision/losm-ir/` — WRP state machine, validate_transition
- `nexus/python/` — WRP runtime, event store
- `nexus/` — DB schema migration for WRP events

## Dependencies
- WRP Protocol Spec (Plan #025) defines the protocol
- MEEP bootstrap (Plan #021) provides execution spine
- State ontology consolidation (Plan #025 relationship)

## Unresolved Follow-Ups
- Should the migration happen before or after MEEP bootstrap?
- Does losm-store schema need changes for WRP event persistence?
