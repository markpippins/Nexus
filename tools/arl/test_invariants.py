"""Tests for tools/arl/invariants.py — the reconciled quarantine-envelope contract.

Locks the Wave-4 resolution of the cir1 patch/linter contradiction: patch.py
writes a sanctioned envelope ({status: quarantined_CIRn|blocked_by_CIRn,
reason, original}); ARL I1 must NOT flag object-valued `original` inside that
envelope (it is the wrapped value, not recursion), and must NOT count two
sibling envelopes as nesting. Recursion is only envelope-inside-envelope.

Run with:
    python3 -m pytest tools/arl/test_invariants.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import invariants as inv  # noqa: E402


def _envelope(status="quarantined_CIR3", reason="missing_execution_contract", original=None):
    return {"status": status, "reason": reason, "original": original}


# ─── sanctioned envelope: object-valued original is exempt ───────────────────

def test_envelope_object_original_not_recursive():
    """The contradiction: patch.py wraps an object; ARL must not flag it."""
    data = {"payload": _envelope(original={"state": "executing", "mode": "legacy"})}
    assert inv._has_unsanctioned_original(data) is False
    assert inv._has_nested_envelope(data) is False


def test_envelope_list_original_not_recursive():
    data = {"payload": _envelope(original=[{"a": 1}, {"b": 2}])}
    assert inv._has_unsanctioned_original(data) is False


def test_sibling_envelopes_not_nested():
    """Two sibling quarantined fields in one file are legitimate patch.py
    output — the old raw-count heuristic flagged them as NESTED_QUARANTINE."""
    data = {
        "a": _envelope(status="quarantined_CIR3", original={"x": 1}),
        "b": _envelope(status="blocked_by_CIR2", original={"y": 2}),
    }
    assert inv._has_nested_envelope(data) is False


# ─── bare original wrappers are still flagged ────────────────────────────────

def test_bare_original_object_flagged():
    """An `original` key with object value OUTSIDE a sanctioned envelope is
    recursive wrapping — must stay RECURSIVE_WRAPPER."""
    data = {"original": {"state": "executing"}}
    assert inv._has_unsanctioned_original(data) is True


def test_bare_original_nested_object_flagged():
    data = {"wrapper": {"original": {"deep": {"x": 1}}}}
    assert inv._has_unsanctioned_original(data) is True


# ─── true recursion: envelope inside envelope payload ────────────────────────

def test_envelope_inside_envelope_flagged():
    """patch.py double-applying would produce an envelope nested inside another
    envelope's `original` — that is genuine recursion (NESTED_QUARANTINE)."""
    inner = _envelope(original={"state": "executing"})
    data = {"outer": _envelope(original=inner)}
    assert inv._has_nested_envelope(data) is True


def test_envelope_inside_list_original_flagged():
    inner = _envelope(original={"state": "executing"})
    data = {"outer": _envelope(original=[inner])}
    assert inv._has_nested_envelope(data) is True


# ─── end-to-end through i1 ───────────────────────────────────────────────────

def test_i1_passes_sanctioned_envelope(tmp_path):
    """A real patched file (like .agents/skill-pipeline.json) must not trip I1."""
    p = tmp_path / "artifact.json"
    p.write_text('{\n  "payload": {\n    "status": "blocked_by_CIR2",\n'
                 '    "reason": "cross_layer_reference_detected",\n'
                 '    "original": {"nested": true}\n  }\n}\n')
    violations = []
    inv.i1_no_recursive_wrappers([p], violations)
    assert violations == []


def test_i1_flags_bare_wrapper(tmp_path):
    p = tmp_path / "artifact.json"
    p.write_text('{\n  "original": {"state": "executing"}\n}\n')
    violations = []
    inv.i1_no_recursive_wrappers([p], violations)
    assert any(v["violation_type"] == "RECURSIVE_WRAPPER" for v in violations)


def test_i1_flags_nested_envelope(tmp_path):
    p = tmp_path / "artifact.json"
    p.write_text('{\n  "outer": {\n    "status": "quarantined_CIR3",\n'
                 '    "reason": "missing_execution_contract",\n'
                 '    "original": {"status": "quarantined_CIR3",\n'
                 '                 "reason": "missing_execution_contract",\n'
                 '                 "original": {"state": "x"}}\n  }\n}\n')
    violations = []
    inv.i1_no_recursive_wrappers([p], violations)
    assert any(v["violation_type"] == "NESTED_QUARANTINE" for v in violations)
