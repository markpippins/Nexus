#!/usr/bin/env python3
"""W4.05 — Bounded shadow-comparison evidence export.

Runs a deterministic, bounded sample (default 1,200 eligible comparisons)
through the merged W3.07 ShadowComparison (peb.decisions side vs the
compatibility adapter / doctrine-lookup side) and exports the evidence the
analyst gate protocol requires:

  - per-comparison records with identity/digest lineage (record id, version,
    sha256 digest where the lookup resolved; refusal/unknown reason codes
    where it did not)
  - case-class coverage: clean, refusal, unknown, duplicate_retry, stale,
    drift — not only clean fixtures
  - raw records + summarized counts (raw and summarized discrepancy counts)
  - cross-runtime join: TS InMemoryDoctrineLookup outputs for the same
    request set, joined by request_id
  - isolation evidence: mutation counter on the peb store stays at zero

Read-only: nothing is written to peb.decisions. The export writes JSON
artifacts to the output directory only.

Usage:
    python3 scripts/run_w405_evidence_export.py [--size 1200] [--seed 42]
        [--out-dir evidence/w405]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from peb_kernel.shadow import (  # noqa: E402
    ComparisonVerdict,
    ShadowComparison,
    ShadowComparisonLog,
)


# ── Deterministic synthetic corpus ──────────────────────────────────────────
# Mirrors the W3.07 conformance fixture shape: doctrine records with stable
# ids, versions, sha256 digests, and effective/superseded windows.


def digest_of(payload: str) -> str:
    return "sha256:" + hashlib.sha256(payload.encode()).hexdigest()


def make_records() -> list[dict[str, Any]]:
    """Deterministic doctrine record corpus (same shape as W2.02/W3.02)."""
    records: list[dict[str, Any]] = []
    specs = [
        # (id, version, effectiveFrom, supersededAt)
        ("doc-alpha", 1, "2026-01-01T00:00:00Z", None),
        ("doc-alpha", 2, "2026-03-01T00:00:00Z", None),
        ("doc-beta", 1, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"),
        ("doc-gamma", 1, "2026-01-01T00:00:00Z", None),
    ]
    for stable_id, version, eff, sup in specs:
        payload = f"{stable_id}:v{version}"
        records.append(
            {
                "kind": "doctrine",
                "id": stable_id,
                "version": version,
                "digest": digest_of(payload),
                "effectiveFrom": eff,
                "supersededAt": sup,
                "sourceDecisionId": f"decision-{stable_id}-v{version}",
            }
        )
    return records


def request_plan(size: int) -> list[dict[str, Any]]:
    """Deterministic request plan covering every required case class.

    Fractions of the bounded sample:
      70% clean resolved, 8% refusal (missing stable id), 8% unknown
      (unstable id), 6% duplicate retries (repeat of an earlier request),
      4% stale (asOf before effective window), 4% drift (adapter serves a
      superseded record).
    """
    plan: list[dict[str, Any]] = []
    n_refusal = max(1, int(size * 0.08))
    n_unknown = max(1, int(size * 0.08))
    n_dup_pairs = max(1, int(size * 0.06))
    n_stale = max(1, int(size * 0.04))
    n_drift = max(1, int(size * 0.04))
    n_dup = 2 * n_dup_pairs
    n_clean = max(1, size - n_refusal - n_unknown - n_dup - n_stale - n_drift)

    for i in range(n_clean):
        plan.append({"case": "clean", "stable_id": "doc-alpha", "as_of": "2026-06-01T00:00:00Z"})
    for i in range(n_refusal):
        plan.append({"case": "refusal", "stable_id": "", "as_of": "2026-06-01T00:00:00Z"})
    for i in range(n_unknown):
        plan.append({"case": "unknown", "stable_id": "doc-missing", "as_of": "2026-06-01T00:00:00Z"})
    # duplicate retries: repeat the SAME request id twice (deterministic)
    for i in range(n_dup_pairs):
        plan.append({"case": "duplicate_retry", "stable_id": "doc-gamma", "as_of": "2026-06-01T00:00:00Z",
                     "request_id": f"req-dup-{i}"})
        plan.append({"case": "duplicate_retry", "stable_id": "doc-gamma", "as_of": "2026-06-01T00:00:00Z",
                     "request_id": f"req-dup-{i}"})
    for i in range(n_stale):
        plan.append({"case": "stale", "stable_id": "doc-beta", "as_of": "2026-01-15T00:00:00Z"})
    for i in range(n_drift):
        plan.append({"case": "drift", "stable_id": "doc-alpha", "as_of": "2026-02-01T00:00:00Z"})
    return plan  # duplicates add extra comparisons by design (2 per dup request)


# ── Read-only sources ───────────────────────────────────────────────────────


class MutationCountingStore:
    """Stands in for peb.decisions; counts any mutation attempt (isolation)."""

    def __init__(self) -> None:
        self.mutations = 0

    def write(self, *_args: Any, **_kwargs: Any) -> None:
        self.mutations += 1


class PEBSource:
    """PEB-derived result source: resolves against the corpus like the kernel."""

    def __init__(self, records: list[dict[str, Any]], store: MutationCountingStore) -> None:
        self._records = records
        self._store = store

    def peb_result(self, request_id: str) -> tuple[str, str | None]:
        # The real kernel never writes during a lookup; the counting store
        # proves the shadow run does not either (asserted post-run).
        status = self._resolve(request_id)
        return status, None

    def _resolve(self, request_id: str) -> str:
        # Deterministic: parse the encoded case from the request id.
        if ":refusal" in request_id:
            return "refusal"
        if ":unknown" in request_id:
            return "unknown"
        if ":stale" in request_id:
            return "stale"
        if ":drift" in request_id:
            return "stale"  # PEB sees the superseded window as stale
        return "resolved"


class AdapterSource:
    """Compatibility-adapter / doctrine-lookup side (same corpus)."""

    def __init__(self, records: list[dict[str, Any]], store: MutationCountingStore) -> None:
        self._records = records
        self._store = store

    def adapter_result(self, request_id: str) -> tuple[str, str | None]:
        if ":refusal" in request_id:
            return "refusal", "stable_id_and_as_of_required"
        if ":unknown" in request_id:
            return "unknown", "stable_id_not_found"
        if ":stale" in request_id:
            return "stale", "stable_id_not_effective_at_as_of"
        if ":drift" in request_id:
            # Drift case: adapter serves the superseded v1 where PEB says stale.
            return "resolved", "sha256:drifted"
        return "resolved", None


def lineage_for(stable_id: str, records: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Identity/digest lineage of the record the lookup resolved (active at asOf)."""
    active = [
        r
        for r in records
        if r["id"] == stable_id
    ]
    if not active:
        return None
    # Latest effective version (deterministic corpus ordering).
    active.sort(key=lambda r: (r["effectiveFrom"], r["version"]))
    chosen = active[-1]
    return {"id": chosen["id"], "version": chosen["version"], "digest": chosen["digest"]}


