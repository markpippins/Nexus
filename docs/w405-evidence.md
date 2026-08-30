# W4.05 — Bounded Shadow-Comparison Evidence (Gate Protocol)

**Status:** Engineer evidence delivered (PR #100). Read-only — the runner
writes nothing into `peb.decisions`; it only exports JSON artifacts.

## Purpose

The Analyst requires verifiable artifacts before computing parity for the
W4.05 gate. This deliverable produces all seven requested artifact classes
from the **merged W3.07 shadow machinery** (`peb_kernel/shadow.py`, main
commit `8cdd0642` / PR #96) — no new authority, no new gameplay.

## Gate protocol (analyst proposal, pending Architect/DBA approval)

- ≥ 99.0 % disposition agreement over ≥ 1,000 eligible comparisons
- Zero unexplained divergences, zero missing-lineage records
- Zero infrastructure errors counted as agreement
- Every disagreement classified and owned
- Sample covers eligible inputs, refusal/unknown, duplicate retries,
  stale data, drift cases — not only clean fixtures

## How to run

```bash
cd python/peb-kernel
python3 -m pytest tests/test_w405_evidence_export.py -q   # conformance
python3 scripts/run_w405_evidence_export.py --size 1200 --seed 42 \
        --out-dir evidence/w405                            # fresh sample
```

## Comparison-record schema

| Field | Type | Meaning |
|-------|------|---------|
| `at` | ISO-8601 (UTC, Z) | timestamp of the comparison |
| `request_id` | string | stable identity of the compared request |
| `case_class` | enum | clean, refusal, unknown, duplicate_retry, stale, drift |
| `peb_status` | string | PEB-derived status (resolved/refusal/unknown/stale/error) |
| `adapter_status` | string | compatibility-adapter status |
| `verdict` | enum | match / divergent / error (W3.07 vocabulary) |
| `disposition` | enum | agreement / explained_divergence / unexplained_divergence / error |
| `lineage` | object \| null | `{id, version, digest}` of the resolved record |
| `peb_detail` / `adapter_detail` | string \| null | reason codes |

## Results of the attached run

| Metric | Value |
|--------|-------|
| Eligible comparisons | 1,344 |
| Agreement | 1,296 |
| Explained divergence (drift, classified + owned) | 48 |
| Unexplained divergence | 0 |
| Infrastructure errors | 0 |
| Missing-lineage records | 0 |
| Strict agreement rate | 96.43 % |
| Classified agreement rate | 100 % |

The drift cases are **by-design** divergences (adapter serves a superseded
record where PEB correctly reports `stale`); they are classified and owned,
not silent.

## Open ruling (Architect/DBA)

The gate outcome hinges on the metric reading:
- **Strict** agreement ≥ 99 % → sample **fails** (96.43 %); drift-class
  handling would need rework before any activation.
- **Classified** agreement ≥ 99 % with zero unexplained → sample **passes**.

Engineer does not self-authorize either reading. `peb.decisions` remains
advisory; no blocking authority is activated by this work.
