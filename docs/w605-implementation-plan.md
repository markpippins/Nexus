# W6.05 — W5.08 governed-projection UI: implementation planning (EAC-1..10 trace)

**Work item:** W6.05 (extracted standalone work; NOT a PEB gate).
**Primary specs:** Synth brief `aff361b1` (experiential) · Mechanic IR `3a8fcf44` (spatial/Design IR realization).
**Design status:** APPROVED by Architect (1282b1f8); W5.08 gate closed (6e33b5e7).
**This document:** translates the approved design into an implementation-ready workstream.
**Authority boundary (I2):** implementation is recommended work; the Architect decides binding acceptance.
No peb.decisions activation, no UI admission path, no client-side authority (C5 / EAC-5).

---

## 0. Implementation scope

Render the **governed projection's witnessed-run overview** (server-owned, W3.08) in
**view-architect / peb-ui** exactly per the Mechanic IR's four `SurfaceSpec` regions, using the
**variant-token convention** (`CapabilityRef.variant = "state.<token>"`, tokens bound by the theme
layer) — NO changes to `designIR.ts` / `lac.ts` / `contractAdmission.ts` in this workstream.
Type-surface gaps (F-1..F-6) are **separated** and routed to Architect review (see §3) — they are
NOT implementation tasks here.

### Regions (Mechanic IR §A.1–A.4)

| SurfaceSpec | Region | Core content |
|---|---|---|
| `state-banner-region` | container-level governance banner | 7-state treatment, max-emphasis governs (state-tide) |
| `lineage-provenance-region` | provenance chain drill-down | present/absent/derived links, hollow null nodes |
| `mode-authority-region` | persistent authority disclosure | LIVE / SIMULATION / MOCK + env source on expansion |
| `action-region` | operator affordances | re-read / escalate / route / compare / acknowledge — never admit |

### Cross-cutting widget proposals (REC-N1..N3, per Mechanic IR §B)

- `AuthorityDial` (mode + envKey + note) — implements SurfaceContext.
- `ReplayTape` (attempt counter chip + tape loop + acknowledge) — duplicate_retry.
- `StateChip` (row-level state token chip, theme-bound) — per-row state identity.

---

## 1. EAC-1..10 → implementation task trace

| EAC (Synth §F) | Implementation task | Region / mechanism | Acceptance check |
|---|---|---|---|
| **EAC-1 Verbatim status** | Render server status token + refusal reason verbatim in monospace (REC-C4) | state-banner + refusal rows | Token byte-equals server string in DOM; paraphrase only in secondary text |
| **EAC-2 Seven-way distinctness** | Bind all 7 state tokens in theme (hue/glyph/shape/motion); enforce ≥2-channel difference for co-present states (REC-C1/§B.2) | theme layer + StateChip | Visual audit: any two states differ in ≥2 channels; drift vs duplicate_retry distinct co-present |
| **EAC-3 Authority always visible** | Persistent mode-authority element per surface (LIVE/SIMULATION/MOCK + env source), never a transient toast; no implicit mock (LAC) | mode-authority-region / AuthorityDial | Dial visible on every governed surface; live mode shows no fixture content |
| **EAC-4 No normalization** | Degraded states never borrow healthy accent/opacity/motion (REC-C1); only `complete` uses healthy accent | theme layer | Audit: missing_lineage/unknown/stale/refusal/drift/duplicate_retry never render as complete |
| **EAC-5 No admission** | No affordance suggesting admission/authority flip; surface is read-only (REC-C3) | all regions | Grep/UI check: no admit verb, no authority toggle; adapter is get-only |
| **EAC-6 Provenance drill-down** | Expandable provenance chain; missing links dashed/hollow, never filled/guessed | lineage-provenance-region | Empty lineage renders as named gaps (missing_lineage), 404 → empty not error |
| **EAC-7 Route, don't guess** | Refusal routes on named predicate; unknown escalates; stale re-checks; duplicate_retry offers cease decision | action-region | Each state's affordance maps to its intent table row (§A Synth) |
| **EAC-8 Re-read, not repair** | Every refresh is a server re-read rendered verbatim; transport error surfaces as error, content marked unrefreshed | action-region / state-banner | Live failure shows error state; no synthesized status; no local re-derivation |
| **EAC-9 Contract fail-closed** | `projectionVersion` mismatch renders grade-5 contract error above data states (REC-C5) | state-banner-region | Mismatched projection → contract_error banner, data suppressed below |
| **EAC-10 Immutability perceptible** | refusal/drift/duplicate_retry surfaces communicate settled/append-only; no edit/override affordance (REC-C6) | state-banner + action-region | No edit affordance on settled records; settled styling distinct |

### Server-owned projection constraints (carried from W5.08, unchanged)

- C1 versioned contract (`projectionVersion`), C2 server-derived only, C3 read-only consumer,
  C4 identity fail-closed, C5 no UI admission — all preserved; consumer never re-derives status.

---

## 2. Workstream breakdown (ordered)

1. **Theme layer tokens** — add the 7 state tokens + 2-channel distinctness map per Synth §B.2
   (steel/dark/light), + `state.derived` / `state.transport_error` / `state.contract_error`.
2. **StateChip + AuthorityDial + ReplayTape** (REC-N1..N3) as shared components.
3. **state-banner-region** — container-level governance banner (state-tide max-emphasis rule).
4. **mode-authority-region** — persistent AuthorityDial wiring (LAC context).
5. **lineage-provenance-region** — provenance drill-down with hollow null nodes.
6. **action-region** — per-state affordances (re-read/escalate/route/compare/acknowledge).
7. **Conformance harness** — runtime assertions for EAC-1..10 against the live projection
   (mirror run-w508-conformance.ts pattern); evidence to `docs/w605-evidence/`.
8. **Parity check** — render one live batch thread card surface per CARD_SPEC §4 dual-surface parity.

## 3. Separated items — routed to Architect review (NOT tasks here)

- **F-1** state-treatment schema in designIR.ts · **F-2** meaning-channel vocabulary ·
  **F-3** `LacMode` SIMULATION position · **F-4** typography/dimension tokens ·
  **F-5** max-emphasis-governs declarative operator · **F-6** color/accent binding invariant.
- Any future `designIR.ts` / `lac.ts` type-surface changes require Architect approval before
  implementation (per W5.08 close note 6e33b5e7 and IR scope discipline §0).

---

## 4. Non-goals / bounds

- No client-side authority or admission path (forbidden, C5/EAC-5).
- No `version_not_monotonic` adjudication (W5.09, Architect/Analyst-owned).
- No peb.decisions activation; no operator ballot (ST.03) dependency.
- No designIR.ts / lac.ts / contractAdmission.ts edits in this workstream.
