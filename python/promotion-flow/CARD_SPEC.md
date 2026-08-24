# Decision-Card Format — Canonical Spec (v2)

> Single source of truth for the operator/planner promotion gate cards.
> Binding decisions: e4e9082e (cards) as amended by 33c708e2 (destination
> triple) and 319defa5 (Plan removed, spawn_requirement).
> Reference implementation: `reemit_cards.py` (emitter),
> `stage3_execute.parse_card_reply()` (parser). If this doc and code
> disagree, fix one of them in the same commit.

## 1. Card body (per candidate item)

Rendered into the batch gate thread as one block per non-terminal item:

```
**Card `<short8>`** — <title ≤70 chars> (CPF <0.00–1.00> | mapping: <Sys :: Sub | (unmapped)> | dest: <requirements|sandbox>)
- ( ) <short8>: Requirement
- ( ) <short8>: Sandbox
- ( ) <short8>: Strike
- ( ) Other for <short8> — remap as "System :: Subsystem"
```

Rules:
- `<short8>` = first 8 chars of the harvest-candidate UUID (lowercase hex).
- Exactly one radio per line; `( )` unchecked, `(x)` checked.
- The Plan option MUST NOT be rendered (decision 319defa5: no candidate→plan path).

## 2. Reply contract (how a choice is recorded)

The UI/operator mirrors the final card state in a thread comment:

```
**Agreed selection:**
- (x) <short8>: Requirement
- (x) <short8>: Sandbox
```

Parser contract (`parse_card_reply`):
1. Only text after an `**Agreed selection:**` header counts; the LAST header
   wins if multiple appear.
2. Radio lines match `-\s+\(x\)\s+(.*)`; the candidate is attributed via the
   first `[0-9a-f]{8}|[uuid]` token on the chosen line.
3. Verdict mapping (case-insensitive):
   - contains `requirement` → promote-as-mapped (needs existing mapping;
     unmapped ⇒ ignored, must use Other/remap)
   - contains `sandbox` → sandbox-track scaffold (no mapping prerequisite;
     qualification = zero open questions, enforced upstream by stage-1)
   - contains `strike` → strike
   - starts with `other` / contains `remap` / `other:` → remap; extract
     `System :: Subsystem` from the chosen line only (quoted span preferred,
     then `remap as …`, then `Other: …`). Lines without a candidate id are
     un-attributable and safely ignored.
4. Legacy prose (`APPROVE|STRIKE|MAP <id> -> Sys :: Sub`) remains honored for
   batches emitted before v2.

## 3. Execution semantics (stage 3)

| Verdict | Effect |
|---|---|
| Requirement | `POST /api/harvest-candidates/:id/spawn-requirement` (idempotent skip if already promoted) |
| Sandbox | scaffold `nexus/sandbox/<short8>-<slug>/` with PROVENANCE.md + README.md; no requirement row |
| Strike | manifest `struck`, item untouched forever |
| Other/remap | resolve System::Subsystem names → ids, then behave as Requirement |

## 4. Dual-surface parity (amendment 33c708e2 item 3)

Both `angular/nebula-ui` and `angular/nebula-control-plane` MUST render these
cards from THIS spec — no per-app format forks. Parity check: emit one live
batch thread, render it in both surfaces, compare DOM against §1 byte-for-byte
on structure. assembly-ui may reuse unchanged.
