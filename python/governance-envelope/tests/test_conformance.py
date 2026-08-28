"""Conformance tests for the governance envelope fingerprint (W1.11).

Covers the W1.04 spec §5 golden vectors: positive vectors, canonical
independence, mutation vectors, and fail-closed behavior.
"""

from __future__ import annotations

import copy

import pytest

from governance_envelope import (
    FingerprintError,
    canonical_json,
    canonicalize,
    evaluate_fingerprint,
)
from fixtures import POSITIVE_VECTORS, V1_ENVELOPE


# ---------------------------------------------------------------------------
# 5.1 positive vectors
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("name", list(POSITIVE_VECTORS))
def test_positive_vectors_match_golden(name: str) -> None:
    envelope, expected = POSITIVE_VECTORS[name]
    assert evaluate_fingerprint(envelope) == expected


def test_replay_is_deterministic() -> None:
    first = evaluate_fingerprint(V1_ENVELOPE)
    second = evaluate_fingerprint(copy.deepcopy(V1_ENVELOPE))
    assert first == second


# ---------------------------------------------------------------------------
# 5.2 canonical-independence checks (must NOT change the fingerprint)
# ---------------------------------------------------------------------------

def test_key_order_does_not_change_fingerprint() -> None:
    def reorder(obj):
        if isinstance(obj, dict):
            return {k: reorder(v) for k, v in reversed(list(obj.items()))}
        if isinstance(obj, list):
            return [reorder(v) for v in obj]
        return obj

    base = evaluate_fingerprint(V1_ENVELOPE)
    assert evaluate_fingerprint(reorder(copy.deepcopy(V1_ENVELOPE))) == base


def test_timestamp_offset_equivalent_to_z() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["created_at"] = "2026-08-26T06:41:44.868000+00:00"
    assert evaluate_fingerprint(env) == evaluate_fingerprint(V1_ENVELOPE)


def test_uppercase_uuid_normalizes() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["envelope_id"] = "3B7E8F2A-1C4D-4E5F-9A0B-C6D7E8F9A0B1"
    assert evaluate_fingerprint(env) == evaluate_fingerprint(V1_ENVELOPE)


def test_int_and_float_1_are_equivalent() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["law"]["frame_values"] = [
        {"frame": "execution_backend", "value": "interactive"},
        {"frame": "environment", "value": "production"},
        {"frame": "rate_limit", "value": 1.0},
    ]
    a = evaluate_fingerprint(env)
    env["law"]["frame_values"][2]["value"] = 1
    assert evaluate_fingerprint(env) == a


def test_set_ordered_array_reorder_does_not_change() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["law"]["proposition_ids"] = [
        "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        "11111111-2222-4333-8444-555555555555",
    ]
    assert evaluate_fingerprint(env) == evaluate_fingerprint(V1_ENVELOPE)


def test_transport_metadata_excluded() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["transport"] = {"broker_offset": 42, "headers": {"x-request-id": "abc"}}
    assert evaluate_fingerprint(env) == evaluate_fingerprint(V1_ENVELOPE)


def test_unknown_top_level_key_stripped() -> None:
    """Architect ruling 2026-08-27: unknown/extension keys are stripped."""
    env = copy.deepcopy(V1_ENVELOPE)
    env["mystery_extension"] = {"x": 1}
    assert evaluate_fingerprint(env) == evaluate_fingerprint(V1_ENVELOPE)


# ---------------------------------------------------------------------------
# 5.3 mutation vectors (must change the fingerprint)
# ---------------------------------------------------------------------------

def _mutate(**patches) -> dict:
    env = copy.deepcopy(V1_ENVELOPE)
    for group, patch in patches.items():
        if isinstance(env.get(group), dict):
            env[group] = {**env[group], **patch}
        else:
            env[group] = patch
    return env


@pytest.mark.parametrize(
    "name,patched",
    [
        ("M1 contract_digest", {"contract": {"contract_digest": "sha256:" + "ab" * 31 + "ff"}}),
        ("M2 drop proposition", {"law": {"proposition_ids": ["11111111-2222-4333-8444-555555555555"]}}),
        ("M3 posture value", {"law": {"posture_ids": ["qqqqqqqq-2222-4333-8444-555555555555"]}}),
        ("M4 input_snapshot_id", {"inputs": {"input_snapshot_id": "22222222-2222-4333-8444-555555555555"}}),
        ("M5 evaluated_at +1s", {"evaluation": {"evaluated_at": "2026-08-26T14:41:26.000000Z"}}),
        ("M6 disposition refuse", {"evaluation": {"disposition": "refuse"}}),
        ("M7 evidence_id", {"evidence": {"evidence_ids": ["ffffffff-2222-4667-8888-999999999999"]}}),
        ("M8 reorder assertion_results", {"evaluation": {"assertion_results": [
            {"proposition_id": "11111111-2222-4333-8444-555555555555", "result": True},
            {"proposition_id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "result": True},
        ]}}),
    ],
)
def test_mutation_changes_fingerprint(name: str, patched: dict) -> None:
    base = evaluate_fingerprint(V1_ENVELOPE)
    assert evaluate_fingerprint(_mutate(**patched)) != base


# ---------------------------------------------------------------------------
# 5.4 fail-closed vectors
# ---------------------------------------------------------------------------

def test_relative_iri_fails_closed() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["semantic"]["@context"] = "context/governance/v1"  # relative
    with pytest.raises(FingerprintError):
        evaluate_fingerprint(env)


def test_naive_timestamp_fails_closed() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["evaluation"]["evaluated_at"] = "2026-08-26T14:41:25"  # no zone
    with pytest.raises(FingerprintError):
        evaluate_fingerprint(env)


def test_nan_fails_closed() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["law"]["frame_values"].append({"frame": "x", "value": float("nan")})
    with pytest.raises(FingerprintError):
        evaluate_fingerprint(env)


def test_unsupported_value_type_fails_closed() -> None:
    env = copy.deepcopy(V1_ENVELOPE)
    env["evaluation"]["diagnostics"] = {"blob": b"\x00\x01"}
    with pytest.raises(FingerprintError):
        evaluate_fingerprint(env)


# ---------------------------------------------------------------------------
# canonical form sanity
# ---------------------------------------------------------------------------

def test_canonical_form_is_compact_sorted_json() -> None:
    canonical = canonicalize(V1_ENVELOPE, "envelope")
    payload = canonical_json(canonical)
    assert "\n" not in payload
    assert " " not in payload
    # keys lexicographically sorted at top level
    import json as _json
    keys = list(_json.loads(payload).keys())
    assert keys == sorted(keys)


def test_canonicalize_returns_plain_json_types() -> None:
    canonical = canonicalize(V1_ENVELOPE, "envelope")
    assert isinstance(canonical, dict)
    assert canonical["envelope_id"] == "3b7e8f2a-1c4d-4e5f-9a0b-c6d7e8f9a0b1"
    # RFC 3986 6.2.2: scheme+host lowercased, path case preserved
    assert canonical["semantic"]["@context"] == "https://nexus.local/CONTEXT/GOVERNANCE/V1"