"""Wave-2 candidate-to-envelope adapter tests."""

from __future__ import annotations

import copy

from governance_envelope import assess_candidate, evaluate_fingerprint
from fixtures import V1_ENVELOPE


def _candidate() -> dict:
    envelope = copy.deepcopy(V1_ENVELOPE)
    envelope.pop("fingerprint", None)
    return {
        "id": envelope["semantic"]["subject_id"],
        **{key: copy.deepcopy(envelope[key]) for key in (
            "created_at", "contract", "semantic", "workflow", "law",
            "execution", "inputs", "evaluation", "evidence",
        )},
        "ignored_metadata": {"source": "to-do"},
    }


def test_allow_candidate_gets_deterministic_fingerprint() -> None:
    candidate = _candidate()
    first = assess_candidate(candidate)
    second = assess_candidate(copy.deepcopy(candidate))

    assert first.admitted is True
    assert first.disposition == "allow"
    assert first.evaluation_fingerprint == second.evaluation_fingerprint
    assert first.envelope["fingerprint"]["evaluation_fingerprint"] == first.evaluation_fingerprint
    assert "ignored_metadata" in candidate


def test_missing_contract_refuses_without_defaults() -> None:
    candidate = _candidate()
    candidate.pop("contract")

    result = assess_candidate(candidate)

    assert result.admitted is False
    assert result.disposition == "refuse"
    assert "missing candidate fields" in result.reason


def test_unknown_evaluation_refuses() -> None:
    candidate = _candidate()
    candidate["evaluation"]["unknowns"] = ["context:unknown"]

    result = assess_candidate(candidate)

    assert result.admitted is False
    assert result.reason == "unknown_context"


def test_conflicting_fingerprint_refuses() -> None:
    candidate = _candidate()
    candidate["envelope"] = copy.deepcopy(V1_ENVELOPE)
    candidate["envelope"]["fingerprint"] = {
        "evaluation_fingerprint": "sha256:" + "00" * 32,
    }

    result = assess_candidate(candidate)

    assert result.admitted is False
    assert result.reason == "fingerprint_mismatch"


def test_fingerprint_matches_reference_without_own_group() -> None:
    candidate = _candidate()
    result = assess_candidate(candidate)
    core = copy.deepcopy(result.envelope)
    core.pop("fingerprint")

    assert result.evaluation_fingerprint == evaluate_fingerprint(core)
