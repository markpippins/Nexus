from __future__ import annotations

import json
from pathlib import Path

import pytest

from governance_envelope import BindingValidationError, binding_idempotency_key, validate_binding_decision


FIXTURES = Path(__file__).resolve().parents[1] / "jvm" / "binding-contract-fixtures.json"


def test_jvm_binding_fixture_contract():
    doc = json.loads(FIXTURES.read_text())
    assert doc["contract_version"] == 1
    assert doc["authority_level"] == "advisory"
    base = next(v for v in doc["vectors"] if v["id"] == "binding-allow-001")["decision"]
    validated = validate_binding_decision(base, expected_subject_id="candidate-1")
    assert binding_idempotency_key(base) == (
        "peb:binding:decision-1:sha256:" + "ab" * 32
    )
    assert validated.to_dict()["authority_level"] == "advisory"


def test_jvm_negative_vectors_fail_or_preserve_disposition():
    doc = json.loads(FIXTURES.read_text())
    base = next(v for v in doc["vectors"] if v["id"] == "binding-allow-001")["decision"]
    for vector in doc["vectors"]:
        if vector["id"] == "binding-allow-001":
            continue
        raw = dict(base)
        raw.update(vector.get("mutations", {}))
        expected = vector["expected"]
        if expected["valid"]:
            assert validate_binding_decision(raw).to_dict()["disposition"] == expected["disposition"]
        else:
            with pytest.raises(BindingValidationError):
                validate_binding_decision(raw, expected_subject_id="candidate-1")
