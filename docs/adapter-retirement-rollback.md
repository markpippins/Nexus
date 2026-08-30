# Adapter Retirement & Rollback — Doctrine Lookup (W3.06)

**Status:** Design + implementation (PR #94). Retirement *decisions* remain
Architect-owned; this document and the `DoctrineLookupRegistry` implement the
gate, evidence, and mechanics only.

## Context

W2.02 introduced the deterministic doctrine lookup (`doctrineLookup.ts`,
in-memory) and W3.02 (PR #88) added the PG-backed production adapter
(`PgDoctrineLookup`). The PG adapter is the *temporary compatibility adapter*
referred to by the Wave 3 scope: it stands in front of the doctrine store until
the permanent, versioned doctrine publication path is accepted. W3.06 defines
how that adapter is eventually retired — and rolled back — without ever
rewriting or invalidating historical evidence.

## Adapter chain

```text
live lookup (active):    PgDoctrineLookup        (primary,  id: pg)
safety net (fallback):   InMemoryDoctrineLookup  (fallback, id: memory)
```

The `DoctrineLookupRegistry` routes every authoritative lookup to the
currently active adapter and records an **observation** for each call.
Observations are append-only replay evidence: timestamps, request, and
outcome are never rewritten or deleted.

## Retirement conditions (gate)

Retirement may be *requested* only when the gate passes. The gate is
**fail-closed** — all conditions must hold simultaneously:

1. **Observation floor** — at least `minObservationsForRetirement`
   (default 100) recorded lookups through the primary adapter, so the
   decision rests on evidence, not anecdotes.
2. **Zero open divergences** — every recorded primary/fallback divergence
   has been reviewed and resolved (reviewer identity + timestamp recorded).
   A single unreviewed divergence blocks retirement regardless of volume.
3. **Stable state** — the primary adapter is `active` (no retirement or
   rollback already in flight).

## Retirement procedure (Architect-owned decision, I1/I2)

```text
1. Engineer runs the gate:        registry.requestRetirement(note)
   - gate fails     → nothing happens; reason list returned; fix evidence.
   - gate passes    → state: active → retiring; event appended.
2. Architect reviews the decision request (gate + divergence inventory).
   - confirm → state: retiring → retired; fallback becomes authoritative.
   - reject  → state: retiring → active;  primary stays authoritative.
```

`requestRetirement` **never** completes retirement on its own; confirmation
and rejection are explicit Architect calls. This preserves the origin-gating
invariant: implementation proposes, architecture disposes.

## Rollback procedure

Rollback is a **runtime routing change only** — it never rewrites history:

```text
registry.rollback(note)
  - state → retired (fallback becomes authoritative immediately)
  - an immutable `rollback` event is appended
  - all prior events, observations, and divergences remain intact
```

Typical triggers: primary adapter regression detected in production, PG
store corruption or unavailability beyond SLO, divergent doctrine resolution
observed downstream. Rollback is always available — it does not require the
retirement gate — because it is a *safety* action, not a promotion.

## Replay safety guarantees

- Envelopes, receipts, evidence, and witnessed-run rows are append-only
  records; adapter retirement changes **routing**, not data.
- Replay of a historical envelope re-runs the same lookup path recorded in
  its observations; the observation log proves which adapter produced each
  outcome and when.
- No event, observation, or divergence is ever deleted or rewritten;
  resolution annotates a divergence (reviewer + timestamp) rather than
  replacing it.
- `peb.decisions` remains **dormant** (shadow/read-only ceiling from Wave 2);
  nothing in this module introduces a mutable authority path.

## Verification

- `npm run test:doctrine-lookup-registry` — 11 scenario groups: routing,
  constructor fail-closed validation, primary-failure shadow comparison,
  gate fail-closed behavior, full retirement flow, rejection, rollback
  append-only history, divergence resolution, replay-evidence immutability.
- `npm run test:doctrine-lookup` — W2.02 baseline conformance still green.
- `npm run typecheck` — clean.
