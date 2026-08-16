"""Conformance tests for tools/authority/check_authority.py.

Exercises the three failure classes (no-authority, duplicate-class,
unlisted-projection) against synthetic matrices plus the green real-matrix
case. Run with:

    python3 -m pytest tools/authority/test_check_authority.py -v
"""

import hashlib
import os
import shutil
import sys
import tempfile
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


REAL_WR = "schemas/validation/wrp/work-request.schema.json"


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


# ─── tombstone superseded records ────────────────────────────────────────────

def test_tombstone_superseded_does_not_require_disk():
    # A deleted, superseded artifact recorded as a tombstone must not be
    # flagged as no-authority just because the file no longer exists (the
    # record is the durable provenance — D-2026-08-16-003).
    m = _matrix([_entry("a", REAL_WR, superseded=[{
        "path": ".agents/schema/work_request.schema.json",
        "status": "tombstoned",
        "supersededBy": REAL_WR,
        "note": "deleted draft",
    }])])
    v = ca.check_registry(m)
    assert all(x["failure_class"] != "no-authority" for x in v)


def test_tombstone_missing_required_field_flagged():
    # A tombstone without its path or supersededBy is a malformed record.
    m = _matrix([_entry("a", REAL_WR, superseded=[{
        "status": "tombstoned",
    }])])
    v = ca.check_registry(m)
    assert any("missing required field" in x["detail"] for x in v)


def test_tombstone_wrong_status_flagged():
    m = _matrix([_entry("a", REAL_WR, superseded=[{
        "path": "old.json",
        "status": "banana",
        "supersededBy": REAL_WR,
    }])])
    v = ca.check_registry(m)
    assert any("expected 'tombstoned'" in x["detail"] for x in v)


def test_tombstone_excluded_from_duplicate_class():
    # Tombstoned paths stay in the superseded set so they never count as an
    # authoritative semantic-class claimant.
    m = _matrix([_entry("a", "f1.json", superseded=[{
        "path": "old.json", "status": "tombstoned", "supersededBy": "f1.json",
    }])])
    idx = {"decision": [("f1.json", "result"), ("old.json", "result")]}
    v = ca.check_duplicate_class(m, idx)
    assert v == []


# ─── migration edge ──────────────────────────────────────────────────────────

def test_migration_edge_unknown_domain_flagged():
    entry = _entry("conduit_wr_dco", "python/conduit/work_request.py")
    entry["migration_edge"] = "no_such_domain"
    m = _matrix([_entry("work_request", REAL_WR), entry])
    v = ca.check_registry(m)
    assert any("migration_edge" in x["detail"] for x in v)


def test_migration_edge_known_domain_passes():
    entry = _entry("conduit_wr_dco", "python/conduit/work_request.py")
    entry["migration_edge"] = "work_request"
    m = _matrix([_entry("work_request", REAL_WR), entry])
    v = ca.check_registry(m)
    assert not any("migration_edge" in x["detail"] for x in v)


# ─── unlisted-projection ─────────────────────────────────────────────────────

def test_unlisted_projection_missing_file():
    m = _matrix([_entry("a", REAL_WR, projections=["nope/proj.sql"])])
    v = ca.check_registry(m)
    assert any(x["failure_class"] == "unlisted-projection" for x in v)


