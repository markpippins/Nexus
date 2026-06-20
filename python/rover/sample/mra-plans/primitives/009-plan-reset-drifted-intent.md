# 009 — Plan Reset for Drifted Intent Recovery

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript). Part of the Layer 3 primitive set; parent: `003-progressive-epistemic-instrumentation.md`.

## Architectural Intent

Plan Reset is the mechanism for **safely discarding corrupted intent**. When execution reality diverges too far from the original plan — due to scope creep, context shift, or accumulated drift — the plan must be abandoned cleanly. Plan Reset preserves the audit trail while freeing resources for fresh intent.

## Requirements & Acceptance Criteria

- [ ] Plan Reset can be triggered by: user request, circuit breaker trip, or drift detection threshold
- [ ] Reset archives the current plan state (not deletes) — full audit trail preserved
- [ ] Reset emits a structured event: plan_id, reason, trigger_source, timestamp, archived_state_ref
- [ ] Reset frees all associated resources (locks, claims, agent assignments)
- [ ] After reset, a new plan can be created with reference to the reset plan ("supersedes")
- [ ] Reset is irreversible — once archived, a plan cannot be "un-reset"

## Reset Event Schema

```
PlanResetEvent {
  plan_id: str
  reason: str
  trigger_source: USER | CIRCUIT_BREAKER | DRIFT_DETECTOR
  timestamp: timestamp
  archived_state_ref: str    // pointer to the preserved state snapshot
  supersedes: str?           // optional reference to replacement plan
}
```

## Implementation Notes

- Plan Reset is a first-class lifecycle transition, not ad-hoc cleanup
- Archived plans remain queryable for audit but are excluded from active pipelines
- Drift detection: compare plan's original acceptance criteria against current execution state
- The Scaffold UI should surface reset plans as a distinct category
- conduit-mcp's `delete_plan` (soft-delete) is a partial implementation of this concept — this spec formalizes it with richer semantics

## Unresolved Follow-Ups

- What is the drift detection heuristic? How far is "too far"?
- Should reset plans be periodically purged or kept forever?
- Can a reset plan be used as input to a new plan ("lessons learned")?
