# Operator Conformance — deny_contract_promotion (W5.08 engineer side)

**Status:** Engineer-side evidence for W5.08 (co-owned with design-synthesist).
Cites only merged, verified artifacts. Scope: what operators may and may not
do with the first narrowly blocking decision class.

## Governing decision

- Class: `deny_contract_promotion` (W4.07), the first narrowly blocking class.
- Grant: W1.10 gate-12 decision `05d0fe54`, effective 2026-08-30T13:40:00Z,
  with amendments v1–v4: `1a7b466d` (c5 reframe), `f61d94e6` (c5-barium),
  `41d30b44` (c5 scope), `3a30651a` (v4 triplet).
- Elevation: advisory → narrowly-blocking, effective ONLY at the governed
  admission boundary (`ContractAdmissionRegistry`, PR #99, merged).
- All other peb.decisions surfaces remain advisory/shadow.

## What an operator MAY do

1. **Observe** the witnessed-run projection
   (`GET /api/execution/projections/witnessed-runs`, W3.08, PR #95) —
   read-only, server-derived status, versioned (`projectionVersion` = 1).
2. **Trigger drills** — the D1–D4 harness (PR #98; standalone run PR #104,
   W5.05) is the ONLY sanctioned disablement/recovery path (condition c3).
3. **Refuse/escalate** on `unknown`/`refusal`/`stale` states — these are
   operator-eligible refusals (condition c1): never silent allow, never
   silent auto-deny.
4. **Inspect evidence** committed under `docs/w503-evidence/`,
   `docs/w504-evidence/`, `docs/w505-evidence/` — append-only, fingerprinted.

## What an operator MUST NOT do

1. **Never bypass the admission boundary.** `ContractAdmissionRegistry` is
   the sole submit surface (condition c2). There is no UI/browser admission
   path; direct callers have no blocking write path (gate 9).
2. **Never toggle global blocking** outside a new gate-12 decision. The
   registry exposes no method that flips global blocking (W5.03 A4,
   W5.04 G3, W5.05 isolation assertion).
3. **Never rewrite history.** Evidence, denial, refusal, and rollback
   records are append-only (condition c3; W5.05 drills prove no rewrite).
4. **Never treat a canary or drill as a durable-authority transition**
   (c5-a, `41d30b44`). Canary/drill runs are simulations; only a PERSISTED
   denial is a durable transition, and the first persisted denial is gated
   on barium backup health (c5-barium, `f61d94e6`; devops incident
   `f64ae630` is the current open precondition).
5. **Never count infrastructure errors as agreement** (gate 5/W4.05 rule).

## Refusal reason catalog (fail-closed, W4.06)

Every refusal names the failing predicate — operators should route on the
reason string, never treat `refused` as silent `unknown`:

| Reason | Meaning |
|---|---|
| `invalid_contract_identity` | missing/empty contractId or non-integer/zero version |
| `duplicate_artifact:<kind>` | same artifact kind submitted twice |
| `missing_artifact:<kind>` | required kind (typespec/jsonld/cue) absent |
| `invalid_digest:<kind>` | digest not a valid `sha256:<64 hex>` |
| `missing_framing_dimension:<dim>` | required framing dimension absent or blank |
| `version_not_monotonic:<v><=<prior>` | version not strictly greater than admitted head |
| `digest_rewrite:<kind>@v<n>` | digest changed at an already-recorded version |

## Disablement procedure (operator runbook)

1. Trigger the drill harness (`run-w505-drill-operations.ts`) — it exercises
   D1–D4 against the boundary in simulation.
2. Confirm per-drill output: `disabledCleanly`, `historyAppendOnly`,
   `recoveryAchieved` all true.
3. Confirm determinism fingerprint matches the committed artifact.
4. If any refused case would have admitted (or vice versa): STOP, record,
   and escalate to Architect (per W5.04 handoff failure semantics).
5. Emergency disablement == D1–D4 rollback harness (gate 10, condition c3).

## Monitoring hooks (W3.05 / W5.07 interface)

Governance metrics (including `witnessed_run_status` counter, PR from the
W3.05 observability leg) expose per-status counts; operators should alert on
unexpected `unknown` growth and on any nonzero isolation counter.

## Evidence baseline

- W4.05: seed 42, n=1,344, 100% classified / 96.43% strict, 48 owned drift,
  0 unexplained, 0 missing lineage, 0 infra errors (PR #100).
- W5.03: admission-boundary verification, fingerprint `sha256:178e269c…` (PR #102).
- W5.04: canary, fingerprint `sha256:dc0fe075…` (PR #103).
- W5.05: drills, fingerprint in `docs/w505-evidence/w505-drill-summary.json` (PR #104).
