# W5.06 Normalization Rule — partitioning the 1,035 parity mismatches

Engineer derivation per architect spec **91dadca9** (W5.06 corrective REVISED,
supersedes a27948a2). Applied to committed evidence only; no evidence
regeneration; no `contractAdmission.ts` changes (frozen pending W5.09).

## Inputs

- **Shadow side (stateless evaluator):** committed
  `python/peb-kernel/evidence/w405/w405_shadow_evidence.json` — 1,344 rows,
  read-only, lineage intact.
- **Stateful side:** the same seeded sample (seed 42, identical
  `buildSample()` derivation as the W5.04 canary) replayed through **one**
  `ContractAdmissionRegistry` across all 1,344 records — the harness
  `run-w506-equivalent-state-replay.ts`, output
  `docs/w506-evidence/w506-equivalent-state-replay.json` (fingerprint
  `sha256:87e57fa3742888e7fdb3756ed64704a51b9af05280091653f26a86e19847b04d`,
  double-run byte-identical).
- **Registry state machine** (`contractAdmission.ts`, W4.06 e814fbc2): refusal
  reasons are `invalid_contract_identity`, `duplicate_artifact:<kind>`,
  `missing_artifact:<kind>`, `invalid_digest:<kind>`,
  `missing_framing_dimension:<dim>`, `version_not_monotonic:v<=prior`,
  `digest_rewrite:<kind>@v<n>`. Exactly two are **state-dependent**:
  `version_not_monotonic` (reads `versions` map) and `digest_rewrite` (reads
  `digests` map). The other five depend only on the request itself.

## Definitions

For a paired row `r` (shadow row `s` paired to stateful outcome `c` by
`(case_class, ordinal-within-class)` at seed 42), define the **fresh
derivation** `f(r)` = `registry.admit(r.request)` against an empty registry
(emitted per row as `freshStatus`/`freshReason`).

**Mismatch (the W5.06 comparison defect):** `s.peb_status = "resolved"` and
`c.status = "refused"` — the stateless shadow expected the request to
resolve but the stateful evaluator refused it.

## Partition rule

Each mismatch row is classified by exactly one of:

1. **expected-stateful-refusal** — `f(r).status = "admitted"` and
   `c.reason ∈ {version_not_monotonic, digest_rewrite}`. The refusal is fully
   caused by registry state accumulated from earlier admissions; a stateless
   evaluator cannot see it. This is evaluator-state asymmetry, not semantic
   divergence: the monotonicity/immutability properties are the safety
   properties of the live gate (directionally safe: live over-blocks).
2. **semantic-divergence** — `f(r).status = "refused"` (with any reason) while
   `s.peb_status = "resolved"`. The refusal survives removal of registry
   state, so the two evaluators disagree on the request itself.
3. **open** — anything else (including fresh-admit refusals whose reason is
   not state-dependent, or unpairable rows). Requires human/analyst review.

**Normalization for parity accounting:** rows classified
`expected-stateful-refusal` are excluded from the semantic-parity failure
count; `semantic-divergence` and `open` rows count as parity failures.

## Observed derivation over the committed evidence

The harness emits `freshStatus`/`freshReason` for every mismatched row and
leaves `classification: "open"` on **every** row — the engineer derives the
rule but does not classify (analyst applies/validates per I2).

Observed derivation inputs for all mismatched rows:

| case_class | rows | stateful reason | fresh derivation |
|---|---|---|---|
| clean | 767 | `version_not_monotonic` | admitted |
| duplicate_retry | 268 | `version_not_monotonic` | admitted |

Total: **1,035 = 767 + 268** — exactly the acceptance oracle. Every mismatch
row satisfies the antecedent of rule 1 (`fresh = admitted`, reason
`version_not_monotonic`), so **under this rule all 1,035 are
expected-stateful-refusal candidates and zero are semantic-divergence or
open** — pending analyst validation.

State-independent refusals (not mismatches; both evaluators refuse, shadow
`peb_status` is not `resolved`): refusal 96 (`missing_framing_dimension`),
unknown 96 (`invalid_digest`), stale 48 (`version_not_monotonic` — note:
stateful-only refusal on an already-non-resolved shadow row), drift 48
(`version_not_monotonic`; the shadow's own drift divergence is
`explained_divergence` in W4.05 and is not part of the 1,035).

## Acceptance oracle

Spec 91dadca9: the stateful replay must reproduce
`1,035 = 767 clean + 268 duplicate_retry`. **Verified** by the harness with
hard assertions; fingerprint and double-run determinism recorded in the
evidence JSON.

## Provenance

- Evidence: `docs/w506-evidence/w506-equivalent-state-replay.json` (this PR)
- Shadow input: `python/peb-kernel/evidence/w405/w405_shadow_evidence.json`
  (committed; unchanged)
- Cross-check: `docs/w504-evidence/w504-canary-transcript-full.json` (PR #105)
