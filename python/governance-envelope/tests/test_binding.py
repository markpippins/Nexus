from __future__ import annotations

import copy

import pytest

from governance_envelope import (
    BindingValidationError,
    binding_idempotency_key,
    validate_binding_decision,
)

FP = "sha256:" + "ab" * 32


def decision() -> dict:
    return {
        "binding_contract_version": 1,
        "decision_class": "deny_contract_promotion",
        "contract": {"id": "promotion-contract", "version": "1"},
        "proposition_id": "pg:ready",
        "doctrine_ids": ["law-1"],
        "evaluator": {"id": "sol", "version": "1"},
        "evidence_ids": ["evidence-1"],
        "subject_id": "candidate-1",
        "work_item_id": "work-1",
        "as_of": "2026-09-01T12:00:00.000000Z",
        "disposition": "allow",
        "authority_level": "advisory",
        "evaluation_fingerprint": FP,
        "decision_id": "decision-1",
        "evidence_fresh": True,
        "replay_context": "attempt-1",
    }


def test_valid_decision_is_immutable_and_advisory():
    result = validate_binding_decision(decision())
    assert result.subject_id == "candidate-1"
    assert result.authority_level == "advisory"
    assert result.lineage_fingerprint.startswith("sha256:")
    assert result.to_dict()["disposition"] == "allow"


def test_missing_identity_fails_closed():
    raw = decision()
    raw.pop("evidence_ids")
    with pytest.raises(BindingValidationError):
        validate_binding_decision(raw)


@pytest.mark.parametrize(("field", "value"), [
    ("decision_class", "other-class"),
    ("authority_level", "blocking"),
    ("disposition", "maybe"),
    ("evidence_fresh", False),
])
def test_unauthorized_or_invalid_values_fail_closed(field, value):
    raw = decision()
    raw[field] = value
    with pytest.raises(BindingValidationError):
        validate_binding_decision(raw)


def test_subject_work_item_and_replay_context_are_bound():
    with pytest.raises(BindingValidationError, match="subject binding"):
        validate_binding_decision(decision(), expected_subject_id="other")
    with pytest.raises(BindingValidationError, match="work-item binding"):
        validate_binding_decision(decision(), expected_work_item_id="other")
    with pytest.raises(BindingValidationError, match="replay context"):
        validate_binding_decision(decision(), expected_replay_context="attempt-2")


def test_lineage_and_idempotency_are_deterministic():
    first = validate_binding_decision(decision())
    second = validate_binding_decision(copy.deepcopy(decision()))
    assert first.lineage_fingerprint == second.lineage_fingerprint
    assert binding_idempotency_key(decision()) == binding_idempotency_key(second.to_dict())


def test_negative_dispositions_are_explicit():
    for disposition in ("refused", "unknown", "stale", "drift", "quarantined", "superseded", "rolled_back"):
        raw = decision()
        raw["disposition"] = disposition
        assert validate_binding_decision(raw).to_dict()["disposition"] == disposition