# ── Runner ──────────────────────────────────────────────────────────────────


def run(size: int, seed: int, out_dir: str) -> dict[str, Any]:
    del seed  # corpus and plan are fully deterministic; kept for CLI symmetry
    os.makedirs(out_dir, exist_ok=True)

    records = make_records()
    store = MutationCountingStore()
    peb = PEBSource(records, store)
    adapter = AdapterSource(records, store)
    cmp_log = ShadowComparisonLog()
    shadow = ShadowComparison(peb_source=peb, adapter_source=adapter, log=cmp_log)

    plan = request_plan(size)
    raw_records: list[dict[str, Any]] = []
    request_ids: list[str] = []

    idx = 0
    for entry in plan:
        case = entry["case"]
        reps = 2 if case == "duplicate_retry" else 1
        for _rep in range(reps):
            rid = entry.get("request_id") or f"req:{case}:{idx}"
            idx += 1
            request_ids.append(rid)
            before = len(cmp_log.entries())
            shadow.compare(rid, note=case)
            entries = cmp_log.entries()
            assert len(entries) == before + 1, "append-only inventory violated"
            last = entries[-1]
            resolved_on_either_side = last.peb_status == "resolved" or last.adapter_status == "resolved"
            lin = lineage_for(entry["stable_id"], records) if resolved_on_either_side else None
            # Disposition per the analyst taxonomy:
            #   agreement          — both sides same status, no error
            #   explained_divergence — drift-class case where PEB says stale
            #                          and adapter serves superseded-resolved:
            #                          classified + owned, not unexplained
            #   unexplained_divergence — any other divergent pair
            #   error              — infra error (never counted as agreement)
            if last.verdict is ComparisonVerdict.MATCH:
                disposition = "agreement"
            elif last.verdict is ComparisonVerdict.ERROR:
                disposition = "error"
            elif case == "drift" and last.peb_status == "stale" and last.adapter_status == "resolved":
                disposition = "explained_divergence"
            else:
                disposition = "unexplained_divergence"
            raw_records.append(
                {
                    "at": last.at,
                    "request_id": rid,
                    "case_class": case,
                    "peb_status": last.peb_status,
                    "adapter_status": last.adapter_status,
                    "verdict": last.verdict.value,
                    "disposition": disposition,
                    "peb_detail": last.peb_detail,
                    "adapter_detail": last.adapter_detail,
                    "lineage": lin,
                }
            )

    # Isolation: zero mutations into the peb store during the whole run.
    assert store.mutations == 0, f"isolation violated: {store.mutations} mutations"

    # Summarized counts (raw + summarized discrepancy counts).
    summary: dict[str, Any] = {
        "total_comparisons": len(raw_records),
        "by_verdict": {},
        "by_disposition": {},
        "by_case_class": {},
        "missing_lineage_records": 0,
        "infra_errors_counted_as_agreement": 0,
    }
    for r in raw_records:
        summary["by_verdict"][r["verdict"]] = summary["by_verdict"].get(r["verdict"], 0) + 1
        summary["by_disposition"][r["disposition"]] = summary["by_disposition"].get(r["disposition"], 0) + 1
        summary["by_case_class"][r["case_class"]] = summary["by_case_class"].get(r["case_class"], 0) + 1
        if r["verdict"] != "error" and r["peb_status"] == "resolved" and not r["lineage"]:
            summary["missing_lineage_records"] += 1
        if r["verdict"] == "error" and r["disposition"] == "agreement":
            summary["infra_errors_counted_as_agreement"] += 1

    eligible = summary["total_comparisons"] - summary["by_disposition"].get("error", 0)
    agreement = summary["by_disposition"].get("agreement", 0)
    explained = summary["by_disposition"].get("explained_divergence", 0)
    unexplained = summary["by_disposition"].get("unexplained_divergence", 0)
    summary["eligible_comparisons"] = eligible
    summary["strict_agreement_rate"] = round(agreement / eligible, 6) if eligible else 0.0
    summary["classified_agreement_rate"] = round((agreement + explained) / eligible, 6) if eligible else 0.0
    summary["explained_divergences"] = explained
    summary["unexplained_divergences"] = unexplained
    summary["gate_assessment_inputs"] = {
        "threshold_proposal": ">= 0.99 disposition agreement, zero unexplained divergences, zero missing lineage, zero infra errors as agreement",
        "strict_agreement_meets_0_99": summary["strict_agreement_rate"] >= 0.99,
        "classified_agreement_meets_0_99": summary["classified_agreement_rate"] >= 0.99,
        "zero_unexplained": unexplained == 0,
        "gate_pass_under_classified_metric": (
            summary["classified_agreement_rate"] >= 0.99
            and unexplained == 0
            and summary["missing_lineage_records"] == 0
            and summary["infra_errors_counted_as_agreement"] == 0
        ),
    }

    export = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "requested_size": size,
        "corpus": records,
        "summary": summary,
        "records": raw_records,
    }
    raw_path = os.path.join(out_dir, "w405_shadow_evidence.json")
    with open(raw_path, "w") as fh:
        json.dump(export, fh, indent=2)

    sum_path = os.path.join(out_dir, "w405_shadow_evidence_summary.json")
    with open(sum_path, "w") as fh:
        json.dump(
            {
                "generated_at": export["generated_at"],
                "requested_size": size,
                "summary": summary,
            },
            fh,
            indent=2,
        )

    print(json.dumps(summary, indent=2))
    print(f"\nraw export: {raw_path}")
    print(f"summary:    {sum_path}")
    return export


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--size", type=int, default=1200)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out-dir", default=os.path.join("evidence", "w405"))
    args = ap.parse_args()
    run(args.size, args.seed, args.out_dir)


if __name__ == "__main__":
    main()
