# Builder Change Report
- **Session:** builder-20260609-0071
- **Completed:** 2026-06-09T02:47:00Z
- **Plans processed:** 1 (WorkRequest wr-0071-1780987502)

## Plan 0071: Make active and completed plans read-only in planner view
- **Goal:** Ensure that Active and Completed plans cannot be edited inline in the Planner component. Completed plans had editable fields because `canRevise()` returned true, which fed into `fieldsEnabled()`. The Revise workflow creates a copy (not editing the original), so fields should remain disabled for Completed plans.
- **Declared files:**
  - MODIFY: pipeline-viewer/src/app/components/planner/planner.component.ts
  - MODIFY: nexus-ui/pipeline-viewer/src/app/components/planner/planner.component.ts
- **Actual changes:**
  - M  pipeline-viewer/src/app/components/planner/planner.component.ts  (1 line changed)
  - M  nexus-ui/pipeline-viewer/src/app/components/planner/planner.component.ts  (1 line changed)

## Changes Summary

### Root cause
`fieldsEnabled()` returned `true` for Completed and Blocked plans because it included `canRevise()`:
```typescript
// BEFORE:
fieldsEnabled(): boolean {
    return this.editable() || this.canRevise() || this.canPromote();
}
```

This meant all form fields (Title, Project, Goal, Acceptance Criteria, Dependencies) were enabled/editable for Completed and Blocked plans, even though the Revise workflow creates a copy and never edits the original plan in place.

### Fix
Removed `canRevise()` from `fieldsEnabled()` so that Completed and Blocked plan fields remain disabled:
```typescript
// AFTER:
fieldsEnabled(): boolean {
    return this.editable() || this.canPromote();
}
```

### What stays the same
- The **Revise button** continues to appear for Completed and Blocked plans (`*ngIf="canRevise()"` is unchanged)
- The `canRevise()` function itself is unchanged — it still returns `true` for Completed/Blocked
- Active plans were already read-only (not in `canRevise()` or `canPromote()`, and `editable()` returns false) — they remain read-only
- Pending and Planning plans remain editable (`editable()` returns true)
- Proposed plans remain editable during promotion (`canPromote()` returns true)

## Self-Verification
- **pipeline-viewer tsc --noEmit**: PASS (no errors)
- **nexus-ui pipeline-viewer tsc --noEmit**: PASS (no errors)
- **Files changed**: Both planner components updated identically
