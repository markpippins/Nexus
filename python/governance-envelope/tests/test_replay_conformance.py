"""W1.09 replay-conformance tests: corpus verdicts + drift taxonomy.

Complements bin/run_replay_conformance.py (the standalone AC2-AC6 harness)
with pytest-native coverage so `pytest nexus/python/governance-envelope`
exercises the replay layer directly.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# pythonpath=["src"] in pyproject.toml makes governance_envelope importable
# under pytest; fixtures live beside this file and resolve naturally.
from governance_envelope import replay as rp  # noqa: E402

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "replay_fixtures"
CORPUS = [json.loads(p.read_text()) for p in sorted(FIXTURE_DIR.glob("*.json"))]

EXPECTED_VERDICTS = {
    "F01_allow_with_receipt": ["replay_ok"],
    "F02_reject_plain": ["replay_ok"],
    "F03_refuse_unknown_context": ["replay_ok"],
    "F04_stale_doctrine": ["stale_doctrine"],
    "F05_contract_digest_drift": ["drift_confirmed"],
    "F06_duplicate_retry": ["replay_ok", "duplicate_retry"],
    "F07_doctrine_change_mid_workflow": ["replay_ok", "stale_doctrine"],
}

CATEGORIES = {
    "F04_stale_doctrine": {0: rp.DRIFT_DOCTRINE},
    "F05_contract_digest_drift": {0: rp.DRIFT_CONTRACT},
    "F06_duplicate_retry": {1: rp.DRIFT_RECEIPT_LINEAGE},
    "F07_doctrine_change_mid_workflow": {1: rp.DRIFT_DOCTRINE},
}


def _views(doc):
    for idx in range(len(doc["attempts"])):
        yield idx, {
            "law_registry": doc["law_registry"],
            "contract_registry": doc["contract_registry"],
            "expected": doc["expected_outcomes"][idx],
            "prior_admission_consumed":
                bool(doc.get("retry_after_admission")) and idx > 0,
            "envelope": doc["attempts"][idx]["envelope"],
        }


@pytest.mark.parametrize("doc", CORPUS, ids=lambda d: d["fixture_id"])
def test_fixture_verdicts(doc):
    fid = doc["fixture_id"]
    results = [rp.replay_envelope(v) for _, v in _views(doc)]
    got = [r["verdict"] for r in results]
    assert got == EXPECTED_VERDICTS[fid], (
        f"{fid}: expected {EXPECTED_VERDICTS[fid]}, got {got}")
    for idx, cat in CATEGORIES.get(fid, {}).items():
        assert results[idx]["category"] == cat


@pytest.mark.parametrize("doc", CORPUS, ids=lambda d: d["fixture_id"])
def test_replay_deterministic(doc):
    """AC2 - identical captured inputs reproduce identical verdict JSON."""
    for idx, view in _views(doc):
        a = rp.replay_envelope(view)
        b = rp.replay_envelope(json.loads(json.dumps(view)))
        assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_fingerprint_roundtrip_all_vectors():
    for doc in CORPUS:
        for idx, v in _views(doc):
            ok, recomputed = rp.envelope_fingerprint_check(v["envelope"])
            assert ok, f"{doc['fixture_id']}[{idx}] fingerprint drift"


def test_drift_matrix_categories():
    base_doc = next(d for d in CORPUS
                    if d["fixture_id"] == "F01_allow_with_receipt")
    base_view = next(_views(base_doc))[1]
    matrix = [
        ("contract.contract_digest", rp.DRIFT_CONTRACT),
        ("law.proposition_ids", rp.DRIFT_DOCTRINE),
        ("law.posture_ids", rp.DRIFT_DOCTRINE),
        ("law.frame_values", rp.DRIFT_FRAME),
        ("inputs.input_snapshot_id", rp.DRIFT_INPUT),
        ("evaluation.evaluated_at", rp.DRIFT_EVALUATOR),
        ("authority.peb_transaction_id", rp.DRIFT_RECEIPT_LINEAGE),
    ]
    for path, category in matrix:
        out = rp.drift_verdict(base_view, path,
                               "sha256:" + "ff" * 32 if "digest" in path else None)
        assert out["signal_emitted"], path
        assert out["category"] == category, path


def test_unknown_mutation_path_fails_closed():
    """Fail-closed: unknown keys never map into the drift taxonomy."""
    with pytest.raises(rp.ReplayError):
        rp.classify_drift("made.up.path")


def test_jvm_manifest_present_and_stable():
    manifest = json.loads((FIXTURE_DIR.parent / "jvm" / "expected-digests.json")
                          .read_text())
    assert manifest["spec_item"] == "W1.09"
    vector_count = sum(len(d["attempts"]) for d in CORPUS)
    assert len(manifest["vectors"]) == vector_count
    for v in manifest["vectors"]:
        # every recorded digest still verifies against the corpus
        doc = next(d for d in CORPUS if d["fixture_id"] == v["fixture"])
        env = doc["attempts"][v["attempt_index"]]["envelope"]
        ok, _ = rp.envelope_fingerprint_check(env)
        assert ok
