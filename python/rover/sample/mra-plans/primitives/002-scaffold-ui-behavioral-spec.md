# 002 — Scaffold UI as Specification-Bearing Infrastructure

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript). Cross-cutting Layer 3 concern; parent: `003-progressive-epistemic-instrumentation.md`.

## Architectural Intent

Elevate the Scaffold UI from "throwaway product code" to **executable design intent** for the WRP. The Scaffold UI is no longer a temporary UI layer — it is a **specification-bearing infrastructure** that captures behavioral intent, interaction models, and design memory. Its primary value is now as a *behavioral specification* that can be transferred into the WRP.

The Scaffold UI is "messy but truthful" — it reveals what actually happens, not what should happen.

## Surfaces

The Scaffold UI surfaces all Layer 3 primitives:

| Primitive | UI Surface |
|-----------|------------|
| Tickets | Plan list, ticket status indicators |
| Receipts | Execution history, receipt viewer |
| Circuit Breakers | Breaker status panel, trip/reset controls |
| Kill Switches | Emergency halt button per plan/agent |
| Pause/Resume | Pipeline pause/resume toggle |
| Pipeline Tracking | Plan lifecycle progress (proposed → pending → active → completed) |
| Session Review | Session history, review artifact viewer |
| Real-time Logs | Live event stream |
| Token Tracking | Cost display per plan/session |
| Plan Reset | Reset trigger and archived plan browser |

## Design Contract

- **Fidelity of expression > maintainability** — the UI's job is to reveal truth, not to be clean
- **Clarity of interaction models > feature completeness** — a clear failure display is better than a hidden success
- **Transferability into WRP > long-term code quality** — the UI is a spec surface, not a product
- Every UI component's behavior is documented and traceable to a WRP WorkRequest
- UI design decisions are preserved as design memory, not lost in code
- The Scaffold UI can be regenerated from its captured behavioral spec

## Requirements & Acceptance Criteria

- [ ] Scaffold UI captures interaction models as formal, transferable specifications
- [ ] Every UI component's behavior is documented and traceable to a WRP WorkRequest
- [ ] The UI serves as a "truthful" surface where execution reality shows up — failures, state transitions, and drift are visible
- [ ] UI design decisions are preserved as design memory, not lost in code
- [ ] Scaffold UI can be regenerated from its captured behavioral spec

## Unresolved Follow-Ups

- What format should the behavioral spec take? JSON schema? DSL? State machine?
- How do we automate extraction of behavioral specs from existing UI code?
- Should the Scaffold UI eventually be code-generated from WRP WorkRequests?
