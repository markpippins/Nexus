# W3.07 — peb.decisions Shadow / Read-Only Comparison

**Status:** Implementation (PR open for Architect review). Read-only shadow
comparison between PEB-derived results and the compatibility adapter
(doctrine lookup). `peb.decisions` remains **dormant** — this work package
writes nothing into it and introduces no advisory or blocking authority.

## What it does

For each governed evaluation request id, the `ShadowComparison` module
computes two results side by side:

```text
PEB-derived result      (PEBResultSource.peb_result(request_id))
compatibility adapter   (AdapterResultSource.adapter_result(request_id))
```

and records the outcome in an **append-only** `ShadowComparisonLog`:

- `match` — both sources agree (recorded too, so the comparison is fully
  auditable end to end).
- `divergent` — the two sources disagree; the divergence is returned to the
  caller and included in the Architect review inventory.
- `error` — a source raised; the failure is recorded as an ERROR divergence
  (**fail-closed**: never silently treated as a match).

## Guarantees

- **Read-only:** the comparison path never calls `save_decision`,
  `save_state`, or `save_transaction` — verified by a spy store in the
  conformance suite that raises if any write is attempted.
- **Append-only inventory:** `ShadowComparisonLog.entries()` returns an
  immutable snapshot tuple; there is no delete/update API. Records are
  never rewritten or removed.
- **Fail-closed:** a source exception is recorded as an ERROR divergence
  (status `"error"`, detail `peb_source_error:…` / `adapter_source_error:…`)
  — never silently treated as a match.
- **Dormant authority:** the module introduces no mutable authority path;
  `peb.decisions` remains dormant at the shadow/read-only ceiling.

## Review workflow (Architect + Analyst)

```text
1. ShadowComparison.compare_many(request_ids) runs the comparison batch.
2. review_inventory() returns {generated_at, summary counts, divergences[]}
   — the divergence inventory for Architect review.
3. Architect reviews each divergence; the inventory is read-only, so the
   disposition of each divergence is tracked in the review record, not by
   mutating the log.
```

## Usage

```python
from peb_kernel.shadow import ShadowComparison

comp = ShadowComparison(peb_source, adapter_source)
divergences = comp.compare_many(request_ids)
inventory = comp.review_inventory()   # for Architect review
```

## Verification

`python3 -m pytest tests/test_shadow_comparison.py` — 6 tests: match → no
divergence, divergence recorded + flagged, append-only inventory, no writes
to peb.decisions (spy store), error → fail-closed ERROR verdict,
`compare_many` returns only divergences.
