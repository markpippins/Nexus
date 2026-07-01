# Bug Report Dialog in Nexus Console Bottom Bar

**Project:** nexus
**Plan Number:** 1020
**Status:** pending

## Goal

Add a "bug" button to the far right of the nexus-console bottom bar that opens a dialog for filing change requests. The dialog has selectors for system, subsystem, and feature (like the Nebula requirements edit dialog) and submits a new requirement to the Nebula RMS API.

## Files Affected

- `nexus/angular/nexus-console/src/bottom-bar/bottom-bar.component.ts` — add `bugClick` output
- `nexus/angular/nexus-console/src/bottom-bar/bottom-bar.component.html` — add bug button at far right of action-buttons
- `nexus/angular/nexus-console/src/app.component.ts` — wire dialog, add `openBugReportDialog()`, import dialog component
- `nexus/angular/nexus-console/src/app.component.html` — add conditional `<app-bug-report-dialog>` rendering
- `nexus/angular/nexus-console/src/components/bug-report-dialog/bug-report-dialog.component.ts` — **NEW** dialog component
- `nexus/angular/nexus-console/src/components/bug-report-dialog/bug-report-dialog.component.html` — **NEW** dialog template
- `nexus/angular/nexus-console/src/components/bug-report-dialog/bug-report-dialog.component.scss` — **NEW** dialog styles

## Acceptance Criteria

- [ ] A 24×24 bug button appears at the far right of the action-buttons group in the bottom bar
- [ ] Clicking the bug button opens a modal dialog
- [ ] The dialog has system, subsystem, and feature dropdowns populated from `GET http://localhost:3000/api/systems`
- [ ] Subsystem dropdown is filtered by selected system
- [ ] Feature dropdown is filtered by selected subsystem
- [ ] The dialog has title input, description textarea, and priority selector (Low/Medium/High)
- [ ] Submit calls `POST http://localhost:3000/api/requirements` with `{ systemId, subsystemId, featureId, title, description, status: 'Backlog', priority }`
- [ ] Cancel closes the dialog without submitting
- [ ] Success shows a toast and closes the dialog
- [ ] Error shows an error toast
- [ ] The dialog follows existing nexus-console dialog patterns (dark theme support, modal overlay)

## Dependencies

- Nebula RMS running on port 3000 (verified UP)
- Service registry on port 8085 (verified UP)
- Broker gateway on port 8081 (verified UP)
- Nexus-console running on port 4200

## Implementation Notes

- Use the existing image-based icon system (`getSiteIconUrl('bug')`) consistent with chat/aiconfig buttons
- Call nebula API directly from the dialog using Angular `HttpClient`
- Follow existing dialog patterns: standalone component with `(close)` output
- No backend changes needed — nebula API already handles `POST /api/requirements`
- Reuse `.action-btn` CSS class for the bug button (no SCSS changes needed)
- Subsystem and feature dropdowns cascade: changing system resets subsystem and feature, changing subsystem resets feature
