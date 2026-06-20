# Approved Plan: Implement Golden Trace Regression Harness (MEEP v0.2)

**Status:** `Proposed`
**Source:** Harvested from `IRL IR Interaction System.html`
**Harvest Ref:** `irl-ir-interaction-system-harvested.md` #7

## Architectural Intent
Add deterministic verification layer on top of MEEP v0.1. Golden trace format captures expected_irl, expected_ir, expected_execution_nodes, expected_final_state as a JSON behavioral contract. Comparison engine diffs actual vs expected state. New invariant: NO CHANGE IS VALID UNLESS IT PASSES GOLDEN TRACE REPLAY.

## Requirements & Acceptance Criteria
- [ ] Golden trace must capture full expected pipeline output as JSON
- [ ] Comparison engine must detect FINAL_STATE_MISMATCH, IR_MISMATCH, etc.
- [ ] CAPTURE function must record reality first, then become expected
- [ ] New invariant: NO CHANGE IS VALID UNLESS IT PASSES GOLDEN TRACE REPLAY
- [ ] Test runner must assert pass/fail with error list

## Files Affected
- `nexus-meep/tests/golden_traces/` — golden trace storage
- `nexus-meep/tests/test_runner.py` — regression test runner
- `nexus-meep/validation/golden_compare.py` — comparison engine

## Dependencies
- MEEP v0.1 bootstrap (Plan #022) must be running first

## Unresolved Follow-Ups
- Should golden traces be stored in the repo or generated on first run?
- How many golden traces are needed for adequate regression coverage?
