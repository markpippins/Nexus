"""Conformance tests for tools/authority/check_authority.py.

Exercises the three failure classes (no-authority, duplicate-class,
unlisted-projection) against synthetic matrices plus the green real-matrix
case. Run with:

    python3 -m pytest tools/authority/test_check_authority.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_authority as ca  # noqa: E402


def _entry(domain, canonical, superseded=None, projections=None):
    return {
        "domain": domain,
        "canonical": canonical,
        "kind": "json-schema",
        "superseded": superseded or [],
        "projections": projections or [],
        "note": "",
    }


def _matrix(authorities):
    return {
        "version": 1,
        "semantic_class_keys": {
            "execution_state": ["execution_state", "state"],
            "decision": ["decision", "result", "score"],
        },
        "authorities": authorities,
    }


REAL_WR = "schemas/wrp/work-request.schema.json"


# ─── no-authority ────────────────────────────────────────────────────────────

def test_no_authority_empty_canonical():
    m = _matrix([_entry("orphan", "")])
    v = ca.check_registry(m)
    assert any(x["failure_class"] == "no-authority" and x["domain"] == "orphan" for x in v)


def test_no_authority_missing_file():
    m = _matrix([_entry("ghost", "does/not/exist.schema.json")])
    v = ca.check_registry(m)
    assert any(
        x["failure_class"] == "no-authority" and "does not exist" in x["detail"] for x in v
    )


def test_no_authority_duplicate_canonical():
    m = _matrix([_entry("a", REAL_WR), _entry("b", REAL_WR)])
    v = ca.check_registry(m)
    assert any(
        x["failure_class"] == "no-authority" and "multiple domains" in x["detail"] for x in v
    )


# ─── duplicate-class ─────────────────────────────────────────────────────────

def test_duplicate_class_two_authoritative_files():
    m = _matrix([_entry("a", "f1.json"), _entry("b", "f2.json")])
    idx = {"decision": [("f1.json", "result"), ("f2.json", "result")]}
    v = ca.check_duplicate_class(m, idx)
    assert any(x["failure_class"] == "duplicate-class" for x in v)


def test_duplicate_class_superseded_is_excluded():
    m = _matrix([_entry("a", "f1.json", superseded=["old.json"])])
    idx = {"decision": [("f1.json", "result"), ("old.json", "result")]}
    v = ca.check_duplicate_class(m, idx)
    assert v == []


# ─── unlisted-projection ─────────────────────────────────────────────────────

def test_unlisted_projection_missing_file():
    m = _matrix([_entry("a", REAL_WR, projections=["nope/proj.sql"])])
    v = ca.check_registry(m)
    assert any(x["failure_class"] == "unlisted-projection" for x in v)


# ─── green: the committed matrix must validate ───────────────────────────────

def test_real_matrix_passes():
    matrix = ca.load_matrix()
    violations = ca.run_checks(matrix)
    assert violations == []
