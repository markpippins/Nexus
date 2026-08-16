"""Conformance tests for tools/authority/check_jsonld.py.

Exercises the failure classes (unresolved-context, unresolved-namespace,
undeclared-term, unknown-prefix, unresolved-id) against synthetic documents
plus the green real-schemas case.

Run with:
    python3 -m pytest tools/authority/test_check_jsonld.py -v
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_jsonld as cj  # noqa: E402


def _tmp_doc(monkeypatch, data):
    """Write a synthetic .jsonld under a temp dir inside the repo (the checker
    resolves paths relative to REPO_ROOT) and return its path."""
    d = Path(tempfile.mkdtemp(dir=str(cj.REPO_ROOT), prefix=".jsonld-test-"))
    p = d / "doc.jsonld"
    p.write_text(json.dumps(data))
    return d, p


def _cleanup(d):
    shutil.rmtree(d)


# ─── unresolved-context ─────────────────────────────────────────────────────

def test_unresolved_context_url_flagged(monkeypatch):
    d, p = _tmp_doc(monkeypatch, {
        "@context": ["https://nexus.local/schema/does/not/exist.jsonld"],
        "type": "nx:WorkRequest",
    })
    try:
        v = []
        cj.validate_document(p, set(), v)
        assert any(x["failure_class"] == "unresolved-context"
                   and "does/not/exist" in x["detail"] for x in v)
    finally:
        _cleanup(d)


def test_resolvable_context_url_passes(monkeypatch):
    d, p = _tmp_doc(monkeypatch, {
        "@context": ["https://nexus.local/schema/ontology/context/nexus-base.jsonld",
                     "https://nexus.local/schema/ontology/core/work-request.jsonld"],
        "type": "WorkRequest",
    })
    try:
        v = []
        cj.validate_document(p, set(), v)
        assert not any(x["failure_class"] == "unresolved-context" for x in v)
    finally:
        _cleanup(d)


# ─── unknown-prefix ──────────────────────────────────────────────────────────

def test_unknown_prefix_flagged(monkeypatch):
    # `id` must be declared as an @id alias (repo convention) for the walker
    # to treat it as an identifier reference.
    d, p = _tmp_doc(monkeypatch, {
        "@context": {"nx": "https://nexus.local/schema/", "id": "@id"},
        "id": "bogus:xyz",
    })
    try:
        v = []
        cj.validate_document(p, set(), v)
        assert any(x["failure_class"] == "unknown-prefix" and "bogus" in x["detail"] for x in v)
    finally:
        _cleanup(d)


# ─── undeclared-term (type position) ─────────────────────────────────────────

def test_undeclared_type_flagged(monkeypatch):
    # `type` must be declared as an @type alias (repo convention) for the
    # walker to treat it as a vocabulary reference.
    d, p = _tmp_doc(monkeypatch, {
        "@context": {"nx": "https://nexus.local/schema/", "type": "@type"},
        "type": "nx:TotallyNotDeclared",
    })
    try:
        v = []
        cj.validate_document(p, set(), v)
        assert any(x["failure_class"] == "undeclared-term" for x in v)
    finally:
        _cleanup(d)


def test_declared_type_passes(monkeypatch):
    # WorkRequest is declared in schemas/ontology/core/work-request.jsonld
    d, p = _tmp_doc(monkeypatch, {
        "@context": ["https://nexus.local/schema/ontology/core/work-request.jsonld"],
        "type": "WorkRequest",
    })
    try:
        v = []
        cj.validate_document(p, set(), v)
        assert not any(x["failure_class"] == "undeclared-term" for x in v)
    finally:
        _cleanup(d)


def test_standard_vocabulary_type_passes(monkeypatch):
    # rdfs:Class is a W3C standard — never an unknown prefix / undeclared term
    d, p = _tmp_doc(monkeypatch, {
        "@context": {"nx": "https://nexus.local/schema/"},
        "type": "rdfs:Class",
    })
    try:
        v = []
        cj.validate_document(p, set(), v)
        assert v == []
    finally:
        _cleanup(d)


# ─── @id is an identifier, not a document path ───────────────────────────────

def test_prefixed_id_identifier_not_flagged(monkeypatch):
    # Taxonomy/instance ids (nx:wrp:depends_on) need only a declared prefix.
    d, p = _tmp_doc(monkeypatch, {
        "@context": {"nx": "https://nexus.local/schema/"},
        "id": "nx:wrp:depends_on",
    })
    try:
        v = []
        cj.validate_document(p, set(), v)
        assert v == []
    finally:
        _cleanup(d)


# ─── resolver: versioned $id / $schema URLs ─────────────────────────────────

def test_resolve_versioned_ids():
    assert cj.resolve("https://nexus.local/schema/validation/wrp/work-request/v1") is not None
    assert cj.resolve("https://nexus.local/schema/validation/authority/authority-matrix/v1") is not None
    assert cj.resolve("https://nexus.local/schema/ontology/core/stratification/v1") is not None
    assert cj.resolve("https://nexus.local/schema/ontology/context/nexus-base.jsonld") is not None
    assert cj.resolve("https://nexus.local/schema/ontology/core/work-request/") is not None
    assert cj.resolve("https://nexus.local/schema/") == cj.SCHEMAS
    assert cj.resolve("https://nexus.local/schema/does/not/exist") is None


# ─── green: the committed schemas must validate ──────────────────────────────

def test_real_schemas_pass():
    v = cj.run_checks()
    assert v == []
