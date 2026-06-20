# Approved Plan: Build Minimal End-to-End Pipeline (MEEP) Bootstrap Implementation

**Status:** `Proposed`
**Source:** Harvested from `IRL IR Interaction System.html`
**Harvest Ref:** `irl-ir-interaction-system-harvested.md` #5

## Architectural Intent
A single repo that takes a prompt and produces a replayable CER log that deterministically reconstructs execution. Repo structure: cli/, irl/, ir/, compiler/, runtime/, cer/, replay/, validation/, examples/. Core contracts: determinism, append-only CER, freeze boundary, no distribution in v1, single validator gate.

## Requirements & Acceptance Criteria
- [ ] Determinism: same prompt → same CER log → same replay state
- [ ] Append-only CER: event_log.append(event) — NEVER modify or delete
- [ ] Freeze boundary: WorkRequestGraph → ExecutionGraph = immutable transition
- [ ] No distributed logic in v1
- [ ] Single validator gate: validate(artifact, phase) → pass/fail + reason codes

## Files Affected
- `nexus-meep/` or `nexus/python/meep/` — entire new project
- cli/, irl/, ir/, compiler/, runtime/, cer/, replay/, validation/, examples/

## Dependencies
- IRL↔IR bridge (Plan #018) defines Phase 0
- 5-phase pipeline (Plan #019) provides architecture
- Collapse Plan (Plan #020) governs priority
- MEEP v0.1 code (Plan #022) provides the runnable skeleton

## Unresolved Follow-Ups
- Should MEEP be implemented in nexus/ directly or as a separate repository?
- What is the first golden trace prompt?
