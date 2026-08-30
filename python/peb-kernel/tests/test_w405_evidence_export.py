"""W4.05 — Evidence-export conformance tests.

Dependency-free, pytest-compatible. Verifies the export runner satisfies the
analyst gate protocol's structural requirements:
  - bounded sample >= 1,000 eligible comparisons
  - all case classes present (clean, refusal, unknown, duplicate_retry,
    stale, drift) — not only clean fixtures
  - every resolved record carries identity/digest lineage
  - drift cases classify as explained_divergence (owned, not silent)
  - zero unexplained divergences and zero infra-errors-as-agreement
  - isolation: zero mutations into the peb store during the run
  - gate metric booleans consistent with the reported counts
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src"))
_SCRIPTS = os.path.normpath(os.path.join(_HERE, "..", "scripts"))
sys.path.insert(0, _SRC)

_spec = importlib.util.spec_from_file_location(
    "run_w405_evidence_export", os.path.join(_SCRIPTS, "run_w405_evidence_export.py")
)
runner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(runner)


def test_full_export_meets_gate_structure():
    export = runner.run(1200, 42, out_dir="/tmp/w405-test-evidence")
    summary = export["summary"]

    # Bounded sample >= 1,000 eligible comparisons
    assert summary["eligible_comparisons"] >= 1000, summary["eligible_comparisons"]

    # All case classes present — not only clean fixtures
    by_case = summary["by_case_class"]
    for case in ("clean", "refusal", "unknown", "duplicate_retry", "stale", "drift"):
        assert by_case.get(case, 0) > 0, f"missing case class: {case}"

    # Zero unexplained divergences, zero infra errors as agreement
    assert summary["unexplained_divergences"] == 0
    assert summary["infra_errors_counted_as_agreement"] == 0
    assert summary["missing_lineage_records"] == 0

    # Gate booleans consistent with counts
    gate = summary["gate_assessment_inputs"]
    assert gate["zero_unexplained"] is True
    assert gate["classified_agreement_meets_0_99"] is True
    assert gate["gate_pass_under_classified_metric"] is True
    # Strict metric honestly reported (drift divergences exist by design)
    assert gate["strict_agreement_meets_0_99"] is False


def test_every_record_has_required_fields_and_lineage_when_resolved():
    export = runner.run(200, 42, out_dir="/tmp/w405-test-evidence")
    for rec in export["records"]:
        for field_name in (
            "at", "request_id", "case_class", "peb_status",
            "adapter_status", "verdict", "disposition", "lineage",
        ):
            assert field_name in rec, f"missing field {field_name}"
        if rec["peb_status"] == "resolved" or rec["adapter_status"] == "resolved":
            lin = rec["lineage"]
            assert lin is not None, f"resolved record without lineage: {rec['request_id']}"
            assert set(lin.keys()) == {"id", "version", "digest"}
            assert lin["digest"].startswith("sha256:")


def test_drift_divergences_are_classified_and_owned():
    export = runner.run(400, 42, out_dir="/tmp/w405-test-evidence")
    drift = [r for r in export["records"] if r["case_class"] == "drift"]
    assert drift, "drift cases must be present in the sample"
    for rec in drift:
        assert rec["verdict"] == "divergent"
        assert rec["disposition"] == "explained_divergence", rec
        assert rec["peb_status"] == "stale"
        assert rec["adapter_status"] == "resolved"


def test_isolation_zero_mutations_and_append_only_inventory():
    export = runner.run(200, 42, out_dir="/tmp/w405-test-evidence")
    # The runner asserts store.mutations == 0 internally; reaching here means
    # isolation held. Additionally verify the inventory was append-only by
    # construction: record count equals comparisons count.
    assert len(export["records"]) == export["summary"]["total_comparisons"]


def test_duplicate_retries_produce_identical_statuses():
    export = runner.run(300, 42, out_dir="/tmp/w405-test-evidence")
    by_rid: dict[str, set[str]] = {}
    for rec in export["records"]:
        if rec["case_class"] == "duplicate_retry":
            by_rid.setdefault(rec["request_id"], set()).add(rec["peb_status"])
    assert by_rid, "duplicate retries must be present"
    for rid, statuses in by_rid.items():
        assert len(statuses) == 1, f"non-deterministic retry for {rid}: {statuses}"


def test_raw_and_summarized_counts_are_consistent():
    export = runner.run(150, 42, out_dir="/tmp/w405-test-evidence")
    summary = export["summary"]
    records = export["records"]
    assert summary["total_comparisons"] == len(records)
    from collections import Counter

    dispositions = Counter(r["disposition"] for r in records)
    assert dict(dispositions) == summary["by_disposition"]
    verdicts = Counter(r["verdict"] for r in records)
    assert dict(verdicts) == summary["by_verdict"]


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
    if failures:
        raise SystemExit(f"{failures} test(s) failed")
    print("W4.05 evidence-export conformance: all tests passed")
