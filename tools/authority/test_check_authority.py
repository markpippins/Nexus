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
            "ir_layer": ["metadata.mode"],
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


def test_manifest_source_from_projection_flagged():
    matrix = ca.load_matrix()
    fake = {"projections": [
        {"sourceSchema": "schemas/core/work-request.jsonld",  # a projection, not canonical
         "targetFormat": "json-ld", "outputPath": "x", "active": True},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert any("projection" in x["detail"] for x in v if x["failure_class"] == "unlisted-projection")


def test_manifest_source_from_superseded_flagged():
    matrix = ca.load_matrix()
    fake = {"projections": [
        {"sourceSchema": ".agents/schema/work_request.schema.json",  # superseded
         "targetFormat": "json-ld", "outputPath": "x", "active": True},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert any("superseded" in x["detail"] for x in v if x["failure_class"] == "unlisted-projection")


# ─── intent-vs-state split ─────────────────────────────────────────────────

def test_mode_is_ir_layer_not_execution_state():
    matrix = ca.load_matrix()
    keys = matrix["semantic_class_keys"]
    # `mode` is overloaded (pipeline `mode: execute` vs IR-layer `metadata.mode`),
    # so it must be tracked as a *qualified* key, never a flat execution_state alias
    assert "metadata.mode" in keys["ir_layer"]
    assert "mode" not in keys["ir_layer"]
    assert "mode" not in keys["execution_state"]


def test_real_scan_has_single_authority_per_class():
    matrix = ca.load_matrix()
    index = ca.collect_semantic_classes(matrix, list(ca.iter_json_files()))
    # every detected class must resolve to exactly one authoritative file
    v = ca.check_duplicate_class(matrix, index)
    assert v == []
    # and the IR layer class must resolve to the canonical work-request schema
    ir_files = {rel for rel, _ in index.get("ir_layer", [])}
    assert ir_files == {"schemas/wrp/work-request.schema.json"}


def test_manifest_sources_are_canonical():
    matrix = ca.load_matrix()
    v = ca.check_manifest(matrix)
    assert v == []


def test_manifest_active_output_missing_flagged():
    matrix = ca.load_matrix()
    fake = {"projections": [
        {"sourceSchema": "schemas/wrp/work-request.schema.json",
         "targetFormat": "typescript-type",
         "outputPath": "nope/missing.model.ts",
         "active": True, "verify": {"mode": "exists"}},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert any(x["failure_class"] == "projection-drift" and "missing" in x["detail"] for x in v)


def test_manifest_digest_mismatch_flagged():
    matrix = ca.load_matrix()
    fake = {"projections": [
        {"sourceSchema": "schemas/wrp/work-request.schema.json",
         "targetFormat": "json-ld",
         "outputPath": "schemas/core/work-request.jsonld",
         "active": True, "verify": {"mode": "digest", "algorithm": "sha256", "digest": "0" * 64}},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert any(x["failure_class"] == "projection-drift" and "digest mismatch" in x["detail"] for x in v)


def test_manifest_digest_match_passes():
    matrix = ca.load_matrix()
    real_digest = ca.file_digest("schemas/core/work-request.jsonld")
    fake = {"projections": [
        {"sourceSchema": "schemas/wrp/work-request.schema.json",
         "targetFormat": "json-ld",
         "outputPath": "schemas/core/work-request.jsonld",
         "active": True, "verify": {"mode": "digest", "algorithm": "sha256", "digest": real_digest}},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert v == []


# ─── green: the committed matrix must validate ───────────────────────────────

def test_real_matrix_passes():
    matrix = ca.load_matrix()
    violations = ca.run_checks(matrix)
    assert violations == []
