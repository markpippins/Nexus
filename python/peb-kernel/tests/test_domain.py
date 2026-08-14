from __future__ import annotations

import pytest

from peb_kernel.domain import (
    AdmissionPath,
    AdmissionResult,
    CapabilityToken,
    MalformedAdmissionRequest,
    PebStateHash,
    ViolationSeverity,
    ViolationType,
)


def test_admission_tool_mapping_matches_contract():
    assert AdmissionPath.from_tool_name("peb_validate_transition") is AdmissionPath.VALIDATE
    assert AdmissionPath.from_tool_name("peb_record_decision") is AdmissionPath.MUTATE
    assert AdmissionPath.from_tool_name("peb_report_violation") is AdmissionPath.REPORT_VIOLATION
    assert AdmissionPath.from_tool_name("unknown") is AdmissionPath.UNKNOWN
    assert AdmissionPath.UNKNOWN.default_admission_result() is AdmissionResult.ROUTED


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("authority_leakage", ViolationType.AUTHORITY_LEAKAGE),
        ("rcl_violation", ViolationType.RCL),
        ("TRANSFORM_INVALID", ViolationType.TRANSFORM_INVALID),
    ],
)
def test_violation_type_mcp_bridge(raw, expected):
    assert ViolationType.from_mcp_value(raw) is expected


@pytest.mark.parametrize("raw", [None, "", " ", "not_real"])
def test_violation_type_rejects_malformed_values(raw):
    with pytest.raises(MalformedAdmissionRequest):
        ViolationType.from_mcp_value(raw)


@pytest.mark.parametrize("raw", [None, "", "medium"])
def test_violation_severity_rejects_malformed_values(raw):
    with pytest.raises(MalformedAdmissionRequest):
        ViolationSeverity.from_mcp_value(raw)


def test_capability_token_validates_prefix_and_extracts_action():
    token = CapabilityToken("cap:mutate_state:key=invariants")
    assert token.action == "mutate_state"
    with pytest.raises(ValueError):
        CapabilityToken("mutate_state")


def test_state_hash_is_lowercase_sha256_and_prefixed():
    digest = PebStateHash.compute("hello")
    assert len(digest.value) == 64
    assert digest.prefixed() == f"sha256:{digest.value}"
    assert PebStateHash.compute("hello") == digest
    with pytest.raises(ValueError):
        PebStateHash("A" * 64)