def test_manifest_source_from_projection_flagged():
    matrix = ca.load_matrix()
    fake = {"projections": [
        {"sourceSchema": "schemas/ontology/core/work-request.jsonld",  # a projection, not canonical
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
    assert ir_files == {"schemas/validation/wrp/work-request.schema.json"}


def test_manifest_sources_are_canonical():
    matrix = ca.load_matrix()
    v = ca.check_manifest(matrix)
    assert v == []


def test_manifest_active_output_missing_flagged():
    matrix = ca.load_matrix()
    fake = {"projections": [
        {"sourceSchema": "schemas/validation/wrp/work-request.schema.json",
         "targetFormat": "typescript-type",
         "outputPath": "nope/missing.model.ts",
         "active": True, "verify": {"mode": "exists"}},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert any(x["failure_class"] == "projection-drift" and "missing" in x["detail"] for x in v)


def test_manifest_digest_mismatch_flagged():
    matrix = ca.load_matrix()
    fake = {"projections": [
        {"sourceSchema": "schemas/validation/wrp/work-request.schema.json",
         "targetFormat": "json-ld",
         "outputPath": "schemas/ontology/core/work-request.jsonld",
         "active": True, "verify": {"mode": "digest", "algorithm": "sha256", "digest": "0" * 64}},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert any(x["failure_class"] == "projection-drift" and "digest mismatch" in x["detail"] for x in v)


def test_manifest_digest_match_passes():
    matrix = ca.load_matrix()
    real_digest = ca.file_digest("schemas/ontology/core/work-request.jsonld")
    fake = {"projections": [
        {"sourceSchema": "schemas/validation/wrp/work-request.schema.json",
         "targetFormat": "json-ld",
         "outputPath": "schemas/ontology/core/work-request.jsonld",
         "active": True, "verify": {"mode": "digest", "algorithm": "sha256", "digest": real_digest}},
    ]}
    v = ca.check_manifest(matrix, manifest=fake)
    assert v == []


# ─── regenerate verify mode (TypeSpec codegen, ready-to-flip) ────────────────

REAL_WR_SRC = "schemas/validation/wrp/work-request.schema.json"


def _tmp_proj_dir():
    """Create a throwaway dir under the repo root so repo-relative outputPath
    and generator cwd (REPO_ROOT) both resolve. Caller must rmtree it."""
    d = tempfile.mkdtemp(dir=str(ca.REPO_ROOT), prefix=".authority-regenerate-test-")
    rel = os.path.relpath(d, str(ca.REPO_ROOT))
    return d, rel


def _manifest_with(output_rel, verify):
    return {"projections": [
        {"sourceSchema": REAL_WR_SRC,
         "targetFormat": "pydantic-model",
         "generator": "TypeSpec",
         "outputPath": output_rel,
         "lifecycle": "on-schema-change",
         "active": True,
         "verify": verify},
    ]}


def test_manifest_regenerate_runs_and_produces_output():
    matrix = ca.load_matrix()
    d, rel = _tmp_proj_dir()
    try:
        out = f"{rel}/out.txt"
        fake = _manifest_with(out, {
            "mode": "regenerate",
            "command": f"printf 'generated-v1' > {out}",
        })
        v = ca.check_manifest(matrix, manifest=fake)
        assert v == []
        assert (ca.REPO_ROOT / out).read_text() == "generated-v1"
    finally:
        shutil.rmtree(d)


def test_manifest_regenerate_command_failure_flagged():
    matrix = ca.load_matrix()
    d, rel = _tmp_proj_dir()
    try:
        out = f"{rel}/out.txt"
        fake = _manifest_with(out, {"mode": "regenerate", "command": "exit 3"})
        v = ca.check_manifest(matrix, manifest=fake)
        assert any(x["failure_class"] == "projection-drift"
                   and "regeneration failed" in x["detail"] and "exit 3" in x["detail"]
                   for x in v)
    finally:
        shutil.rmtree(d)


def test_manifest_regenerate_no_output_flagged():
    matrix = ca.load_matrix()
    d, rel = _tmp_proj_dir()
    try:
        out = f"{rel}/out.txt"
        fake = _manifest_with(out, {"mode": "regenerate", "command": "true"})  # runs, writes nothing
        v = ca.check_manifest(matrix, manifest=fake)
        assert any(x["failure_class"] == "projection-drift"
                   and "no output" in x["detail"] for x in v)
    finally:
        shutil.rmtree(d)


def test_manifest_regenerate_requires_command():
    matrix = ca.load_matrix()
    d, rel = _tmp_proj_dir()
    try:
        out = f"{rel}/out.txt"
        fake = _manifest_with(out, {"mode": "regenerate"})
        v = ca.check_manifest(matrix, manifest=fake)
        assert any(x["failure_class"] == "projection-drift"
                   and "requires a `command`" in x["detail"] for x in v)
    finally:
        shutil.rmtree(d)


def test_manifest_regenerate_digest_match_passes():
    matrix = ca.load_matrix()
    d, rel = _tmp_proj_dir()
    try:
        out = f"{rel}/out.txt"
        content = "generated-v1\n"
        digest = hashlib.sha256(content.encode()).hexdigest()
        fake = _manifest_with(out, {
            "mode": "regenerate",
            "command": f"printf 'generated-v1\\n' > {out}",
            "algorithm": "sha256",
            "digest": digest,
        })
        v = ca.check_manifest(matrix, manifest=fake)
        assert v == []
    finally:
        shutil.rmtree(d)


def test_manifest_regenerate_digest_mismatch_flagged():
    matrix = ca.load_matrix()
    d, rel = _tmp_proj_dir()
    try:
        out = f"{rel}/out.txt"
        # committed digest is for different content than the generator produces
        stale = hashlib.sha256(b"older-content").hexdigest()
        fake = _manifest_with(out, {
            "mode": "regenerate",
            "command": f"printf 'generated-v1' > {out}",
            "algorithm": "sha256",
            "digest": stale,
        })
        v = ca.check_manifest(matrix, manifest=fake)
        assert any(x["failure_class"] == "projection-drift"
                   and "committed projection is stale" in x["detail"] for x in v)
    finally:
        shutil.rmtree(d)


def test_manifest_regenerate_inactive_skipped():
    # inactive TypeSpec projections carry regenerate directives but must not
    # execute until flipped active (codegen has not landed yet)
    matrix = ca.load_matrix()
    d, rel = _tmp_proj_dir()
    try:
        out = f"{rel}/out.txt"
        fake = {"projections": [
            {"sourceSchema": REAL_WR_SRC,
             "targetFormat": "pydantic-model",
             "outputPath": out,
             "active": False,
             "verify": {"mode": "regenerate", "command": "definitely-not-a-real-command"}},
        ]}
        v = ca.check_manifest(matrix, manifest=fake)
        assert v == []
    finally:
        shutil.rmtree(d)


# ─── green: the committed matrix must validate ───────────────────────────────

def test_real_matrix_passes():
    matrix = ca.load_matrix()
    violations = ca.run_checks(matrix)
    assert violations == []
